import { createClient } from "@supabase/supabase-js";
import ws from "ws";

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

async function getUserId(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const client = createClient(url, anonKey, {
    realtime: {
      transport: ws
    }
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured." });
  }

  const userId = await getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  try {
    const { data: roleEntry, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (roleErr) throw roleErr;

    const role = roleEntry?.role || "user";

    const { data: permissions, error: permErr } = await supabase
      .from("role_permissions")
      .select("*")
      .eq("role", role);

    if (permErr) throw permErr;

    const permissionsMap = {};
    const defaultModules = ["dashboard", "history", "budget", "accounts", "investments", "debts", "credits", "expenses", "calendar", "reports", "admin"];
    
    defaultModules.forEach(mod => {
      if (role === "admin") {
        permissionsMap[mod] = "update";
      } else if (role === "viewer") {
        permissionsMap[mod] = "read";
      } else if (role === "guest") {
        permissionsMap[mod] = mod === "dashboard" ? "read" : "none";
      } else {
        permissionsMap[mod] = mod === "admin" ? "none" : "update";
      }
    });

    if (permissions && permissions.length > 0) {
      permissions.forEach(p => {
        permissionsMap[p.module_name] = p.access_level;
      });
    }

    return res.status(200).json({ role, permissions: permissionsMap });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
