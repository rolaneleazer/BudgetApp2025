import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { getMcpConfig } from "./core.js";

// Dynamic getter for Supabase Admin client using the service role key
export function getSupabaseAdmin() {
  const config = getMcpConfig();
  const supabaseUrl = config.supabaseUrl;
  const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.MCP_SUPABASE_SERVICE_ROLE_KEY || "";
  const serviceRoleKey = rawKey.trim();

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    realtime: {
      transport: ws
    }
  });
}

export const supabaseAdmin = getSupabaseAdmin();

// Helper to reliably parse the request body in Express or serverless environments
export async function getRequestBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

// Helper to decode JWT payload without verification (for initial status checks)
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

// Verify if the request comes from an authorized admin user
export async function verifyAdmin(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return { authorized: false, error: "Missing authentication token" };
  }

  let email = "";
  let isUserAdmin = false;
  let user = null;
  const adminClient = getSupabaseAdmin();

  if (adminClient) {
    // Retrieve user using the JWT token via Supabase Auth
    const { data: { user: supabaseUser }, error } = await adminClient.auth.getUser(token);
    if (error || !supabaseUser) {
      return { authorized: false, error: error?.message || "Invalid authentication token" };
    }
    user = supabaseUser;
    email = user.email;
    
    const adminEmailsStr = process.env.ADMIN_EMAILS || "";
    const adminEmails = adminEmailsStr
      .split(",")
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    isUserAdmin = adminEmails.includes(email.toLowerCase()) || user.app_metadata?.role === "admin";
  } else {
    // Fallback: decode token locally to check email if service role key is missing
    const payload = decodeJwt(token);
    if (!payload || !payload.email) {
      return { authorized: false, error: "Invalid authentication token format" };
    }
    email = payload.email;
    
    const adminEmailsStr = process.env.ADMIN_EMAILS || "";
    const adminEmails = adminEmailsStr
      .split(",")
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    isUserAdmin = adminEmails.includes(email.toLowerCase()) || payload.app_metadata?.role === "admin";
    user = { email, id: payload.sub };
  }

  if (!isUserAdmin) {
    return { authorized: false, error: "Access denied: User is not an administrator" };
  }

  return { authorized: true, user };
}

// Shared Express/Vercel admin route handler
export async function adminHandler(req, res) {
  // CORS support
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    const { authorized, error, user } = await verifyAdmin(req);
    if (!authorized) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error }));
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;
    const supabaseAdmin = getSupabaseAdmin();

    // Endpoint: GET /api/admin/check
    if (pathname === "/api/admin/check" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ 
        isAdmin: true, 
        email: user.email, 
        adminConfigured: Boolean(supabaseAdmin) 
      }));
      return;
    }


    // Endpoint: GET /api/admin/users (List all users)
    if (pathname === "/api/admin/users" && req.method === "GET") {
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw listError;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ users }));
      return;
    }

    // Endpoint: POST /api/admin/users (Manually add a user)
    if (pathname === "/api/admin/users" && req.method === "POST") {
      const body = await getRequestBody(req);
      const { email, password, fullName } = body;

      if (!email || !password) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Email and password are required." }));
        return;
      }

      const { data: { user: newUser }, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName || email.split("@")[0] }
      });

      if (createError) throw createError;

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ user: newUser }));
      return;
    }

    // Endpoint: PATCH /api/admin/users (Update user details: password, email, full_name, role)
    if (pathname === "/api/admin/users" && req.method === "PATCH") {
      const body = await getRequestBody(req);
      const id = url.searchParams.get("id") || body.id;
      const { password, email, fullName, role } = body;

      if (!id) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "User ID is required." }));
        return;
      }

      const updatePayload = {};
      if (password) updatePayload.password = password;
      if (email) updatePayload.email = email;
      
      // Merge user_metadata
      if (fullName !== undefined || role !== undefined) {
        // Fetch current user metadata first to preserve existing fields
        const { data: currentObj } = await supabaseAdmin.auth.admin.getUserById(id);
        const existingMeta = currentObj?.user?.user_metadata || {};
        updatePayload.user_metadata = {
          ...existingMeta,
          ...(fullName !== undefined ? { full_name: fullName } : {}),
          ...(role !== undefined ? { role: role } : {})
        };
      }

      const { data: { user: updatedUser }, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(id, updatePayload);

      if (updateError) throw updateError;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ user: updatedUser }));
      return;
    }

    // Endpoint: DELETE /api/admin/users (Delete a user and clean up user_data and related tables)
    if (pathname === "/api/admin/users" && req.method === "DELETE") {
      const body = await getRequestBody(req);
      const id = url.searchParams.get("id") || body.id;

      if (!id) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "User ID is required." }));
        return;
      }

      // 1. Delete from all public schema tables referencing user_id or id to avoid foreign key violations
      const userTables = [
        "user_data",
        "user_roles",
        "user_settings",
        "notifications",
        "admin_audit_logs",
        "test_logs"
      ];

      for (const tbl of userTables) {
        try {
          await supabaseAdmin.from(tbl).delete().eq("user_id", id);
        } catch (e) {
          console.warn(`Could not clean up table ${tbl}:`, e);
        }
      }

      // Try profiles table (may use user_id or id)
      try {
        await supabaseAdmin.from("profiles").delete().eq("user_id", id);
        await supabaseAdmin.from("profiles").delete().eq("id", id);
      } catch (e) {
        console.warn("Could not clean up table profiles:", e);
      }

      // 2. Now delete from Supabase Auth
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (deleteAuthError) throw deleteAuthError;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "User deleted successfully." }));
      return;
    }

    // Endpoint: POST /api/admin/roles (Update user's role metadata)
    if (pathname === "/api/admin/roles" && req.method === "POST") {
      const body = await getRequestBody(req);
      const { userId, role } = body;

      if (!userId || !role) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "User ID and role are required." }));
        return;
      }

      const { data: currentObj } = await supabaseAdmin.auth.admin.getUserById(userId);
      const existingMeta = currentObj?.user?.user_metadata || {};

      const { data: { user: updatedUser }, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...existingMeta,
          role: role
        }
      });

      if (updateError) throw updateError;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ user: updatedUser }));
      return;
    }

    // Endpoint: GET /api/admin/permissions (Fetch role permissions)
    if (pathname === "/api/admin/permissions" && req.method === "GET") {
      try {
        const { data, error } = await supabaseAdmin
          .from("role_permissions")
          .select("*");
        if (error) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ permissions: [] }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ permissions: data || [] }));
      } catch {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ permissions: [] }));
      }
      return;
    }

    // Endpoint: POST /api/admin/permissions (Upsert role permission)
    if (pathname === "/api/admin/permissions" && req.method === "POST") {
      const body = await getRequestBody(req);
      const { role, moduleName, accessLevel } = body;

      try {
        const { data, error } = await supabaseAdmin
          .from("role_permissions")
          .upsert({
            role,
            module_name: moduleName,
            access_level: accessLevel,
            updated_at: new Date().toISOString()
          }, { onConflict: "role,module_name" })
          .select()
          .single();

        if (error) throw error;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ permission: data }));
      } catch {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ permission: { role, module_name: moduleName, access_level: accessLevel } }));
      }
      return;
    }

    // Endpoint: GET /api/admin/user-data (Fetch another user's data)
    if (pathname === "/api/admin/user-data" && req.method === "GET") {
      const userId = url.searchParams.get("userId");
      if (!userId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "User ID is required." }));
        return;
      }

      const { data, error: fetchErr } = await supabaseAdmin
        .from("user_data")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ userData: data }));
      return;
    }

    // Endpoint: POST/PATCH /api/admin/user-data (Update another user's data)
    if (pathname === "/api/admin/user-data" && (req.method === "POST" || req.method === "PATCH")) {
      const body = await getRequestBody(req);
      const userId = url.searchParams.get("userId") || body.userId;
      const { budgetData, accounts, majorExpenses, credits, debts, balanceHistory } = body;

      if (!userId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "User ID is required." }));
        return;
      }

      const { error: upsertErr } = await supabaseAdmin
        .from("user_data")
        .upsert({
          user_id: userId,
          budget_data: budgetData,
          accounts: accounts,
          major_expenses: majorExpenses,
          credits: credits,
          debts: debts,
          balance_history: balanceHistory,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });

      if (upsertErr) throw upsertErr;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Fallthrough route not matched
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Not Found: ${req.method} ${pathname}` }));

  } catch (err) {
    console.error("Admin API Error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message || "Internal server error." }));
    }
  }
}
