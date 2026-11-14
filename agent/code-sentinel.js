import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import { WebSocketServer } from "ws";
import {
  computeSecurityScore,
  runFullScan,
  scanDependencies,
  scanFile,
  scanRepoHygiene,
} from "./scanners.js";
import { applyFindingFix, restoreBackupSnapshot } from "./remediation.js";
import { sendReportEmail } from "../mcp/email.js";
import { getSupabaseAdmin } from "../mcp/admin.js";

const REPO_ROOT = process.cwd();
const STATE_FILE = path.join(REPO_ROOT, ".sentinel-state.json");
const SENTINEL_PORT = Number(process.env.SENTINEL_PORT || 3344);
const MAX_LOGS = 500;
const MAX_HISTORY = 30;

const DEFAULT_POLICY = {
  watchEnabled: true,
  autoFixMode: "review-first", // "review-first" | "guided-auto"
  notifyEmail: false,
  notifyEmailAddress: process.env.SENTINEL_NOTIFY_EMAIL || process.env.ADMIN_EMAILS?.split(",")[0]?.trim() || "",
  notifyCooldownMinutes: 30,
  runPreDeployGateOnFix: true,
};

function makeLogId() {
  return "log_" + Date.now() + "_" + crypto.randomBytes(3).toString("hex");
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      return {
        policy: { ...DEFAULT_POLICY, ...(parsed.policy || {}) },
        findings: Array.isArray(parsed.findings) ? parsed.findings : [],
        logs: Array.isArray(parsed.logs) ? parsed.logs : [],
        history: Array.isArray(parsed.history) ? parsed.history : [],
        lastScanAt: parsed.lastScanAt || null,
        lastScanDurationMs: parsed.lastScanDurationMs || 0,
        scannedFilesCount: parsed.scannedFilesCount || 0,
        lastEmailAlertAt: parsed.lastEmailAlertAt || null,
      };
    } catch {
      // Fall back to fresh state if corrupted
    }
  }
  return {
    policy: { ...DEFAULT_POLICY },
    findings: [],
    logs: [],
    history: [],
    lastScanAt: null,
    lastScanDurationMs: 0,
    scannedFilesCount: 0,
    lastEmailAlertAt: null,
  };
}

let state = loadState();
const wsClients = new Set();

function saveState() {
  try {
    state.summary = buildSummary();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
    syncStateToSupabase(false).catch(() => {});
  } catch (err) {
    console.error("[Code Sentinel] Failed to persist state:", err.message);
  }
}

function broadcast(event, payload) {
  const frame = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
  for (const client of wsClients) {
    if (client.readyState === 1) {
      try {
        client.send(frame);
      } catch {
        // Ignore broken sockets
      }
    }
  }
}

function appendLog(entry) {
  const record = {
    id: makeLogId(),
    timestamp: new Date().toISOString(),
    eventType: entry.eventType || "INFO",
    severity: entry.severity || "INFO",
    target: entry.target || "workspace",
    actor: entry.actor || "Sentinel Agent",
    outcome: entry.outcome || "OK",
    message: entry.message || "",
    details: entry.details || null,
  };
  state.logs = [record, ...state.logs].slice(0, MAX_LOGS);
  saveState();
  broadcast("LOG_APPENDED", record);
  return record;
}

function buildSummary() {
  const findings = state.findings || [];
  const active = findings.filter((f) => f.status !== "FIXED_VERIFIED" && f.status !== "IGNORED");
  return {
    daemonOnline: true,
    daemonStatus: {
      online: true,
      mode: "direct-daemon",
      hostname: os.hostname(),
      lastHeartbeatAt: new Date().toISOString(),
      watchEnabled: Boolean(state.policy.watchEnabled),
    },
    watchEnabled: Boolean(state.policy.watchEnabled),
    autoFixMode: state.policy.autoFixMode,
    score: computeSecurityScore(findings),
    totalFindings: findings.length,
    pendingReviewCount: active.length,
    autoFixableCount: active.filter((f) => f.autoFixable).length,
    fixedCount: findings.filter((f) => f.status === "FIXED_VERIFIED").length,
    ignoredCount: findings.filter((f) => f.status === "IGNORED").length,
    bySeverity: {
      CRITICAL: active.filter((f) => f.severity === "CRITICAL").length,
      HIGH: active.filter((f) => f.severity === "HIGH").length,
      MEDIUM: active.filter((f) => f.severity === "MEDIUM").length,
      LOW: active.filter((f) => f.severity === "LOW").length,
    },
    lastScanAt: state.lastScanAt,
    lastScanDurationMs: state.lastScanDurationMs,
    scannedFilesCount: state.scannedFilesCount,
    history: state.history,
    policy: state.policy,
  };
}

function mergeFindings(existingFindings, incomingFindings, scopeFilterFn = null) {
  const existingById = new Map(existingFindings.map((f) => [f.id, f]));
  const incomingById = new Map(incomingFindings.map((f) => [f.id, f]));

  const next = [];
  const newlyDetected = [];
  const resolvedManually = [];

  // Keep findings outside current scan scope (e.g., when scanning a single changed file)
  for (const oldF of existingFindings) {
    const inScope = scopeFilterFn ? scopeFilterFn(oldF) : true;
    if (!inScope) {
      next.push(oldF);
    } else if (!incomingById.has(oldF.id)) {
      if (oldF.status === "FIXED_VERIFIED" || oldF.status === "ROLLED_BACK") {
        // Keep recently fixed/rolled-back history items visible in dashboard
        next.push(oldF);
      } else if (oldF.status === "PENDING_REVIEW") {
        resolvedManually.push(oldF);
      }
    }
  }

  for (const inc of incomingFindings) {
    const prev = existingById.get(inc.id);
    if (prev) {
      if (prev.status === "IGNORED") {
        next.push({ ...inc, status: "IGNORED", ignoredReason: prev.ignoredReason, ignoredAt: prev.ignoredAt });
      } else {
        next.push({ ...inc, detectedAt: prev.detectedAt });
      }
    } else {
      next.push(inc);
      newlyDetected.push(inc);
    }
  }

  const sevRank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  next.sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9));

  return { merged: next, newlyDetected, resolvedManually };
}

async function maybeSendEmailAlert(newFindings) {
  if (!state.policy.notifyEmail || !state.policy.notifyEmailAddress) return;
  const urgent = newFindings.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH");
  if (urgent.length === 0) return;

  const cooldownMs = (Number(state.policy.notifyCooldownMinutes) || 30) * 60 * 1000;
  if (state.lastEmailAlertAt && Date.now() - new Date(state.lastEmailAlertAt).getTime() < cooldownMs) {
    return;
  }

  try {
    const rowsHtml = urgent
      .slice(0, 10)
      .map(
        (f) => `<tr>
          <td style="padding:8px;border:1px solid #cbd5e1;font-weight:bold;">${f.severity}</td>
          <td style="padding:8px;border:1px solid #cbd5e1;">${f.ruleId} — ${f.title}</td>
          <td style="padding:8px;border:1px solid #cbd5e1;">${f.filePath}:${f.lineStart}</td>
          <td style="padding:8px;border:1px solid #cbd5e1;">${(f.howToFix || [])[0] || ""}</td>
        </tr>`
      )
      .join("");

    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:680px;margin:auto;color:#0f172a;">
        <h2 style="color:#991b1b;">BudgetApp2025 Code Sentinel Alert (${urgent.length} Urgent Finding${urgent.length > 1 ? "s" : ""})</h2>
        <p>Real-time code scanning detected issues requiring your review in the <strong>Code Sentinel</strong> module.</p>
        <table style="border-collapse:collapse;width:100%;font-size:13px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:8px;border:1px solid #cbd5e1;text-align:left;">Severity</th>
              <th style="padding:8px;border:1px solid #cbd5e1;text-align:left;">Rule & Title</th>
              <th style="padding:8px;border:1px solid #cbd5e1;text-align:left;">Location</th>
              <th style="padding:8px;border:1px solid #cbd5e1;text-align:left;">How to Fix</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;

    await sendReportEmail(
      state.policy.notifyEmailAddress,
      `[Code Sentinel] ${urgent.length} ${urgent[0].severity} Code/Security Finding(s) Detected`,
      html
    );
    state.lastEmailAlertAt = new Date().toISOString();
    appendLog({
      eventType: "EMAIL_ALERT_SENT",
      severity: "HIGH",
      target: state.policy.notifyEmailAddress,
      outcome: "SENT",
      message: `Sent email alert for ${urgent.length} urgent finding(s).`,
    });
  } catch (err) {
    appendLog({
      eventType: "EMAIL_ALERT_FAILED",
      severity: "LOW",
      target: state.policy.notifyEmailAddress,
      outcome: "SKIPPED",
      message: `Email notification skipped: ${err.message}`,
    });
  }
}

function recordHistoryPoint() {
  const summary = buildSummary();
  state.history = [
    ...state.history,
    {
      timestamp: new Date().toISOString(),
      score: summary.score,
      critical: summary.bySeverity.CRITICAL,
      high: summary.bySeverity.HIGH,
      medium: summary.bySeverity.MEDIUM,
      low: summary.bySeverity.LOW,
      fixed: summary.fixedCount,
    },
  ].slice(-MAX_HISTORY);
}

async function handleFindingApproval(findingId, actor = "Admin User") {
  const idx = state.findings.findIndex((f) => f.id === findingId);
  if (idx === -1) return { ok: false, error: `Finding '${findingId}' not found.` };

  const finding = state.findings[idx];
  appendLog({
    eventType: "FIX_APPROVED",
    severity: finding.severity,
    target: `${finding.filePath}:${finding.lineStart}`,
    actor,
    outcome: "APPLYING",
    message: `Approved auto-fix for ${finding.ruleId} (${finding.title}).`,
  });

  const result = applyFindingFix(finding, REPO_ROOT, {
    runPreDeployGate: Boolean(state.policy.runPreDeployGateOnFix),
    rescanFileFn: (rel, root) => scanFile(rel, root),
  });

  if (result.ok) {
    state.findings[idx] = {
      ...finding,
      status: "FIXED_VERIFIED",
      fixedAt: new Date().toISOString(),
      fixedBy: actor,
      backupId: result.backupId,
      verificationMessage: result.message,
    };
    recordHistoryPoint();
    appendLog({
      eventType: "FIX_VERIFIED",
      severity: finding.severity,
      target: finding.filePath,
      actor: "Sentinel Verifier",
      outcome: "VERIFIED",
      message: result.message,
      details: { findingId, backupId: result.backupId, diff: finding.diff },
    });
    broadcast("FIX_VERIFIED", { finding: state.findings[idx], summary: buildSummary() });
    return { ok: true, finding: state.findings[idx], summary: buildSummary(), message: result.message };
  } else {
    state.findings[idx] = {
      ...finding,
      status: result.rolledBack ? "ROLLED_BACK" : finding.status,
      lastFixError: result.error,
      backupId: result.backupId || finding.backupId,
    };
    appendLog({
      eventType: result.rolledBack ? "FIX_ROLLED_BACK" : "FIX_FAILED",
      severity: "HIGH",
      target: finding.filePath,
      actor: "Sentinel Verifier",
      outcome: result.rolledBack ? "ROLLED_BACK" : "FAILED",
      message: result.error,
      details: { findingId, backupId: result.backupId },
    });
    broadcast("FIX_FAILED", { finding: state.findings[idx], error: result.error, summary: buildSummary() });
    return { ok: false, error: result.error, finding: state.findings[idx], summary: buildSummary() };
  }
}

async function executeFullScan(options = {}) {
  const { runNpmAudit = true, actor = "Sentinel Agent" } = options;
  broadcast("SCAN_STARTED", { scope: "full" });
  const result = runFullScan(REPO_ROOT, { runNpmAudit });
  const { merged, newlyDetected, resolvedManually } = mergeFindings(state.findings, result.findings);

  state.findings = merged;
  state.lastScanAt = result.completedAt;
  state.lastScanDurationMs = result.durationMs;
  state.scannedFilesCount = result.scannedFilesCount;
  recordHistoryPoint();

  appendLog({
    eventType: "FULL_SCAN_COMPLETE",
    severity: newlyDetected.some((f) => f.severity === "CRITICAL" || f.severity === "HIGH") ? "HIGH" : "INFO",
    target: `${result.scannedFilesCount} files`,
    actor,
    outcome: "DONE",
    message: `Scanned ${result.scannedFilesCount} files in ${result.durationMs}ms. Active findings: ${merged.filter((f) => f.status === "PENDING_REVIEW").length}, New: ${newlyDetected.length}, Score: ${computeSecurityScore(merged)}/100.`,
  });

  for (const resolved of resolvedManually) {
    appendLog({
      eventType: "RESOLVED_MANUALLY",
      severity: "INFO",
      target: `${resolved.filePath}:${resolved.lineStart}`,
      actor: "Developer",
      outcome: "RESOLVED",
      message: `Issue ${resolved.ruleId} no longer present after update.`,
    });
  }

  if (newlyDetected.length > 0) {
    broadcast("FINDING_DETECTED", { newFindings: newlyDetected, summary: buildSummary() });
    await maybeSendEmailAlert(newlyDetected);
  }

  broadcast("SCAN_COMPLETE", { summary: buildSummary(), findings: state.findings });
  saveState();
  return { summary: buildSummary(), findings: state.findings, newlyDetected };
}

async function handleFileChanged(relPath) {
  if (!state.policy.watchEnabled) return;
  const norm = relPath.replace(/\\/g, "/");
  if (
    norm.startsWith("node_modules/") ||
    norm.startsWith("dist/") ||
    norm.startsWith(".git/") ||
    norm.startsWith(".sentinel-")
  ) {
    return;
  }

  broadcast("SCAN_STARTED", { scope: norm });

  let incoming = [];
  let scopeFilter = (f) => f.filePath === norm;

  if (norm === "package.json" || norm === "package-lock.json") {
    incoming = [...scanFile("package.json", REPO_ROOT), ...scanDependencies(REPO_ROOT, { runNpmAudit: true })];
    scopeFilter = (f) => f.filePath === "package.json" || f.filePath === "package-lock.json";
  } else if (norm === ".gitignore" || norm === "vercel.json") {
    incoming = [...scanFile(norm, REPO_ROOT), ...scanRepoHygiene(REPO_ROOT)];
    scopeFilter = (f) => f.filePath === norm || f.ruleId === "SECRETS-ENV-001" || f.ruleId === "DOCTRINE-HONEY-003";
  } else {
    incoming = scanFile(norm, REPO_ROOT);
  }

  const { merged, newlyDetected, resolvedManually } = mergeFindings(state.findings, incoming, scopeFilter);
  state.findings = merged;
  state.lastScanAt = new Date().toISOString();

  if (newlyDetected.length > 0 || resolvedManually.length > 0) {
    recordHistoryPoint();
  }

  for (const f of newlyDetected) {
    appendLog({
      eventType: "FINDING_DETECTED",
      severity: f.severity,
      target: `${f.filePath}:${f.lineStart}`,
      actor: "Real-Time Watcher",
      outcome: "NOTIFY_USER",
      message: `${f.ruleId}: ${f.title}`,
      details: { findingId: f.id, howToFix: f.howToFix },
    });
  }

  for (const r of resolvedManually) {
    appendLog({
      eventType: "RESOLVED_MANUALLY",
      severity: "INFO",
      target: `${r.filePath}:${r.lineStart}`,
      actor: "Developer",
      outcome: "RESOLVED",
      message: `${r.ruleId} fixed in ${r.filePath}.`,
    });
  }

  if (newlyDetected.length > 0) {
    broadcast("FINDING_DETECTED", { newFindings: newlyDetected, summary: buildSummary() });
    await maybeSendEmailAlert(newlyDetected);

    if (state.policy.autoFixMode === "guided-auto") {
      for (const f of newlyDetected) {
        if (f.autoFixable && f.fixRisk === "safe-autofix") {
          await handleFindingApproval(f.id, "Sentinel Auto-Fix Policy");
        }
      }
    }
  }

  broadcast("SCAN_COMPLETE", { summary: buildSummary(), findings: state.findings });
  saveState();
}

function startWatcher() {
  const debounceTimers = new Map();
  const watchTargets = ["src", "api", "mcp", "scripts", "package.json", "vercel.json", ".gitignore"];

  for (const target of watchTargets) {
    const abs = path.join(REPO_ROOT, target);
    if (!fs.existsSync(abs)) continue;
    const isDir = fs.statSync(abs).isDirectory();

    try {
      fs.watch(abs, { recursive: isDir }, (_eventType, filename) => {
        const rel = isDir && filename ? path.join(target, filename) : target;
        const norm = rel.replace(/\\/g, "/");
        if (debounceTimers.has(norm)) clearTimeout(debounceTimers.get(norm));
        debounceTimers.set(
          norm,
          setTimeout(() => {
            debounceTimers.delete(norm);
            handleFileChanged(norm).catch((err) => {
              console.error("[Code Sentinel] Watch scan error:", err.message);
            });
          }, 350)
        );
      });
    } catch (err) {
      console.warn(`[Code Sentinel] Could not watch ${target}:`, err.message);
    }
  }

  appendLog({
    eventType: "WATCHER_STARTED",
    severity: "INFO",
    target: watchTargets.join(", "),
    outcome: "WATCHING",
    message: `Real-time Code Sentinel watcher active on port ${SENTINEL_PORT}.`,
  });
}

let lastSupabaseSyncAt = 0;
let isSyncingToSupabase = false;

async function syncStateToSupabase(force = false) {
  const now = Date.now();
  if (!force && (isSyncingToSupabase || now - lastSupabaseSyncAt < 3000)) return;
  isSyncingToSupabase = true;

  try {
    const admin = getSupabaseAdmin();
    if (!admin) return;

    lastSupabaseSyncAt = Date.now();
    const payload = {
      summary: {
        ...buildSummary(),
        daemonStatus: {
          online: true,
          mode: "direct-daemon",
          hostname: os.hostname(),
          lastHeartbeatAt: new Date().toISOString(),
          watchEnabled: Boolean(state.policy.watchEnabled),
        },
      },
      findings: state.findings.slice(0, 100),
      logs: state.logs.slice(0, 250),
      history: state.history.slice(-30),
      policy: state.policy,
      syncedAt: new Date().toISOString(),
    };

    const { data: rows, error: selectErr } = await admin
      .from("user_data")
      .select("user_id, budget_data");

    if (selectErr || !Array.isArray(rows) || rows.length === 0) return;

    for (const row of rows) {
      const nextBudgetData = {
        ...(row.budget_data || {}),
        codeSentinel: {
          ...(row.budget_data?.codeSentinel || {}),
          ...payload,
        },
      };
      await admin
        .from("user_data")
        .update({ budget_data: nextBudgetData, updated_at: new Date().toISOString() })
        .eq("user_id", row.user_id);
    }
  } catch {
    // Network / offline safe catch
  } finally {
    isSyncingToSupabase = false;
  }
}

let isProcessingApproval = false;
async function pollCloudApprovals() {
  if (isProcessingApproval) return;
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return;

    const { data: rows, error } = await admin
      .from("user_data")
      .select("user_id, budget_data");

    if (error || !Array.isArray(rows) || rows.length === 0) return;

    for (const row of rows) {
      const cs = row.budget_data?.codeSentinel;
      if (!cs) continue;

      // 1. Check if scan was requested from Vercel
      if (cs.scanRequested?.requestedAt) {
        const reqTime = new Date(cs.scanRequested.requestedAt).getTime();
        const lastScanTime = state.lastScanAt ? new Date(state.lastScanAt).getTime() : 0;
        if (reqTime > lastScanTime) {
          appendLog({
            eventType: "SCAN_REQUEST_RECEIVED",
            severity: "INFO",
            target: "workspace",
            actor: cs.scanRequested.requestedBy || "Cloud Admin",
            outcome: "TRIGGERED",
            message: `Remote scan request received from Vercel by ${cs.scanRequested.requestedBy || "Admin"}.`,
          });
          await executeFullScan({ runNpmAudit: false, actor: cs.scanRequested.requestedBy || "Cloud Admin" });
          const nextBudgetData = {
            ...(row.budget_data || {}),
            codeSentinel: {
              ...(row.budget_data?.codeSentinel || {}),
              scanRequested: null,
            },
          };
          await admin
            .from("user_data")
            .update({ budget_data: nextBudgetData })
            .eq("user_id", row.user_id);
          continue;
        }
      }

      // 2. Check for findings approved on Vercel awaiting daemon execution
      const cloudFindings = Array.isArray(cs.findings) ? cs.findings : [];
      const approvedQueued = cloudFindings.filter((f) => f.status === "APPROVED_QUEUED");

      if (approvedQueued.length > 0) {
        isProcessingApproval = true;
        try {
          for (const af of approvedQueued) {
            appendLog({
              eventType: "CLOUD_APPROVAL_RECEIVED",
              severity: af.severity,
              target: `${af.filePath}:${af.lineStart}`,
              actor: af.approvedBy || "Admin via Vercel",
              outcome: "EXECUTING_FIX",
              message: `Direct daemon picked up approved fix for ${af.ruleId} (${af.title}) approved by ${af.approvedBy || "Admin"}.`,
            });

            // Find in local state
            const localIdx = state.findings.findIndex((f) => f.id === af.id);
            if (localIdx !== -1) {
              const res = await handleFindingApproval(af.id, af.approvedBy || "Admin via Vercel");
              if (res.ok) {
                appendLog({
                  eventType: "CLOUD_APPROVAL_COMPLETED",
                  severity: af.severity,
                  target: af.filePath,
                  actor: "Direct Daemon",
                  outcome: "VERIFIED",
                  message: `Verified and applied approved fix for ${af.ruleId} in ${af.filePath}.`,
                });
              } else {
                appendLog({
                  eventType: "CLOUD_APPROVAL_FAILED",
                  severity: "HIGH",
                  target: af.filePath,
                  actor: "Direct Daemon",
                  outcome: "ROLLED_BACK",
                  message: `Fix failed verification: ${res.error}`,
                });
              }
            } else {
              // Apply by finding ID
              await handleFindingApproval(af.id, af.approvedBy || "Admin via Vercel");
            }
          }
          await syncStateToSupabase(true);
        } finally {
          isProcessingApproval = false;
        }
      }
    }
  } catch {
    // Ignore network blips
  }
}

function startCloudSyncLoop() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    console.log("ℹ️  Direct Daemon running in local-only mode (SUPABASE_SERVICE_ROLE_KEY not configured).");
    return;
  }
  console.log("☁️  Direct Daemon cloud link active: Supabase direct synchronization & approval queue polling enabled.");

  // Initial sync to cloud
  syncStateToSupabase(true).catch(() => {});

  // Poll cloud queue and send heartbeats every 4.5 seconds
  setInterval(() => {
    pollCloudApprovals().catch(() => {});
    syncStateToSupabase(false).catch(() => {});
  }, 4500);
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "http://localhost:5173",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(data));
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      return sendJson(res, 200, { ok: true });
    }

    const reqUrl = new URL(req.url || "/", `http://127.0.0.1:${SENTINEL_PORT}`);
    const pathname = reqUrl.pathname;

    if (req.method === "GET" && pathname === "/status") {
      return sendJson(res, 200, { ok: true, summary: buildSummary() });
    }
    if (req.method === "GET" && pathname === "/findings") {
      return sendJson(res, 200, { ok: true, summary: buildSummary(), findings: state.findings });
    }
    if (req.method === "GET" && pathname === "/logs") {
      return sendJson(res, 200, { ok: true, logs: state.logs });
    }

    if (req.method === "POST" && pathname === "/scan") {
      const body = await readJsonBody(req);
      const result = await executeFullScan({
        runNpmAudit: body.runNpmAudit !== false,
        actor: body.actor || "Admin User",
      });
      return sendJson(res, 200, { ok: true, ...result });
    }

    if (req.method === "POST" && pathname === "/approve-fix") {
      const body = await readJsonBody(req);
      const result = await handleFindingApproval(body.id, body.actor || "Admin User");
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (req.method === "POST" && pathname === "/ignore") {
      const body = await readJsonBody(req);
      const idx = state.findings.findIndex((f) => f.id === body.id);
      if (idx === -1) return sendJson(res, 404, { ok: false, error: "Finding not found." });
      state.findings[idx] = {
        ...state.findings[idx],
        status: "IGNORED",
        ignoredReason: String(body.reason || "Reviewed and accepted by admin"),
        ignoredAt: new Date().toISOString(),
      };
      appendLog({
        eventType: "FINDING_IGNORED",
        severity: "INFO",
        target: `${state.findings[idx].filePath}:${state.findings[idx].lineStart}`,
        actor: body.actor || "Admin User",
        outcome: "IGNORED",
        message: `Ignored ${state.findings[idx].ruleId}: ${state.findings[idx].ignoredReason}`,
      });
      broadcast("SCAN_COMPLETE", { summary: buildSummary(), findings: state.findings });
      saveState();
      return sendJson(res, 200, { ok: true, finding: state.findings[idx], summary: buildSummary() });
    }

    if (req.method === "POST" && pathname === "/reopen") {
      const body = await readJsonBody(req);
      const idx = state.findings.findIndex((f) => f.id === body.id);
      if (idx === -1) return sendJson(res, 404, { ok: false, error: "Finding not found." });
      state.findings[idx] = {
        ...state.findings[idx],
        status: "PENDING_REVIEW",
        ignoredReason: null,
      };
      appendLog({
        eventType: "FINDING_REOPENED",
        severity: state.findings[idx].severity,
        target: state.findings[idx].filePath,
        actor: body.actor || "Admin User",
        outcome: "PENDING_REVIEW",
        message: `Re-opened ${state.findings[idx].ruleId} for review.`,
      });
      broadcast("SCAN_COMPLETE", { summary: buildSummary(), findings: state.findings });
      saveState();
      return sendJson(res, 200, { ok: true, finding: state.findings[idx], summary: buildSummary() });
    }

    if (req.method === "POST" && pathname === "/rollback") {
      const body = await readJsonBody(req);
      try {
        const resRestore = restoreBackupSnapshot(REPO_ROOT, body.backupId);
        if (body.findingId) {
          const idx = state.findings.findIndex((f) => f.id === body.findingId);
          if (idx !== -1) {
            state.findings[idx] = {
              ...state.findings[idx],
              status: "PENDING_REVIEW",
              rolledBackAt: resRestore.restoredAt,
            };
          }
        }
        appendLog({
          eventType: "MANUAL_ROLLBACK",
          severity: "HIGH",
          target: resRestore.restoredFiles.join(", "),
          actor: body.actor || "Admin User",
          outcome: "ROLLED_BACK",
          message: `Restored backup ${resRestore.backupId} (${resRestore.restoredFiles.join(", ")}).`,
        });
        broadcast("SCAN_COMPLETE", { summary: buildSummary(), findings: state.findings });
        saveState();
        return sendJson(res, 200, { ok: true, ...resRestore, summary: buildSummary(), findings: state.findings });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }
    }

    if (req.method === "POST" && pathname === "/policy") {
      const body = await readJsonBody(req);
      state.policy = {
        ...state.policy,
        ...(typeof body.watchEnabled === "boolean" ? { watchEnabled: body.watchEnabled } : {}),
        ...(body.autoFixMode === "review-first" || body.autoFixMode === "guided-auto"
          ? { autoFixMode: body.autoFixMode }
          : {}),
        ...(typeof body.notifyEmail === "boolean" ? { notifyEmail: body.notifyEmail } : {}),
        ...(typeof body.notifyEmailAddress === "string" ? { notifyEmailAddress: body.notifyEmailAddress.trim() } : {}),
        ...(typeof body.runPreDeployGateOnFix === "boolean"
          ? { runPreDeployGateOnFix: body.runPreDeployGateOnFix }
          : {}),
      };
      appendLog({
        eventType: "POLICY_UPDATED",
        severity: "INFO",
        target: "sentinel-policy",
        actor: body.actor || "Admin User",
        outcome: "SAVED",
        message: `Policy updated: mode=${state.policy.autoFixMode}, watch=${state.policy.watchEnabled}, email=${state.policy.notifyEmail}.`,
      });
      broadcast("STATUS_UPDATE", { summary: buildSummary() });
      saveState();
      return sendJson(res, 200, { ok: true, summary: buildSummary() });
    }

    return sendJson(res, 404, { ok: false, error: `Unknown endpoint: ${pathname}` });
  });

  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws) => {
    wsClients.add(ws);
    ws.send(
      JSON.stringify({
        event: "CONNECTED",
        payload: { summary: buildSummary(), findings: state.findings, logs: state.logs.slice(0, 100) },
        timestamp: new Date().toISOString(),
      })
    );
    ws.on("close", () => wsClients.delete(ws));
  });

  server.listen(SENTINEL_PORT, "127.0.0.1", () => {
    console.log(`🛡️  Code Sentinel Daemon listening on http://127.0.0.1:${SENTINEL_PORT} (WS active)`);
  });
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const isWatch = args.has("--watch");
  const isScan = args.has("--scan") || !isWatch;

  if (isScan) {
    const res = await executeFullScan({ runNpmAudit: !args.has("--no-audit"), actor: "CLI Scan" });
    console.log(
      `🛡️  Code Sentinel Scan Complete: ${res.summary.scannedFilesCount} files, Score ${res.summary.score}/100, Pending ${res.summary.pendingReviewCount}`
    );
  }

  if (isWatch) {
    startServer();
    startWatcher();
    startCloudSyncLoop();
  }
}

main().catch((err) => {
  console.error("[Code Sentinel] Fatal error:", err);
  process.exit(1);
});

