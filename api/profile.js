import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { supabaseAdmin } from "../mcp/admin.js";

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

function decodeJwt(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

async function getUser(req) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return null;

    if (supabaseAdmin) {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && user) {
        return user;
      }
    }

    // Fallback: decode JWT locally
    const payload = decodeJwt(token);
    if (payload) {
      return {
        id: payload.sub,
        email: payload.email,
        app_metadata: payload.app_metadata || {}
      };
    }
  } catch (err) {
    console.error("Error in getUser profile resolver:", err);
  }
  return null;
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

  try {
    const user = await getUser(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated." });
    }

    const userId = user.id;
    const email = user.email || "";
    const adminEmailsStr = process.env.ADMIN_EMAILS || "";
    const adminEmails = adminEmailsStr
      .split(",")
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    const { data: roleEntry, error: roleErr } = await supabase
      .from("user_roles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (roleErr) throw roleErr;

    const isActive = roleEntry?.status !== "inactive" && user.app_metadata?.is_active !== false && !user.banned_until;
    if (!isActive) {
      return res.status(403).json({ error: "Your account has been deactivated by an administrator.", isActive: false });
    }

    let role = "user";
    if (adminEmails.includes(email.toLowerCase()) || user.app_metadata?.role === "admin") {
      role = "admin";
    } else if (roleEntry?.role) {
      role = roleEntry.role;
    }

    console.log(`[Profile Resolver] Resolved user: "${email}" (ID: ${userId}) -> Role: "${role}", Active: ${isActive}`);

    const { data: permissions, error: permErr } = await supabase
      .from("role_permissions")
      .select("*")
      .eq("role", role);

    if (permErr) throw permErr;

    const permissionsMap = {};
    const defaultModules = [
      "dashboard",
      "history",
      "budget",
      "accounts",
      "account-manager",
      "reconcile",
      "transactions",
      "investments",
      "debts",
      "credits",
      "expenses",
      "calendar",
      "graph",
      "reports",
      "admin"
    ];
    
    const baselineUserModules = new Set([
      "dashboard",
      "history",
      "budget",
      "accounts",
      "debts",
      "credits",
      "expenses",
      "calendar",
      "reports"
    ]);

    defaultModules.forEach(mod => {
      if (role === "admin") {
        permissionsMap[mod] = "update";
      } else if (role === "viewer") {
        permissionsMap[mod] = "read";
      } else if (role === "guest") {
        permissionsMap[mod] = mod === "dashboard" ? "read" : "none";
      } else {
        // Standard user role: allow baseline user modules, hide advanced/new modules by default unless granted in DB
        permissionsMap[mod] = baselineUserModules.has(mod) ? "update" : "none";
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
