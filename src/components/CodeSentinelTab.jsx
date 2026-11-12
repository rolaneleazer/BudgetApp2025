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
  PENDING_REVIEW: { fg: "#fbbf24", bg: "#332206", label: "Pending Review" },
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
 * Real-time hook connecting App.jsx to the local Code Sentinel WebSocket/HTTP daemon
 * with Supabase/budgetData fallback so notifications & badges update everywhere in real time.
 */
export function useCodeSentinelLive({ budgetData, setBudgetData, session, canWrite, isAdmin }) {
  const fallback = budgetData?.codeSentinel || {};
  const [daemonOnline, setDaemonOnline] = useState(false);
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
          logs: Array.isArray(nextLogs) ? nextLogs.slice(0, 200) : prev?.codeSentinel?.logs || [],
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
      setSummary(fJson.summary || null);
      setFindings(Array.isArray(fJson.findings) ? fJson.findings : []);
      setLogs(Array.isArray(lJson.logs) ? lJson.logs : []);
      setLastError(null);
      persistSnapshot(fJson.summary, fJson.findings, lJson.logs);
      return true;
    } catch {
      setDaemonOnline(false);
      // Fallback to cloud API when authenticated as admin
      if (session?.access_token) {
        try {
          const res = await fetch("/api/admin/code-sentinel", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.findings)) setFindings(data.findings);
            if (Array.isArray(data.logs)) setLogs(data.logs);
            if (data.summary) setSummary(data.summary);
          }
        } catch {
          // Offline / demo mode uses budgetData.codeSentinel
        }
      }
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
          setLastError(null);
        };

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            const { event, payload } = msg;
            if (event === "CONNECTED") {
              setDaemonOnline(true);
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
                  title: `${list.length} New Code Issue${list.length > 1 ? "s" : ""} Detected`,
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
                  title: "Fix Applied & Verified",
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
          setDaemonOnline(false);
          if (!cancelled) {
            reconnectTimer = setTimeout(connectWs, 5000);
          }
        };
        ws.onerror = () => {
          ws.close();
        };
      } catch {
        setDaemonOnline(false);
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
      } catch (err) {
        setLastError(err.message);
        return { ok: false, error: err.message };
      } finally {
        setActionBusy(false);
      }
    },
    [fetchFromDaemon, session?.user?.email]
  );

  const pendingCount = useMemo(
    () => findings.filter((f) => f.status === "PENDING_REVIEW").length,
    [findings]
  );

  return {
    daemonOnline,
    scanning,
    summary,
    findings,
    logs,
    pendingCount,
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
        🔍 Review & How to Fix
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
  const [subView, setSubView] = useState("dashboard"); // "dashboard" | "logs"
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
      setFeedbackBanner({ type: "success", text: res.data?.message || `Fixed and verified ${finding.filePath}.` });
      if (onAppendSecurityLog) {
        onAppendSecurityLog(`Code Sentinel fixed & verified ${finding.ruleId} in ${finding.filePath}.`, "INFO");
      }
      setSelectedFinding(res.data?.finding || null);
    } else {
      setFeedbackBanner({ type: "error", text: res.error || "Fix verification failed." });
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

  const handleExportLogs = (format) => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "json") {
      downloadFile(`code-sentinel-logs-${stamp}.json`, JSON.stringify(logs, null, 2), "application/json");
      return;
    }
    const header = ["Timestamp", "EventType", "Severity", "Target", "Actor", "Outcome", "Message"];
    const rows = logs.map((l) =>
      [l.timestamp, l.eventType, l.severity, l.target, l.actor, l.outcome, l.message]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    downloadFile(`code-sentinel-logs-${stamp}.csv`, [header.join(","), ...rows].join("\n"), "text/csv");
  };

  const scoreColor = summary.score >= 85 ? PALETTE.green : summary.score >= 65 ? PALETTE.amber : PALETTE.red;

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
                  backgroundColor: sentinel?.daemonOnline ? PALETTE.greenBg : PALETTE.amberBg,
                  color: sentinel?.daemonOnline ? PALETTE.green : PALETTE.amber,
                  border: `1px solid ${sentinel?.daemonOnline ? PALETTE.green : PALETTE.amber}`,
                  padding: "3px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {sentinel?.scanning
                  ? "⏳ SCANNING…"
                  : sentinel?.daemonOnline
                    ? policy.watchEnabled
                      ? "● LIVE WATCHING"
                      : "⏸ WATCH PAUSED"
                    : "☁️ SNAPSHOT MODE (Start local daemon for live watch & auto-fix)"}
              </span>
            </div>
            <div style={{ fontSize: 13, color: PALETTE.muted, lineHeight: 1.45 }}>
              Checks SAST, dependencies (`npm audit`), secrets, and Doctrine rules on every save — notifies you with{" "}
              <strong style={{ color: PALETTE.text }}>How to Fix</strong> guides, diff previews, and verified auto-fixes.
            </div>
            {!sentinel?.daemonOnline && (
              <div style={{ marginTop: 6, fontSize: 12, color: PALETTE.amber, fontFamily: "monospace" }}>
                Run locally for real-time watching & disk patching: <strong>npm run sentinel:watch</strong>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={!sentinel?.daemonOnline || sentinel?.actionBusy || sentinel?.scanning}
            onClick={() => sentinel.runScan(true)}
            style={solidBtnStyle({
              bg: PALETTE.blueBg,
              fg: PALETTE.text,
              border: PALETTE.blue,
              disabled: !sentinel?.daemonOnline || sentinel?.actionBusy || sentinel?.scanning,
            })}
          >
            {sentinel?.scanning ? "⏳ Scanning…" : "🔍 Run Full Scan"}
          </button>
          <button
            type="button"
            onClick={() => sentinel.refresh()}
            style={solidBtnStyle({ bg: PALETTE.card, fg: PALETTE.soft, border: PALETTE.border })}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Sub-Navigation Pills: Dashboard vs Logs */}
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
          📊 Dashboard & Review Queue ({summary.pendingReviewCount || 0})
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
          📜 Agent Activity & Audit Logs ({logs.length})
        </button>
      </div>

      {/* Status / Action Feedback Banner */}
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

      {/* ───────────────────────────── DASHBOARD SUB-VIEW ───────────────────────────── */}
      {subView === "dashboard" && (
        <>
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

          {/* Policy Controls + Charts */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: sm ? "1fr" : "1.1fr 1fr 1fr",
              gap: 14,
              marginBottom: 16,
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
              <div style={{ fontSize: 13, fontWeight: 800, color: PALETTE.text, marginBottom: 12 }}>
                ⚙️ Agent Watch & Auto-Fix Policy
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 12, color: PALETTE.muted, fontWeight: 700 }}>
                  Remediation Mode
                  <select
                    disabled={!sentinel?.daemonOnline || !canUpdate || sentinel?.actionBusy}
                    value={policy.autoFixMode || "review-first"}
                    onChange={(e) => sentinel.updatePolicy({ autoFixMode: e.target.value })}
                    style={{
                      width: "100%",
                      marginTop: 6,
                      minHeight: 44,
                      backgroundColor: PALETTE.highContrast,
                      color: PALETTE.text,
                      border: `1px solid ${PALETTE.border}`,
                      borderRadius: 8,
                      padding: "8px 10px",
                      fontSize: 13,
                    }}
                  >
                    <option value="review-first">Review First (Notify + Diff + Approve to Fix)</option>
                    <option value="guided-auto">Guided Auto-Fix (Low-Risk Auto + High/Critical Review)</option>
                  </select>
                </label>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={!sentinel?.daemonOnline || !canUpdate}
                    onClick={() => sentinel.updatePolicy({ watchEnabled: !policy.watchEnabled })}
                    style={solidBtnStyle({
                      bg: policy.watchEnabled ? PALETTE.greenBg : PALETTE.amberBg,
                      fg: PALETTE.text,
                      border: policy.watchEnabled ? PALETTE.green : PALETTE.amber,
                      disabled: !sentinel?.daemonOnline || !canUpdate,
                    })}
                  >
                    {policy.watchEnabled ? "● Real-Time Watch: ON" : "⏸ Real-Time Watch: OFF"}
                  </button>
                  <button
                    type="button"
                    disabled={!sentinel?.daemonOnline || !canUpdate}
                    onClick={() => sentinel.updatePolicy({ notifyEmail: !policy.notifyEmail })}
                    style={solidBtnStyle({
                      bg: policy.notifyEmail ? PALETTE.blueBg : PALETTE.cardElevated,
                      fg: PALETTE.text,
                      border: policy.notifyEmail ? PALETTE.blue : PALETTE.border,
                      disabled: !sentinel?.daemonOnline || !canUpdate,
                    })}
                  >
                    {policy.notifyEmail ? "✉️ Email Alerts: ON" : "✉️ Email Alerts: OFF"}
                  </button>
                </div>

                <div style={{ fontSize: 12, color: PALETTE.muted }}>
                  Last scan:{" "}
                  <strong style={{ color: PALETTE.text }}>
                    {summary.lastScanAt ? new Date(summary.lastScanAt).toLocaleString() : "Not yet run"}
                  </strong>{" "}
                  ({summary.scannedFilesCount || 0} files)
                </div>
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
              <div style={{ fontSize: 13, fontWeight: 800, color: PALETTE.text, marginBottom: 8 }}>
                📈 Findings Distribution
              </div>
              <div style={{ height: 170 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartSeverityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} />
                    <XAxis dataKey="name" stroke={PALETTE.muted} fontSize={11} />
                    <YAxis stroke={PALETTE.muted} fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: PALETTE.highContrast,
                        border: `1px solid ${PALETTE.border}`,
                        color: PALETTE.text,
                      }}
                    />
                    <Bar dataKey="count" fill={PALETTE.blue} radius={[6, 6, 0, 0]} />
                  </BarChart>
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
              <div style={{ fontSize: 13, fontWeight: 800, color: PALETTE.text, marginBottom: 8 }}>
                🛡️ Posture Score History
              </div>
              <div style={{ height: 170 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historyChartData.length ? historyChartData : [{ time: "Now", score: summary.score }]}>
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
                    <Area type="monotone" dataKey="score" stroke={PALETTE.green} fill={PALETTE.greenBg} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Findings Queue Filters */}
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
                placeholder="Search file path, rule ID, or vulnerability..."
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
                <option value="PENDING_REVIEW">Pending Review</option>
                <option value="FIXED_VERIFIED">Verified & Fixed</option>
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
                              ⚡ Auto-Fix Ready
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
                          🔍 Review & How to Fix
                        </button>
                        {f.autoFixable && f.status === "PENDING_REVIEW" && (
                          <button
                            type="button"
                            disabled={!sentinel?.daemonOnline || sentinel?.actionBusy || !canUpdate}
                            onClick={() => handleApproveFix(f)}
                            style={solidBtnStyle({
                              bg: PALETTE.greenBg,
                              fg: PALETTE.text,
                              border: PALETTE.green,
                              disabled: !sentinel?.daemonOnline || sentinel?.actionBusy || !canUpdate,
                            })}
                          >
                            ⚡ Approve & Fix
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

      {/* ───────────────────────────── LOGS SUB-VIEW ───────────────────────────── */}
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
                placeholder="Filter logs by file, event, actor, or message..."
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
                onClick={() => handleExportLogs("csv")}
                style={solidBtnStyle({ bg: PALETTE.cardElevated, fg: PALETTE.text, border: PALETTE.border })}
              >
                ⬇ Export CSV
              </button>
              <button
                type="button"
                onClick={() => handleExportLogs("json")}
                style={solidBtnStyle({ bg: PALETTE.cardElevated, fg: PALETTE.text, border: PALETTE.border })}
              >
                ⬇ Export JSON
              </button>
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", color: PALETTE.muted }}>
              No audit logs recorded yet. Run a scan or start `npm run sentinel:watch`.
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
            backgroundColor: "rgba(2, 8, 20, 0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 780,
              maxHeight: "90vh",
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
                <div style={{ fontSize: 12, fontFamily: "monospace", color: PALETTE.teal, marginBottom: 4 }}>
                  {selectedFinding.ruleId} · {selectedFinding.cwe} · {selectedFinding.filePath}:{selectedFinding.lineStart}
                </div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>{selectedFinding.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFinding(null)}
                style={solidBtnStyle({ bg: PALETTE.card, fg: PALETTE.text, border: PALETTE.border })}
              >
                ✕ Close
              </button>
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
                WHAT IS WRONG
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
                🛠️ HOW TO FIX (STEP-BY-STEP)
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
                  CURRENT CODE SNIPPET
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
                  PROPOSED AUTO-FIX DIFF PREVIEW
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
                ⚠️ Last fix attempt failed & rolled back: {selectedFinding.lastFixError}
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {selectedFinding.autoFixable && selectedFinding.status !== "FIXED_VERIFIED" && (
                  <button
                    type="button"
                    disabled={!sentinel?.daemonOnline || sentinel?.actionBusy || !canUpdate}
                    onClick={() => handleApproveFix(selectedFinding)}
                    style={solidBtnStyle({
                      bg: PALETTE.greenBg,
                      fg: PALETTE.text,
                      border: PALETTE.green,
                      disabled: !sentinel?.daemonOnline || sentinel?.actionBusy || !canUpdate,
                    })}
                  >
                    {sentinel?.actionBusy ? "⏳ Applying & Verifying…" : "⚡ Approve & Auto-Fix + Verify"}
                  </button>
                )}
                {selectedFinding.backupId && selectedFinding.status === "FIXED_VERIFIED" && (
                  <button
                    type="button"
                    disabled={!sentinel?.daemonOnline || sentinel?.actionBusy || !canUpdate}
                    onClick={() => handleRollback(selectedFinding)}
                    style={solidBtnStyle({
                      bg: PALETTE.amberBg,
                      fg: PALETTE.text,
                      border: PALETTE.amber,
                      disabled: !sentinel?.daemonOnline || sentinel?.actionBusy || !canUpdate,
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
                    disabled={!sentinel?.daemonOnline || sentinel?.actionBusy || !canUpdate}
                    onClick={() => handleIgnore(selectedFinding)}
                    style={solidBtnStyle({
                      bg: PALETTE.card,
                      fg: PALETTE.muted,
                      border: PALETTE.border,
                      disabled: !sentinel?.daemonOnline || sentinel?.actionBusy || !canUpdate,
                    })}
                  >
                    Ignore
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!sentinel?.daemonOnline || sentinel?.actionBusy || !canUpdate}
                  onClick={() => sentinel.reopenFinding(selectedFinding.id).then(() => setSelectedFinding(null))}
                  style={solidBtnStyle({
                    bg: PALETTE.card,
                    fg: PALETTE.text,
                    border: PALETTE.border,
                    disabled: !sentinel?.daemonOnline || sentinel?.actionBusy || !canUpdate,
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
            backgroundColor: "rgba(2, 8, 20, 0.85)",
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
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>📜 Audit Log Payload</h3>
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

