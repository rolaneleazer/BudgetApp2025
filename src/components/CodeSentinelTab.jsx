import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

// Solid-color DTCG-aligned palette (Zero gradients per DOCTRINE.md Rule 2)
const PALETTE = {
  bg: "#020814",
  panel: "#07111f",
  card: "#0f1a2a",
  cardElevated: "#101d31",
  highContrast: "#050b16",
  border: "#1c2b42",
  text: "#ffffff",
  soft: "#eef5ff",
  muted: "#9fb1c9",
  green: "#24d17e",
  greenBg: "#0a2e1f",
  red: "#ff514f",
  redBg: "#3b0d11",
  amber: "#f2a71b",
  amberBg: "#332206",
  blue: "#4b8dff",
  blueBg: "#0d2347",
  teal: "#30d6b0",
  purple: "#7257ff",
};

const SEV_STYLE = {
  CRITICAL: { fg: "#ffffff", bg: "#991b1b", border: "#ff514f", label: "CRITICAL" },
  HIGH: { fg: "#ffffff", bg: "#9a3412", border: "#fb923c", label: "HIGH" },
  MEDIUM: { fg: "#050b16", bg: "#f2a71b", border: "#fbbf24", label: "MEDIUM" },
  LOW: { fg: "#eef5ff", bg: "#1e3a8a", border: "#60a5fa", label: "LOW" },
  INFO: { fg: "#eef5ff", bg: "#101d31", border: "#1c2b42", label: "INFO" },
};

const STATUS_STYLE = {
  PENDING_REVIEW: { fg: "#fbbf24", bg: "#332206", label: "Awaiting Approval" },
  APPROVED_QUEUED: { fg: "#38bdf8", bg: "#0d2347", label: "Approved & Queued" },
  FIXED_VERIFIED: { fg: "#4ade80", bg: "#0a2e1f", label: "Verified & Fixed" },
  ROLLED_BACK: { fg: "#fca5a5", bg: "#3b0d11", label: "Rolled Back" },
  IGNORED: { fg: "#9fb1c9", bg: "#101d31", label: "Ignored" },
};

function solidBtnStyle({ bg = PALETTE.cardElevated, fg = PALETTE.text, border = PALETTE.border, disabled = false }) {
  return {
    minHeight: 44,
    padding: "10px 16px",
    borderRadius: 8,
    border: `2px solid ${border}`,
    backgroundColor: bg,
    color: fg,
    fontSize: 13,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  };
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Real-time hook connecting App.jsx to the local Code Sentinel WebSocket daemon
 * and Supabase cloud API with direct-daemon queue support so approval and history
 * work seamlessly on both localhost and Vercel deployments.
 */
export function useCodeSentinelLive({ budgetData, setBudgetData, session, canWrite, isAdmin }) {
  const fallback = budgetData?.codeSentinel || {};
  const [daemonOnline, setDaemonOnline] = useState(false);
  const [daemonMode, setDaemonMode] = useState("checking"); // "local-ws" | "cloud-direct" | "offline-snapshot"
  const [scanning, setScanning] = useState(false);
  const [summary, setSummary] = useState(() => fallback.summary || null);
  const [findings, setFindings] = useState(() => (Array.isArray(fallback.findings) ? fallback.findings : []));
  const [logs, setLogs] = useState(() => (Array.isArray(fallback.logs) ? fallback.logs : []));
  const [liveToast, setLiveToast] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [lastError, setLastError] = useState(null);
  const wsRef = useRef(null);

  const persistSnapshot = useCallback(
    (nextSummary, nextFindings, nextLogs) => {
      if (!canWrite || typeof setBudgetData !== "function") return;
      setBudgetData((prev) => ({
        ...(prev || {}),
        codeSentinel: {
          summary: nextSummary || prev?.codeSentinel?.summary || null,
          findings: Array.isArray(nextFindings) ? nextFindings.slice(0, 100) : prev?.codeSentinel?.findings || [],
          logs: Array.isArray(nextLogs) ? nextLogs.slice(0, 250) : prev?.codeSentinel?.logs || [],
          syncedAt: new Date().toISOString(),
        },
      }));
    },
    [canWrite, setBudgetData]
  );

  const fetchFromDaemon = useCallback(async () => {
    try {
      const [fRes, lRes] = await Promise.all([
        fetch("/sentinel-api/findings"),
        fetch("/sentinel-api/logs"),
      ]);
      if (!fRes.ok) throw new Error("Daemon unavailable");
      const fJson = await fRes.json();
      const lJson = lRes.ok ? await lRes.json() : { logs: [] };
      setDaemonOnline(true);
      setDaemonMode("local-ws");
      setSummary(fJson.summary || null);
      setFindings(Array.isArray(fJson.findings) ? fJson.findings : []);
      setLogs(Array.isArray(lJson.logs) ? lJson.logs : []);
      setLastError(null);
      persistSnapshot(fJson.summary, fJson.findings, lJson.logs);
      return true;
    } catch {
      // Fallback to cloud API (Vercel deployment mode)
      if (session?.access_token) {
        try {
          const res = await fetch("/api/admin/code-sentinel", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) {
            const data = await res.json();
            const sum = data.summary || {};
            const lastBeat = sum.daemonStatus?.lastHeartbeatAt;
            const isFresh = lastBeat && Date.now() - new Date(lastBeat).getTime() < 45000;
            setDaemonOnline(Boolean(isFresh));
            setDaemonMode(isFresh ? "cloud-direct" : "offline-snapshot");
            if (Array.isArray(data.findings)) setFindings(data.findings);
            if (Array.isArray(data.logs)) setLogs(data.logs);
            if (data.summary) setSummary(data.summary);
            setLastError(null);
            persistSnapshot(data.summary, data.findings, data.logs);
            return true;
          }
        } catch {
          // Offline / local storage mode
        }
      }
      setDaemonOnline(false);
      setDaemonMode("offline-snapshot");
      return false;
    }
  }, [persistSnapshot, session?.access_token]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchFromDaemon();

    let cancelled = false;
    let reconnectTimer = null;

    const connectWs = () => {
      if (cancelled || typeof window === "undefined") return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${window.location.host}/sentinel-ws`;
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setDaemonOnline(true);
          setDaemonMode("local-ws");
          setLastError(null);
        };

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            const { event, payload } = msg;
            if (event === "CONNECTED") {
              setDaemonOnline(true);
              setDaemonMode("local-ws");
              if (payload?.summary) setSummary(payload.summary);
              if (Array.isArray(payload?.findings)) setFindings(payload.findings);
              if (Array.isArray(payload?.logs)) setLogs(payload.logs);
            } else if (event === "SCAN_STARTED") {
              setScanning(true);
            } else if (event === "SCAN_COMPLETE") {
              setScanning(false);
              if (payload?.summary) setSummary(payload.summary);
              if (Array.isArray(payload?.findings)) setFindings(payload.findings);
            } else if (event === "STATUS_UPDATE") {
              if (payload?.summary) setSummary(payload.summary);
            } else if (event === "LOG_APPENDED" && payload) {
              setLogs((prev) => [payload, ...prev].slice(0, 500));
            } else if (event === "FINDING_DETECTED") {
              if (payload?.summary) setSummary(payload.summary);
              const list = payload?.newFindings || [];
              if (list.length > 0) {
                const top = list[0];
                setLiveToast({
                  id: `${Date.now()}`,
                  severity: top.severity,
                  title: `${list.length} Code Finding${list.length > 1 ? "s" : ""} — Awaiting Approval`,
                  message: `${top.ruleId}: ${top.title} (${top.filePath}:${top.lineStart})`,
                  findingId: top.id,
                });
              }
            } else if (event === "FIX_VERIFIED") {
              if (payload?.summary) setSummary(payload.summary);
              if (payload?.finding) {
                setFindings((prev) => prev.map((f) => (f.id === payload.finding.id ? payload.finding : f)));
                setLiveToast({
                  id: `${Date.now()}`,
                  severity: "INFO",
                  title: "Fix Verified & Applied",
                  message: `${payload.finding.filePath} passed Quality Gate.`,
                  findingId: payload.finding.id,
                });
              }
            } else if (event === "FIX_FAILED") {
              if (payload?.summary) setSummary(payload.summary);
              if (payload?.finding) {
                setFindings((prev) => prev.map((f) => (f.id === payload.finding.id ? payload.finding : f)));
              }
              setLiveToast({
                id: `${Date.now()}`,
                severity: "CRITICAL",
                title: "Fix Verification Failed — Rolled Back",
                message: payload?.error || "Patch was safely rolled back.",
              });
            }
          } catch {
            // Ignore malformed WS frame
          }
        };

        ws.onclose = () => {
          if (!cancelled) {
            reconnectTimer = setTimeout(connectWs, 6000);
          }
        };
        ws.onerror = () => {
          ws.close();
        };
      } catch {
        // Fallback to cloud sync polling
      }
    };

    connectWs();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [isAdmin, fetchFromDaemon]);

  const callDaemonPost = useCallback(
    async (endpoint, body = {}) => {
      setActionBusy(true);
      setLastError(null);
      try {
        if (daemonMode === "local-ws") {
          const res = await fetch(`/sentinel-api${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...body,
              actor: session?.user?.email || "Admin",
            }),
          });
          const data = await res.json();
          if (!res.ok || data.ok === false) {
            throw new Error(data.error || `Request failed (${res.status})`);
          }
          if (data.summary) setSummary(data.summary);
          if (Array.isArray(data.findings)) setFindings(data.findings);
          if (data.finding) {
            setFindings((prev) => prev.map((f) => (f.id === data.finding.id ? data.finding : f)));
          }
          await fetchFromDaemon();
          return { ok: true, data };
        } else {
          // Cloud mode (Vercel) — route via /api/admin/code-sentinel
          const actionMap = {
            "/approve-fix": "approve",
            "/ignore": "ignore",
            "/reopen": "reopen",
            "/scan": "request_scan",
            "/policy": "policy",
            "/rollback": "rollback",
          };
          const action = actionMap[endpoint] || "sync";
          const res = await fetch("/api/admin/code-sentinel", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({
              action,
              ...body,
              actor: session?.user?.email || "Admin",
            }),
          });
          const data = await res.json();
          if (!res.ok || data.ok === false) {
            throw new Error(data.error || `Request failed (${res.status})`);
          }
          if (data.finding) {
            setFindings((prev) => prev.map((f) => (f.id === data.finding.id ? data.finding : f)));
          }
          await fetchFromDaemon();
          return { ok: true, data };
        }
      } catch (err) {
        setLastError(err.message);
        return { ok: false, error: err.message };
      } finally {
        setActionBusy(false);
      }
    },
    [daemonMode, fetchFromDaemon, session?.access_token, session?.user?.email]
  );

  const pendingCount = useMemo(
    () => findings.filter((f) => f.status === "PENDING_REVIEW").length,
    [findings]
  );
  const approvedCount = useMemo(
    () => findings.filter((f) => f.status === "APPROVED_QUEUED").length,
    [findings]
  );

  return {
    daemonOnline,
    daemonMode,
    scanning,
    summary,
    findings,
    logs,
    pendingCount,
    approvedCount,
    liveToast,
    dismissToast: () => setLiveToast(null),
    actionBusy,
    lastError,
    refresh: fetchFromDaemon,
    runScan: (runNpmAudit = true) => callDaemonPost("/scan", { runNpmAudit }),
    approveFix: (id) => callDaemonPost("/approve-fix", { id }),
    ignoreFinding: (id, reason) => callDaemonPost("/ignore", { id, reason }),
    reopenFinding: (id) => callDaemonPost("/reopen", { id }),
    rollbackFix: (backupId, findingId) => callDaemonPost("/rollback", { backupId, findingId }),
    updatePolicy: (policyUpdates) => callDaemonPost("/policy", policyUpdates),
  };
}

/**
 * Floating real-time notification banner rendered in App.jsx when Code Sentinel detects issues.
 */
export function CodeSentinelNotificationBanner({ toast, onDismiss, onReview }) {
  if (!toast) return null;
  const sev = SEV_STYLE[toast.severity] || SEV_STYLE.INFO;
  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        zIndex: 99980,
        maxWidth: 440,
        backgroundColor: PALETTE.highContrast,
        border: `2px solid ${sev.border}`,
        borderRadius: 12,
        padding: 16,
        boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
        color: PALETTE.text,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span
          style={{
            backgroundColor: sev.bg,
            color: sev.fg,
            border: `1px solid ${sev.border}`,
            padding: "3px 9px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          🛡️ CODE SENTINEL · {sev.label}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            backgroundColor: "transparent",
            border: `1px solid ${PALETTE.border}`,
            color: PALETTE.muted,
            borderRadius: 6,
            padding: "4px 10px",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Dismiss
        </button>
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{toast.title}</div>
      <div style={{ fontSize: 13, color: PALETTE.soft, marginBottom: 12, lineHeight: 1.45 }}>{toast.message}</div>
      <button
        type="button"
        onClick={() => onReview(toast.findingId)}
        style={solidBtnStyle({ bg: PALETTE.blueBg, fg: PALETTE.text, border: PALETTE.blue })}
      >
        🔍 Review & Approve Fix
      </button>
    </div>
  );
}

export default function CodeSentinelTab({
  sentinel,
  budgetData,
  setBudgetData,
  sm,
  canUpdate,
  setTab,
  onAppendSecurityLog,
  initialFindingId,
}) {
  const [subView, setSubView] = useState("dashboard"); // "dashboard" | "history" | "logs"
  const [sevFilter, setSevFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("PENDING_REVIEW");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [ignoreReason, setIgnoreReason] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);
  const [logSevFilter, setLogSevFilter] = useState("ALL");
  const [logSearch, setLogSearch] = useState("");
  const [feedbackBanner, setFeedbackBanner] = useState(null);

  const findings = sentinel?.findings || [];
  const logs = sentinel?.logs || [];
  const summary = sentinel?.summary || {
    score: 100,
    pendingReviewCount: 0,
    autoFixableCount: 0,
    fixedCount: 0,
    ignoredCount: 0,
    bySeverity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
    history: [],
    policy: { watchEnabled: true, autoFixMode: "review-first", notifyEmail: false },
  };
  const policy = summary.policy || {};

  // Auto-open finding modal if navigated from real-time toast notification
  useEffect(() => {
    if (!initialFindingId) return;
    const match = findings.find((f) => f.id === initialFindingId);
    if (match) {
      setSelectedFinding(match);
      setSubView("dashboard");
    }
  }, [initialFindingId, findings]);

  const filteredFindings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return findings.filter((f) => {
      if (sevFilter !== "ALL" && f.severity !== sevFilter) return false;
      if (statusFilter !== "ALL" && f.status !== statusFilter) return false;
      if (categoryFilter !== "ALL" && f.category !== categoryFilter) return false;
      if (q) {
        const hay = `${f.ruleId} ${f.title} ${f.filePath} ${f.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [findings, sevFilter, statusFilter, categoryFilter, searchQuery]);

  const verifiedFixedHistory = useMemo(() => {
    return findings.filter((f) => f.status === "FIXED_VERIFIED");
  }, [findings]);

  const ignoredHistory = useMemo(() => {
    return findings.filter((f) => f.status === "IGNORED");
  }, [findings]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return logs.filter((l) => {
      if (logSevFilter !== "ALL" && l.severity !== logSevFilter) return false;
      if (q) {
        const hay = `${l.eventType} ${l.target} ${l.actor} ${l.outcome} ${l.message}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, logSevFilter, logSearch]);

  const chartSeverityData = useMemo(
    () => [
      { name: "Critical", count: summary.bySeverity?.CRITICAL || 0 },
      { name: "High", count: summary.bySeverity?.HIGH || 0 },
      { name: "Medium", count: summary.bySeverity?.MEDIUM || 0 },
      { name: "Low", count: summary.bySeverity?.LOW || 0 },
      { name: "Fixed", count: summary.fixedCount || 0 },
    ],
    [summary]
  );

  const historyChartData = useMemo(() => {
    const pts = Array.isArray(summary.history) ? summary.history : [];
    return pts.slice(-12).map((p) => ({
      time: new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      score: p.score,
      open: (p.critical || 0) + (p.high || 0) + (p.medium || 0) + (p.low || 0),
    }));
  }, [summary.history]);

  const handleApproveFix = async (finding) => {
    const res = await sentinel.approveFix(finding.id);
    if (res.ok) {
      const msg = res.data?.message || (sentinel.daemonMode === "cloud-direct"
        ? `Fix approved! Queued for Direct Daemon on your PC to apply and verify.`
        : `Fixed and verified ${finding.filePath}.`);
      setFeedbackBanner({ type: "success", text: msg });
      if (onAppendSecurityLog) {
        onAppendSecurityLog(`Code Sentinel approved fix for ${finding.ruleId} in ${finding.filePath}.`, "INFO");
      }
      setSelectedFinding(res.data?.finding || null);
    } else {
      setFeedbackBanner({ type: "error", text: res.error || "Approval failed." });
    }
  };

  const handleIgnore = async (finding) => {
    const res = await sentinel.ignoreFinding(finding.id, ignoreReason || "Reviewed and accepted by administrator");
    if (res.ok) {
      setFeedbackBanner({ type: "info", text: `Marked ${finding.ruleId} as Ignored.` });
      setIgnoreReason("");
      setSelectedFinding(null);
    } else {
      setFeedbackBanner({ type: "error", text: res.error });
    }
  };

  const handleRollback = async (finding) => {
    if (!finding.backupId) return;
    const res = await sentinel.rollbackFix(finding.backupId, finding.id);
    if (res.ok) {
      setFeedbackBanner({ type: "info", text: `Rolled back patch using backup ${finding.backupId}.` });
      setSelectedFinding(null);
    } else {
      setFeedbackBanner({ type: "error", text: res.error });
    }
  };

  const handleEscalateToPullboard = (finding) => {
    if (typeof setBudgetData !== "function") return;
    setBudgetData((prev) => {
      const pb = prev?.pullboardData || { tasks: [], shouts: [] };
      const existingShouts = Array.isArray(pb.shouts) ? pb.shouts : [];
      const newShout = {
        id: `shout_cs_${Date.now()}`,
        type: "ESCALATION",
        status: "OPEN",
        author: "Code Sentinel Agent",
        specId: "SPEC-02",
        message: `[${finding.severity}] ${finding.ruleId} in ${finding.filePath}:${finding.lineStart} — ${finding.title}`,
        createdAt: new Date().toISOString(),
      };
      return {
        ...prev,
        pullboardData: { ...pb, shouts: [newShout, ...existingShouts] },
      };
    });
    setFeedbackBanner({ type: "info", text: `Escalated ${finding.ruleId} to Pullboard Shouts.` });
    if (setTab) setTab("pullboard");
  };

  const handleExportHistory = (format) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const dataToExport = {
      summary,
      verifiedFixes: verifiedFixedHistory,
      scanHistory: summary.history,
      ignoredExceptions: ignoredHistory,
      auditLogs: logs,
    };
    if (format === "json") {
      downloadFile(`code-sentinel-history-${stamp}.json`, JSON.stringify(dataToExport, null, 2), "application/json");
      return;
    }
    const header = ["Timestamp", "RuleID", "Title", "Severity", "FilePath", "Status", "ApprovedBy", "VerifiedAt"];
    const rows = findings.map((f) =>
      [
        f.detectedAt,
        f.ruleId,
        f.title,
        f.severity,
        f.filePath,
        f.status,
        f.approvedBy || "",
        f.fixedAt || "",
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    downloadFile(`code-sentinel-history-${stamp}.csv`, [header.join(","), ...rows].join("\n"), "text/csv");
  };

  const scoreColor = summary.score >= 85 ? PALETTE.green : summary.score >= 65 ? PALETTE.amber : PALETTE.red;

  const daemonBadge = useMemo(() => {
    if (sentinel?.daemonMode === "local-ws") {
      return { text: "● LOCAL DAEMON WS (Live Watching Files)", bg: PALETTE.greenBg, fg: PALETTE.green, border: PALETTE.green };
    }
    if (sentinel?.daemonMode === "cloud-direct") {
      return { text: "● DIRECT DAEMON ONLINE (Direct Supabase Sync Active)", bg: PALETTE.blueBg, fg: "#38bdf8", border: PALETTE.blue };
    }
    return { text: "☁️ CLOUD SNAPSHOT (Run 'npm run sentinel:watch' on PC to enable fix execution)", bg: PALETTE.amberBg, fg: PALETTE.amber, border: PALETTE.amber };
  }, [sentinel?.daemonMode]);

  return (
    <div style={{ color: PALETTE.soft }}>
      {/* Top Solid-Color Header Banner (No Gradients) */}
      <div
        style={{
          backgroundColor: PALETTE.panel,
          border: `2px solid ${PALETTE.border}`,
          borderRadius: 12,
          padding: sm ? 16 : 22,
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              backgroundColor: PALETTE.highContrast,
              border: `3px solid ${scoreColor}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 24, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{summary.score}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: PALETTE.muted }}>/ 100</span>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: sm ? 18 : 22, fontWeight: 800, color: PALETTE.text }}>
                🛡️ Code Sentinel — Real-Time Snyk-Style Code Agent
              </h2>
              <span
                style={{
                  backgroundColor: daemonBadge.bg,
                  color: daemonBadge.fg,
                  border: `1px solid ${daemonBadge.border}`,
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {sentinel?.scanning ? "⏳ SCANNING REPOSITORY…" : daemonBadge.text}
              </span>
            </div>
            <div style={{ fontSize: 13, color: PALETTE.muted, lineHeight: 1.45 }}>
              Strict <strong style={{ color: PALETTE.amber }}>Approve-First</strong> security gate: All findings require human review before applying verified patches & Quality Gate builds.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={sentinel?.actionBusy || sentinel?.scanning}
            onClick={() => sentinel.runScan(true)}
            style={solidBtnStyle({
              bg: PALETTE.blueBg,
              fg: PALETTE.text,
              border: PALETTE.blue,
              disabled: sentinel?.actionBusy || sentinel?.scanning,
            })}
          >
            {sentinel?.scanning ? "⏳ Scanning…" : "🔍 Run Full Scan"}
          </button>
          <button
            type="button"
            onClick={() => sentinel.refresh()}
            style={solidBtnStyle({ bg: PALETTE.card, fg: PALETTE.soft, border: PALETTE.border })}
          >
            ↻ Refresh Cloud Sync
          </button>
        </div>
      </div>

      {/* Sub-Navigation: Dashboard vs Historical Audits vs Real-Time Logs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setSubView("dashboard")}
          style={solidBtnStyle({
            bg: subView === "dashboard" ? PALETTE.blueBg : PALETTE.card,
            fg: PALETTE.text,
            border: subView === "dashboard" ? PALETTE.blue : PALETTE.border,
          })}
        >
          📊 Dashboard & Review Queue ({summary.pendingReviewCount || 0} Awaiting Approval)
        </button>
        <button
          type="button"
          onClick={() => setSubView("history")}
          style={solidBtnStyle({
            bg: subView === "history" ? PALETTE.blueBg : PALETTE.card,
            fg: PALETTE.text,
            border: subView === "history" ? PALETTE.blue : PALETTE.border,
          })}
        >
          📜 Historical Audits & Verified Fixes ({verifiedFixedHistory.length} Fixed)
        </button>
        <button
          type="button"
          onClick={() => setSubView("logs")}
          style={solidBtnStyle({
            bg: subView === "logs" ? PALETTE.blueBg : PALETTE.card,
            fg: PALETTE.text,
            border: subView === "logs" ? PALETTE.blue : PALETTE.border,
          })}
        >
          ⚡ Real-Time Activity & Telemetry ({logs.length})
        </button>
      </div>

      {/* Feedback Banner */}
      {(feedbackBanner || sentinel?.lastError) && (
        <div
          style={{
            backgroundColor:
              (feedbackBanner?.type || "error") === "success"
                ? PALETTE.greenBg
                : feedbackBanner?.type === "info"
                  ? PALETTE.blueBg
                  : PALETTE.redBg,
            border: `2px solid ${
              (feedbackBanner?.type || "error") === "success"
                ? PALETTE.green
                : feedbackBanner?.type === "info"
                  ? PALETTE.blue
                  : PALETTE.red
            }`,
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            color: PALETTE.text,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <span>{feedbackBanner?.text || sentinel?.lastError}</span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            style={{
              backgroundColor: "transparent",
              border: `1px solid ${PALETTE.border}`,
              color: PALETTE.text,
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ───────────────────────────── 1. DASHBOARD SUB-VIEW ───────────────────────────── */}
      {subView === "dashboard" && (
        <>
          {/* Strict Human-in-the-Loop Mode Guarantee Card */}
          <div
            style={{
              backgroundColor: PALETTE.highContrast,
              border: `2px solid ${PALETTE.amber}`,
              borderRadius: 10,
              padding: "14px 18px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>🔒</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, color: PALETTE.text }}>
                  Human Review & Approval Required Before Any Code Changes
                </div>
                <div style={{ fontSize: 12, color: PALETTE.muted, marginTop: 2 }}>
                  Every security issue, dependency CVE, or Doctrine finding stays paused until you inspect the root cause, view the unified diff, and click <strong>Approve</strong>.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  backgroundColor: PALETTE.amberBg,
                  color: PALETTE.amber,
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 800,
                  border: `1px solid ${PALETTE.amber}`,
                }}
              >
                MODE: REVIEW-FIRST (ENFORCED)
              </span>
            </div>
          </div>

          {/* Severity KPI Row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: sm ? "repeat(2, 1fr)" : "repeat(5, 1fr)",
              gap: 12,
              marginBottom: 16,
            }}
          >
            {[
              { label: "Critical", val: summary.bySeverity?.CRITICAL || 0, color: PALETTE.red, bg: PALETTE.redBg },
              { label: "High", val: summary.bySeverity?.HIGH || 0, color: "#fb923c", bg: "#3a1608" },
              { label: "Medium", val: summary.bySeverity?.MEDIUM || 0, color: PALETTE.amber, bg: PALETTE.amberBg },
              { label: "Low", val: summary.bySeverity?.LOW || 0, color: PALETTE.blue, bg: PALETTE.blueBg },
              { label: "Verified Fixed", val: summary.fixedCount || 0, color: PALETTE.green, bg: PALETTE.greenBg },
            ].map((k) => (
              <div
                key={k.label}
                style={{
                  backgroundColor: k.bg,
                  border: `2px solid ${k.color}`,
                  borderRadius: 10,
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: PALETTE.soft, textTransform: "uppercase" }}>
                  {k.label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: PALETTE.text, marginTop: 4 }}>{k.val}</div>
              </div>
            ))}
          </div>

          {/* Findings Review Queue */}
          <div
            style={{
              backgroundColor: PALETTE.card,
              border: `1px solid ${PALETTE.border}`,
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
              <input
                type="text"
                placeholder="Search file path, rule ID, or vulnerability title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: "1 1 240px",
                  minHeight: 44,
                  backgroundColor: PALETTE.highContrast,
                  color: PALETTE.text,
                  border: `1px solid ${PALETTE.border}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                }}
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  minHeight: 44,
                  backgroundColor: PALETTE.highContrast,
                  color: PALETTE.text,
                  border: `1px solid ${PALETTE.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING_REVIEW">Awaiting Approval ({summary.pendingReviewCount || 0})</option>
                <option value="APPROVED_QUEUED">Approved & Queued ({sentinel.approvedCount || 0})</option>
                <option value="FIXED_VERIFIED">Verified & Fixed ({summary.fixedCount || 0})</option>
                <option value="ROLLED_BACK">Rolled Back</option>
                <option value="IGNORED">Ignored</option>
              </select>
              <select
                value={sevFilter}
                onChange={(e) => setSevFilter(e.target.value)}
                style={{
                  minHeight: 44,
                  backgroundColor: PALETTE.highContrast,
                  color: PALETTE.text,
                  border: `1px solid ${PALETTE.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{
                  minHeight: 44,
                  backgroundColor: PALETTE.highContrast,
                  color: PALETTE.text,
                  border: `1px solid ${PALETTE.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              >
                <option value="ALL">All Engines</option>
                <option value="SAST">SAST (Code)</option>
                <option value="SCA">SCA (Dependencies)</option>
                <option value="SECRETS">Secrets</option>
                <option value="DOCTRINE">Doctrine & UX</option>
              </select>
            </div>

            {filteredFindings.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: PALETTE.muted, fontSize: 14 }}>
                ✅ No findings match the current filter.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filteredFindings.map((f) => {
                  const sev = SEV_STYLE[f.severity] || SEV_STYLE.MEDIUM;
                  const st = STATUS_STYLE[f.status] || STATUS_STYLE.PENDING_REVIEW;
                  return (
                    <div
                      key={f.id}
                      style={{
                        backgroundColor: PALETTE.cardElevated,
                        border: `1px solid ${PALETTE.border}`,
                        borderLeft: `5px solid ${sev.border}`,
                        borderRadius: 8,
                        padding: 14,
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: "1 1 380px" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                          <span
                            style={{
                              backgroundColor: sev.bg,
                              color: sev.fg,
                              border: `1px solid ${sev.border}`,
                              padding: "2px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 800,
                            }}
                          >
                            {sev.label}
                          </span>
                          <span
                            style={{
                              backgroundColor: st.bg,
                              color: st.fg,
                              padding: "2px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {st.label}
                          </span>
                          <span style={{ fontSize: 12, fontFamily: "monospace", color: PALETTE.teal }}>
                            {f.ruleId} · {f.category}
                          </span>
                          {f.autoFixable && (
                            <span
                              style={{
                                backgroundColor: PALETTE.greenBg,
                                color: PALETTE.green,
                                padding: "2px 8px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              ⚡ Auto-Fix Available
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: PALETTE.text, marginBottom: 4 }}>
                          {f.title}
                        </div>
                        <div style={{ fontSize: 12, fontFamily: "monospace", color: PALETTE.muted }}>
                          📄 {f.filePath}:{f.lineStart}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => setSelectedFinding(f)}
                          style={solidBtnStyle({ bg: PALETTE.blueBg, fg: PALETTE.text, border: PALETTE.blue })}
                        >
                          🔍 Review & "How to Fix"
                        </button>
                        {f.status === "PENDING_REVIEW" && f.autoFixable && (
                          <button
                            type="button"
                            disabled={sentinel?.actionBusy || !canUpdate}
                            onClick={() => setSelectedFinding(f)}
                            style={solidBtnStyle({
                              bg: PALETTE.greenBg,
                              fg: PALETTE.text,
                              border: PALETTE.green,
                              disabled: sentinel?.actionBusy || !canUpdate,
                            })}
                          >
                            ✓ Review & Approve Fix
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ───────────────────────────── 2. HISTORICAL AUDITS SUB-VIEW ───────────────────────────── */}
      {subView === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Top Historical KPI Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: sm ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
              gap: 12,
            }}
          >
            {[
              { label: "Verified Fixes", val: verifiedFixedHistory.length, color: PALETTE.green, bg: PALETTE.greenBg },
              { label: "Historical Scans", val: (summary.history || []).length, color: PALETTE.blue, bg: PALETTE.blueBg },
              { label: "Active Posture Score", val: `${summary.score}/100`, color: scoreColor, bg: PALETTE.cardElevated },
              { label: "Ignored Exceptions", val: ignoredHistory.length, color: PALETTE.muted, bg: PALETTE.card },
            ].map((k) => (
              <div
                key={k.label}
                style={{
                  backgroundColor: k.bg,
                  border: `2px solid ${k.color}`,
                  borderRadius: 10,
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: PALETTE.soft, textTransform: "uppercase" }}>
                  {k.label}
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: PALETTE.text, marginTop: 4 }}>{k.val}</div>
              </div>
            ))}
          </div>

          {/* Posture Score History Chart + Scan Sessions */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: sm ? "1fr" : "1.2fr 1fr",
              gap: 14,
            }}
          >
            <div
              style={{
                backgroundColor: PALETTE.card,
                border: `1px solid ${PALETTE.border}`,
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: PALETTE.text }}>
                  📈 Historical Posture Score & Open Issues Trend
                </div>
                <div style={{ fontSize: 11, color: PALETTE.muted }}>Last 12 Data Points</div>
              </div>
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historyChartData.length ? historyChartData : [{ time: "Now", score: summary.score, open: 0 }]}>
                    <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} />
                    <XAxis dataKey="time" stroke={PALETTE.muted} fontSize={11} />
                    <YAxis domain={[0, 100]} stroke={PALETTE.muted} fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: PALETTE.highContrast,
                        border: `1px solid ${PALETTE.border}`,
                        color: PALETTE.text,
                      }}
                    />
                    <Area type="monotone" dataKey="score" stroke={PALETTE.green} fill={PALETTE.greenBg} strokeWidth={2} name="Score" />
                    <Area type="monotone" dataKey="open" stroke={PALETTE.amber} fill={PALETTE.amberBg} strokeWidth={1.5} name="Open Issues" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div
              style={{
                backgroundColor: PALETTE.card,
                border: `1px solid ${PALETTE.border}`,
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: PALETTE.text }}>
                  ⏱️ Recent Scan Sessions
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => handleExportHistory("csv")}
                    style={solidBtnStyle({ bg: PALETTE.cardElevated, fg: PALETTE.text, border: PALETTE.border })}
                  >
                    ⬇ CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportHistory("json")}
                    style={solidBtnStyle({ bg: PALETTE.cardElevated, fg: PALETTE.text, border: PALETTE.border })}
                  >
                    ⬇ JSON
                  </button>
                </div>
              </div>
              <div style={{ maxHeight: 180, overflowY: "auto" }}>
                {(summary.history || []).length === 0 ? (
                  <div style={{ color: PALETTE.muted, fontSize: 12, padding: 10 }}>No scan sessions recorded yet.</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: PALETTE.muted }}>
                        <th style={{ padding: "6px 8px" }}>Time</th>
                        <th style={{ padding: "6px 8px" }}>Score</th>
                        <th style={{ padding: "6px 8px" }}>Crit/High</th>
                        <th style={{ padding: "6px 8px" }}>Fixed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(summary.history || []).slice(-8).reverse().map((h, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${PALETTE.border}` }}>
                          <td style={{ padding: "6px 8px", color: PALETTE.soft }}>{new Date(h.timestamp).toLocaleTimeString()}</td>
                          <td style={{ padding: "6px 8px", fontWeight: 800, color: h.score >= 85 ? PALETTE.green : PALETTE.amber }}>{h.score}</td>
                          <td style={{ padding: "6px 8px", color: PALETTE.red }}>{(h.critical || 0) + (h.high || 0)}</td>
                          <td style={{ padding: "6px 8px", color: PALETTE.green }}>{h.fixed || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Historical Verified Fixes Table */}
          <div
            style={{
              backgroundColor: PALETTE.card,
              border: `1px solid ${PALETTE.border}`,
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 900, color: PALETTE.text, marginBottom: 12 }}>
              ✅ Approved & Verified Fixes Log ({verifiedFixedHistory.length})
            </div>
            {verifiedFixedHistory.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: PALETTE.muted, fontSize: 13 }}>
                No verified fixes recorded yet. When you approve an issue, Code Sentinel applies the patch, passes Quality Gate verification, and records the audit record here.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {verifiedFixedHistory.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      backgroundColor: PALETTE.cardElevated,
                      border: `1px solid ${PALETTE.green}`,
                      borderRadius: 8,
                      padding: 14,
                      display: "flex",
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                        <span
                          style={{
                            backgroundColor: PALETTE.greenBg,
                            color: PALETTE.green,
                            padding: "2px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          VERIFIED & FIXED
                        </span>
                        <span style={{ fontSize: 12, fontFamily: "monospace", color: PALETTE.teal }}>
                          {f.ruleId} · {f.filePath}:{f.lineStart}
                        </span>
                        <span style={{ fontSize: 11, color: PALETTE.muted }}>
                          Approved by: <strong style={{ color: PALETTE.text }}>{f.approvedBy || f.fixedBy || "Admin"}</strong>
                        </span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: PALETTE.text }}>{f.title}</div>
                      <div style={{ fontSize: 12, color: PALETTE.muted, marginTop: 2 }}>
                        Fixed At: {f.fixedAt ? new Date(f.fixedAt).toLocaleString() : "Recently"} · Quality Gate: <strong>Passed</strong> · Backup: <code style={{ color: PALETTE.teal }}>{f.backupId || "bak_snapshot"}</code>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setSelectedFinding(f)}
                        style={solidBtnStyle({ bg: PALETTE.card, fg: PALETTE.text, border: PALETTE.border })}
                      >
                        🔍 View Diff Snapshot
                      </button>
                      {f.backupId && (
                        <button
                          type="button"
                          disabled={sentinel?.actionBusy || !canUpdate}
                          onClick={() => handleRollback(f)}
                          style={solidBtnStyle({
                            bg: PALETTE.amberBg,
                            fg: PALETTE.text,
                            border: PALETTE.amber,
                            disabled: sentinel?.actionBusy || !canUpdate,
                          })}
                        >
                          ↩ Rollback Patch
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Historical Exceptions (Ignored) */}
          {ignoredHistory.length > 0 && (
            <div
              style={{
                backgroundColor: PALETTE.card,
                border: `1px solid ${PALETTE.border}`,
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 900, color: PALETTE.text, marginBottom: 12 }}>
                ⚠️ Historical Exceptions (Ignored Issues: {ignoredHistory.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ignoredHistory.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      backgroundColor: PALETTE.highContrast,
                      border: `1px solid ${PALETTE.border}`,
                      borderRadius: 8,
                      padding: 12,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: PALETTE.text }}>
                        {f.ruleId} — {f.title} ({f.filePath}:{f.lineStart})
                      </div>
                      <div style={{ fontSize: 12, color: PALETTE.amber, marginTop: 2 }}>
                        Reason: "{f.ignoredReason || "Accepted by admin"}" · Ignored by: {f.ignoredBy || "Admin"}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={sentinel?.actionBusy || !canUpdate}
                      onClick={() => sentinel.reopenFinding(f.id)}
                      style={solidBtnStyle({
                        bg: PALETTE.cardElevated,
                        fg: PALETTE.text,
                        border: PALETTE.border,
                        disabled: sentinel?.actionBusy || !canUpdate,
                      })}
                    >
                      Re-Open for Review
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────── 3. REAL-TIME ACTIVITY LOGS SUB-VIEW ───────────────────────────── */}
      {subView === "logs" && (
        <div
          style={{
            backgroundColor: PALETTE.card,
            border: `1px solid ${PALETTE.border}`,
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div style={{ display: "flex", gap: 10, flex: "1 1 340px", flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="Filter logs by event type, file, or message..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                style={{
                  flex: "1 1 220px",
                  minHeight: 44,
                  backgroundColor: PALETTE.highContrast,
                  color: PALETTE.text,
                  border: `1px solid ${PALETTE.border}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                }}
              />
              <select
                value={logSevFilter}
                onChange={(e) => setLogSevFilter(e.target.value)}
                style={{
                  minHeight: 44,
                  backgroundColor: PALETTE.highContrast,
                  color: PALETTE.text,
                  border: `1px solid ${PALETTE.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
                <option value="INFO">INFO</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => handleExportHistory("csv")}
                style={solidBtnStyle({ bg: PALETTE.cardElevated, fg: PALETTE.text, border: PALETTE.border })}
              >
                ⬇ Export CSV
              </button>
              <button
                type="button"
                onClick={() => handleExportHistory("json")}
                style={solidBtnStyle({ bg: PALETTE.cardElevated, fg: PALETTE.text, border: PALETTE.border })}
              >
                ⬇ Export JSON
              </button>
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", color: PALETTE.muted }}>
              No audit logs recorded yet. Start `npm run sentinel:watch` or click "Run Full Scan".
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: PALETTE.highContrast, textAlign: "left" }}>
                    <th style={{ padding: "10px 12px", borderBottom: `2px solid ${PALETTE.border}` }}>Timestamp</th>
                    <th style={{ padding: "10px 12px", borderBottom: `2px solid ${PALETTE.border}` }}>Event</th>
                    <th style={{ padding: "10px 12px", borderBottom: `2px solid ${PALETTE.border}` }}>Severity</th>
                    <th style={{ padding: "10px 12px", borderBottom: `2px solid ${PALETTE.border}` }}>Target</th>
                    <th style={{ padding: "10px 12px", borderBottom: `2px solid ${PALETTE.border}` }}>Actor</th>
                    <th style={{ padding: "10px 12px", borderBottom: `2px solid ${PALETTE.border}` }}>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.slice(0, 150).map((log) => {
                    const sev = SEV_STYLE[log.severity] || SEV_STYLE.INFO;
                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        style={{
                          cursor: "pointer",
                          borderBottom: `1px solid ${PALETTE.border}`,
                          backgroundColor: PALETTE.card,
                        }}
                      >
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: PALETTE.muted }}>
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: PALETTE.teal }}>
                          {log.eventType}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              backgroundColor: sev.bg,
                              color: sev.fg,
                              padding: "2px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 800,
                            }}
                          >
                            {sev.label}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: PALETTE.soft }}>
                          {log.target}
                        </td>
                        <td style={{ padding: "10px 12px", color: PALETTE.muted }}>{log.actor}</td>
                        <td style={{ padding: "10px 12px", color: PALETTE.text }}>{log.message}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────── REVIEW & "HOW TO FIX" MODAL ─────────────────────── */}
      {selectedFinding && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99995,
            backgroundColor: "rgba(2, 8, 20, 0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 800,
              maxHeight: "92vh",
              overflowY: "auto",
              backgroundColor: PALETTE.panel,
              border: `2px solid ${(SEV_STYLE[selectedFinding.severity] || SEV_STYLE.MEDIUM).border}`,
              borderRadius: 14,
              padding: 22,
              color: PALETTE.text,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <span
                    style={{
                      backgroundColor: (STATUS_STYLE[selectedFinding.status] || STATUS_STYLE.PENDING_REVIEW).bg,
                      color: (STATUS_STYLE[selectedFinding.status] || STATUS_STYLE.PENDING_REVIEW).fg,
                      padding: "3px 10px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    STATUS: {(STATUS_STYLE[selectedFinding.status] || STATUS_STYLE.PENDING_REVIEW).label.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 12, fontFamily: "monospace", color: PALETTE.teal }}>
                    {selectedFinding.ruleId} · {selectedFinding.cwe}
                  </span>
                </div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>{selectedFinding.title}</h3>
                <div style={{ fontSize: 12, fontFamily: "monospace", color: PALETTE.muted, marginTop: 4 }}>
                  📄 {selectedFinding.filePath}:{selectedFinding.lineStart}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFinding(null)}
                style={solidBtnStyle({ bg: PALETTE.card, fg: PALETTE.text, border: PALETTE.border })}
              >
                ✕ Close
              </button>
            </div>

            {/* Approval Notice */}
            <div
              style={{
                backgroundColor: PALETTE.highContrast,
                border: `1.5px solid ${PALETTE.amber}`,
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 14,
                fontSize: 12,
                color: PALETTE.soft,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>🔒</span>
              <span>
                <strong>Approval Checkpoint:</strong> Code Sentinel will never alter your code without your approval. Review the root cause, remediation steps, and diff below before clicking <strong>Approve & Execute Verified Fix</strong>.
              </span>
            </div>

            <div
              style={{
                backgroundColor: PALETTE.card,
                border: `1px solid ${PALETTE.border}`,
                borderRadius: 10,
                padding: 14,
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: PALETTE.amber, marginBottom: 6 }}>
                1. WHAT IS WRONG (ROOT CAUSE)
              </div>
              <div style={{ fontSize: 14, color: PALETTE.soft, lineHeight: 1.5 }}>{selectedFinding.description}</div>
            </div>

            <div
              style={{
                backgroundColor: PALETTE.blueBg,
                border: `1px solid ${PALETTE.blue}`,
                borderRadius: 10,
                padding: 14,
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: PALETTE.text, marginBottom: 8 }}>
                2. HOW TO FIX (STEP-BY-STEP REMEDIATION)
              </div>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.6, color: PALETTE.soft }}>
                {(selectedFinding.howToFix || []).map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>

            {selectedFinding.snippet && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: PALETTE.muted, marginBottom: 6 }}>
                  3. CURRENT CODE SNIPPET
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: PALETTE.highContrast,
                    border: `1px solid ${PALETTE.border}`,
                    overflowX: "auto",
                    fontSize: 12,
                    color: PALETTE.soft,
                  }}
                >
                  {selectedFinding.snippet}
                </pre>
              </div>
            )}

            {selectedFinding.diff && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: PALETTE.green, marginBottom: 6 }}>
                  4. PROPOSED AUTO-FIX UNIFIED DIFF PREVIEW
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: PALETTE.highContrast,
                    border: `1px solid ${PALETTE.green}`,
                    overflowX: "auto",
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  {selectedFinding.diff.split("\n").map((line, i) => (
                    <div
                      key={i}
                      style={{
                        backgroundColor: line.startsWith("+") && !line.startsWith("+++")
                          ? PALETTE.greenBg
                          : line.startsWith("-") && !line.startsWith("---")
                            ? PALETTE.redBg
                            : "transparent",
                        color: line.startsWith("+") ? "#86efac" : line.startsWith("-") ? "#fca5a5" : PALETTE.soft,
                        padding: "0 4px",
                      }}
                    >
                      {line}
                    </div>
                  ))}
                </pre>
              </div>
            )}

            {selectedFinding.status === "APPROVED_QUEUED" && (
              <div
                style={{
                  backgroundColor: PALETTE.blueBg,
                  border: `1.5px solid ${PALETTE.blue}`,
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 14,
                  fontSize: 13,
                  color: "#e0f2fe",
                }}
              >
                ⏳ <strong>Fix Approved!</strong> Approved by {selectedFinding.approvedBy || "Admin"}. The Direct Daemon on your developer PC will pick up this fix, apply the patch, and verify it via `scripts/pre-deploy-check.js`.
              </div>
            )}

            {selectedFinding.status === "FIXED_VERIFIED" && (
              <div
                style={{
                  backgroundColor: PALETTE.greenBg,
                  border: `1.5px solid ${PALETTE.green}`,
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 14,
                  fontSize: 13,
                  color: "#dcfce7",
                }}
              >
                ✅ <strong>Verified & Fixed!</strong> Verified on disk. Backup snapshot: <code style={{ color: PALETTE.teal }}>{selectedFinding.backupId || "snapshot"}</code>.
              </div>
            )}

            {selectedFinding.lastFixError && (
              <div
                style={{
                  backgroundColor: PALETTE.redBg,
                  border: `1px solid ${PALETTE.red}`,
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 14,
                  fontSize: 13,
                  color: PALETTE.text,
                }}
              >
                ⚠️ Last fix attempt failed Quality Gate and was rolled back: {selectedFinding.lastFixError}
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {selectedFinding.autoFixable && selectedFinding.status === "PENDING_REVIEW" && (
                  <button
                    type="button"
                    disabled={sentinel?.actionBusy || !canUpdate}
                    onClick={() => handleApproveFix(selectedFinding)}
                    style={solidBtnStyle({
                      bg: PALETTE.greenBg,
                      fg: PALETTE.text,
                      border: PALETTE.green,
                      disabled: sentinel?.actionBusy || !canUpdate,
                    })}
                  >
                    {sentinel?.actionBusy ? "⏳ Processing Approval…" : "✓ Approve & Execute Verified Fix"}
                  </button>
                )}
                {selectedFinding.backupId && selectedFinding.status === "FIXED_VERIFIED" && (
                  <button
                    type="button"
                    disabled={sentinel?.actionBusy || !canUpdate}
                    onClick={() => handleRollback(selectedFinding)}
                    style={solidBtnStyle({
                      bg: PALETTE.amberBg,
                      fg: PALETTE.text,
                      border: PALETTE.amber,
                      disabled: sentinel?.actionBusy || !canUpdate,
                    })}
                  >
                    ↩ Rollback Patch
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleEscalateToPullboard(selectedFinding)}
                  style={solidBtnStyle({ bg: PALETTE.cardElevated, fg: PALETTE.text, border: PALETTE.purple })}
                >
                  📋 Escalate to Pullboard
                </button>
              </div>

              {selectedFinding.status === "PENDING_REVIEW" ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    placeholder="Reason to ignore..."
                    value={ignoreReason}
                    onChange={(e) => setIgnoreReason(e.target.value)}
                    style={{
                      minHeight: 44,
                      backgroundColor: PALETTE.highContrast,
                      color: PALETTE.text,
                      border: `1px solid ${PALETTE.border}`,
                      borderRadius: 8,
                      padding: "8px 10px",
                      fontSize: 13,
                    }}
                  />
                  <button
                    type="button"
                    disabled={sentinel?.actionBusy || !canUpdate}
                    onClick={() => handleIgnore(selectedFinding)}
                    style={solidBtnStyle({
                      bg: PALETTE.card,
                      fg: PALETTE.muted,
                      border: PALETTE.border,
                      disabled: sentinel?.actionBusy || !canUpdate,
                    })}
                  >
                    Ignore
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={sentinel?.actionBusy || !canUpdate}
                  onClick={() => sentinel.reopenFinding(selectedFinding.id).then(() => setSelectedFinding(null))}
                  style={solidBtnStyle({
                    bg: PALETTE.card,
                    fg: PALETTE.text,
                    border: PALETTE.border,
                    disabled: sentinel?.actionBusy || !canUpdate,
                  })}
                >
                  Re-Open Finding
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────── LOG DETAIL MODAL ───────────────────────── */}
      {selectedLog && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99995,
            backgroundColor: "rgba(2, 8, 20, 0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 680,
              maxHeight: "85vh",
              overflowY: "auto",
              backgroundColor: PALETTE.panel,
              border: `2px solid ${PALETTE.blue}`,
              borderRadius: 14,
              padding: 20,
              color: PALETTE.text,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>📜 Telemetry / Audit Log Payload</h3>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                style={solidBtnStyle({ bg: PALETTE.card, fg: PALETTE.text, border: PALETTE.border })}
              >
                ✕ Close
              </button>
            </div>
            <pre
              style={{
                margin: 0,
                padding: 14,
                borderRadius: 8,
                backgroundColor: PALETTE.highContrast,
                border: `1px solid ${PALETTE.border}`,
                overflowX: "auto",
                fontSize: 12,
                color: PALETTE.soft,
              }}
            >
              {JSON.stringify(selectedLog, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
