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
      const { data: userRoles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesErr) throw rolesErr;

      const { data: { users }, error: authErr } = await supabase.auth.admin.listUsers();
      if (authErr) throw authErr;

      const usersWithRoles = users.map(u => {
        const roleEntry = userRoles?.find(r => r.user_id === u.id);
        return {
          id: u.id,
          email: u.email,
          fullName: u.user_metadata?.full_name || "",
          role: roleEntry ? roleEntry.role : "user"
        };
      });

      return res.status(200).json({ users: usersWithRoles });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    try {
      const body = await getRequestBody(req);
      const { userId, role } = body;
      if (!userId || !role) {
        return res.status(400).json({ error: "Missing userId or role." });
      }

      const { data, error: upsertErr } = await supabase
        .from("user_roles")
        .upsert({ user_id: userId, role }, { onConflict: "user_id" })
        .select()
        .single();

      if (upsertErr) throw upsertErr;

      const { error: updateAuthErr } = await supabase.auth.admin.updateUserById(userId, {
        app_metadata: { role }
      });
      if (updateAuthErr) {
        console.warn("Failed to update user app_metadata:", updateAuthErr.message);
      }

      return res.status(200).json({ success: true, userRole: data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed." });
}
