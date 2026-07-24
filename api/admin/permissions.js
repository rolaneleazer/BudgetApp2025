import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { getMcpConfig } from "../../mcp/core.js";
import { verifyAdmin, getRequestBody } from "../../mcp/admin.js";

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    realtime: {
      transport: ws
    }
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured." });
  }

  const { authorized, error } = await verifyAdmin(req);
  if (!authorized) {
    return res.status(401).json({ error });
  }

  if (req.method === "GET") {
    try {
      const { data, error: fetchErr } = await supabase
        .from("role_permissions")
        .select("*");

      if (fetchErr) throw fetchErr;

      return res.status(200).json({ permissions: data || [] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    try {
      const body = await getRequestBody(req);
      const { role, moduleName, accessLevel } = body;
      if (!role || !moduleName || !accessLevel) {
        return res.status(400).json({ error: "Missing role, moduleName, or accessLevel parameters." });
      }

      const { data, error: upsertErr } = await supabase
        .from("role_permissions")
        .upsert({ role, module_name: moduleName, access_level: accessLevel }, { onConflict: "role,module_name" })
        .select()
        .single();

      if (upsertErr) throw upsertErr;

      return res.status(200).json({ success: true, permission: data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed." });
}
