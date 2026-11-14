import fs from "node:fs";
import path from "node:path";
import { verifyAdmin, getRequestBody, getSupabaseAdmin } from "./admin.js";

const STATE_FILE = path.join(process.cwd(), ".sentinel-state.json");

function readLocalState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

export default async function codeSentinelApiHandler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const auth = await verifyAdmin(req);
  if (!auth.authorized) {
    return res.status(403).json({ ok: false, error: auth.error || "Admin access required." });
  }

  const adminClient = getSupabaseAdmin();
  const userEmail = auth.user?.email || "Admin";

  if (req.method === "GET") {
    const localState = readLocalState();
    if (localState) {
      const findings = localState.findings || [];
      const active = findings.filter((f) => f.status !== "FIXED_VERIFIED" && f.status !== "IGNORED");
      const summary = localState.summary || {
        daemonOnline: true,
        watchEnabled: Boolean(localState.policy?.watchEnabled),
        autoFixMode: localState.policy?.autoFixMode || "review-first",
        score: Math.max(0, 100 - active.length * 12),
        totalFindings: findings.length,
        activeCount: active.length,
        pendingCount: active.filter((f) => f.status === "PENDING_REVIEW").length,
        fixedCount: findings.filter((f) => f.status === "FIXED_VERIFIED").length,
        ignoredCount: findings.filter((f) => f.status === "IGNORED").length,
      };
      return res.status(200).json({ ok: true, source: "local-state", ...localState, summary });
    }

    if (adminClient && auth.user?.id) {
      const { data, error } = await adminClient
        .from("user_data")
        .select("budget_data")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      if (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }

      const cs = data?.budget_data?.codeSentinel || { findings: [], logs: [], history: [], policy: {} };
      const lastHeartbeat = cs.summary?.daemonStatus?.lastHeartbeatAt;
      const isHeartbeatFresh = lastHeartbeat && (Date.now() - new Date(lastHeartbeat).getTime() < 45000);

      const enrichedSummary = {
        ...(cs.summary || {}),
        daemonOnline: Boolean(isHeartbeatFresh),
        daemonMode: isHeartbeatFresh ? "cloud-direct" : "offline-snapshot",
      };

      return res.status(200).json({
        ok: true,
        source: "supabase-cloud",
        ...cs,
        summary: enrichedSummary,
      });
    }

    return res.status(200).json({ ok: true, source: "empty", findings: [], logs: [], history: [], policy: {} });
  }

  if (req.method === "POST") {
    const body = await getRequestBody(req);
    const action = body.action || "sync";

    if (!adminClient || !auth.user?.id) {
      return res.status(500).json({ ok: false, error: "Database not configured or unauthorized." });
    }

    const { data: row, error: fetchErr } = await adminClient
      .from("user_data")
      .select("budget_data")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (fetchErr) {
      return res.status(500).json({ ok: false, error: fetchErr.message });
    }

    const budgetData = row?.budget_data || {};
    const cs = budgetData.codeSentinel || { findings: [], logs: [], history: [], policy: {} };
    const findings = Array.isArray(cs.findings) ? [...cs.findings] : [];
    const logs = Array.isArray(cs.logs) ? [...cs.logs] : [];
    const nowIso = new Date().toISOString();

    // 1. APPROVE ACTION (Approved first before fixing!)
    if (action === "approve") {
      const idx = findings.findIndex((f) => f.id === body.id);
      if (idx === -1) {
        return res.status(404).json({ ok: false, error: `Finding '${body.id}' not found.` });
      }

      const finding = findings[idx];
      const updatedFinding = {
        ...finding,
        status: "APPROVED_QUEUED",
        approvedAt: nowIso,
        approvedBy: userEmail,
      };
      findings[idx] = updatedFinding;

      const logEntry = {
        id: "log_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        timestamp: nowIso,
        eventType: "FIX_APPROVED_QUEUED",
        severity: finding.severity || "MEDIUM",
        target: `${finding.filePath}:${finding.lineStart}`,
        actor: userEmail,
        outcome: "QUEUED",
        message: `Approved fix for ${finding.ruleId} (${finding.title}) via Vercel Dashboard — queued for Direct Daemon execution on developer PC.`,
      };
      const nextLogs = [logEntry, ...logs].slice(0, 250);

      const nextBudgetData = {
        ...budgetData,
        codeSentinel: {
          ...cs,
          findings,
          logs: nextLogs,
          syncedAt: nowIso,
        },
      };

      const { error: saveErr } = await adminClient
        .from("user_data")
        .update({ budget_data: nextBudgetData, updated_at: nowIso })
        .eq("user_id", auth.user.id);

      if (saveErr) return res.status(500).json({ ok: false, error: saveErr.message });

      return res.status(200).json({
        ok: true,
        finding: updatedFinding,
        summary: cs.summary,
        message: `Fix for ${finding.ruleId} approved! Queued for Direct Daemon to apply and verify.`,
      });
    }

    // 2. IGNORE ACTION
    if (action === "ignore") {
      const idx = findings.findIndex((f) => f.id === body.id);
      if (idx === -1) return res.status(404).json({ ok: false, error: "Finding not found." });

      const updatedFinding = {
        ...findings[idx],
        status: "IGNORED",
        ignoredReason: String(body.reason || "Ignored by administrator"),
        ignoredAt: nowIso,
        ignoredBy: userEmail,
      };
      findings[idx] = updatedFinding;

      const logEntry = {
        id: "log_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        timestamp: nowIso,
        eventType: "FINDING_IGNORED",
        severity: "INFO",
        target: `${updatedFinding.filePath}:${updatedFinding.lineStart}`,
        actor: userEmail,
        outcome: "IGNORED",
        message: `Ignored ${updatedFinding.ruleId}: ${updatedFinding.ignoredReason}`,
      };
      const nextLogs = [logEntry, ...logs].slice(0, 250);

      const nextBudgetData = {
        ...budgetData,
        codeSentinel: {
          ...cs,
          findings,
          logs: nextLogs,
          syncedAt: nowIso,
        },
      };

      await adminClient
        .from("user_data")
        .update({ budget_data: nextBudgetData, updated_at: nowIso })
        .eq("user_id", auth.user.id);

      return res.status(200).json({ ok: true, finding: updatedFinding, summary: cs.summary });
    }

    // 3. REOPEN ACTION
    if (action === "reopen") {
      const idx = findings.findIndex((f) => f.id === body.id);
      if (idx === -1) return res.status(404).json({ ok: false, error: "Finding not found." });

      const updatedFinding = {
        ...findings[idx],
        status: "PENDING_REVIEW",
        ignoredReason: null,
        ignoredAt: null,
        approvedAt: null,
        approvedBy: null,
      };
      findings[idx] = updatedFinding;

      const logEntry = {
        id: "log_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        timestamp: nowIso,
        eventType: "FINDING_REOPENED",
        severity: updatedFinding.severity || "INFO",
        target: updatedFinding.filePath,
        actor: userEmail,
        outcome: "PENDING_REVIEW",
        message: `Re-opened ${updatedFinding.ruleId} for human review.`,
      };
      const nextLogs = [logEntry, ...logs].slice(0, 250);

      const nextBudgetData = {
        ...budgetData,
        codeSentinel: {
          ...cs,
          findings,
          logs: nextLogs,
          syncedAt: nowIso,
        },
      };

      await adminClient
        .from("user_data")
        .update({ budget_data: nextBudgetData, updated_at: nowIso })
        .eq("user_id", auth.user.id);

      return res.status(200).json({ ok: true, finding: updatedFinding, summary: cs.summary });
    }

    // 4. REQUEST SCAN ACTION (From Vercel)
    if (action === "request_scan") {
      const logEntry = {
        id: "log_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        timestamp: nowIso,
        eventType: "SCAN_REQUESTED",
        severity: "INFO",
        target: "workspace",
        actor: userEmail,
        outcome: "QUEUED",
        message: `Code Sentinel full scan requested by ${userEmail} via Vercel Dashboard.`,
      };
      const nextLogs = [logEntry, ...logs].slice(0, 250);

      const nextBudgetData = {
        ...budgetData,
        codeSentinel: {
          ...cs,
          scanRequested: { requestedAt: nowIso, requestedBy: userEmail },
          logs: nextLogs,
          syncedAt: nowIso,
        },
      };

      await adminClient
        .from("user_data")
        .update({ budget_data: nextBudgetData, updated_at: nowIso })
        .eq("user_id", auth.user.id);

      return res.status(200).json({ ok: true, message: "Scan requested. Direct daemon will trigger scan on PC." });
    }

    // 5. POLICY ACTION
    if (action === "policy") {
      const nextPolicy = { ...(cs.policy || {}), ...(body.policy || {}) };
      const nextBudgetData = {
        ...budgetData,
        codeSentinel: {
          ...cs,
          policy: nextPolicy,
          syncedAt: nowIso,
        },
      };

      await adminClient
        .from("user_data")
        .update({ budget_data: nextBudgetData, updated_at: nowIso })
        .eq("user_id", auth.user.id);

      return res.status(200).json({ ok: true, policy: nextPolicy });
    }

    // 6. SYNC ACTION (From Direct Daemon)
    if (action === "sync") {
      const nextBudgetData = {
        ...budgetData,
        codeSentinel: {
          summary: body.summary || cs.summary || null,
          findings: Array.isArray(body.findings) ? body.findings.slice(0, 100) : cs.findings || [],
          logs: Array.isArray(body.logs) ? body.logs.slice(0, 250) : cs.logs || [],
          history: Array.isArray(body.history) ? body.history.slice(-30) : cs.history || [],
          policy: body.policy || cs.policy || {},
          syncedAt: nowIso,
        },
      };

      const { error: saveErr } = await adminClient
        .from("user_data")
        .update({ budget_data: nextBudgetData, updated_at: nowIso })
        .eq("user_id", auth.user.id);

      if (saveErr) return res.status(500).json({ ok: false, error: saveErr.message });
      return res.status(200).json({ ok: true, synced: true });
    }

    return res.status(400).json({ ok: false, error: `Unsupported action '${action}'.` });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed." });
}
