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

  if (req.method === "GET") {
    const localState = readLocalState();
    if (localState) {
      return res.status(200).json({ ok: true, source: "local-state", ...localState });
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
      return res.status(200).json({ ok: true, source: "supabase-cloud", ...cs });
    }

    return res.status(200).json({ ok: true, source: "empty", findings: [], logs: [], history: [], policy: {} });
  }

  if (req.method === "POST") {
    const body = await getRequestBody(req);
    const action = body.action || "sync";

    if (action === "sync" && adminClient && auth.user?.id) {
      const { data: row } = await adminClient
        .from("user_data")
        .select("budget_data")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      const nextBudgetData = {
        ...(row?.budget_data || {}),
        codeSentinel: {
          summary: body.summary || null,
          findings: Array.isArray(body.findings) ? body.findings.slice(0, 100) : [],
          logs: Array.isArray(body.logs) ? body.logs.slice(0, 200) : [],
          policy: body.policy || {},
          syncedAt: new Date().toISOString(),
        },
      };

      const { error } = await adminClient
        .from("user_data")
        .upsert({ user_id: auth.user.id, budget_data: nextBudgetData, updated_at: new Date().toISOString() });

      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, synced: true });
    }

    return res.status(400).json({ ok: false, error: `Unsupported action '${action}'.` });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed." });
}

