import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { getMcpConfig } from "./core.js";

// Initialize Supabase Admin client using the service role key
const config = getMcpConfig();
const supabaseUrl = config.supabaseUrl;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.MCP_SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      realtime: {
        transport: ws
      }
    })
  : null;

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

  if (supabaseAdmin) {
    // Retrieve user using the JWT token via Supabase Auth
    const { data: { user: supabaseUser }, error } = await supabaseAdmin.auth.getUser(token);
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

    // Endpoint: PATCH /api/admin/users (Reset user's password)
    if (pathname === "/api/admin/users" && req.method === "PATCH") {
      const body = await getRequestBody(req);
      const id = url.searchParams.get("id") || body.id;
      const { password } = body;

      if (!id || !password) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "User ID and new password are required." }));
        return;
      }

      const { data: { user: updatedUser }, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(id, {
        password
      });

      if (updateError) throw updateError;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ user: updatedUser }));
      return;
    }

    // Endpoint: DELETE /api/admin/users (Delete a user and clean up user_data)
    if (pathname === "/api/admin/users" && req.method === "DELETE") {
      const body = await getRequestBody(req);
      const id = url.searchParams.get("id") || body.id;

      if (!id) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "User ID is required." }));
        return;
      }

      // 1. Delete from Supabase Auth
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (deleteAuthError) throw deleteAuthError;

      // 2. Clear user data table
      const { error: deleteDbError } = await supabaseAdmin
        .from("user_data")
        .delete()
        .eq("user_id", id);
      
      if (deleteDbError) {
        console.warn("Could not delete user_data row, it might not exist:", deleteDbError);
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "User deleted successfully." }));
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
