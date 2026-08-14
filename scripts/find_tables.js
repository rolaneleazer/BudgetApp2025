import 'dotenv/config';
import { supabaseAdmin } from "../mcp/admin.js";

async function findPublicTables() {
  const candidateTables = [
    "user_data",
    "user_roles",
    "profiles",
    "permissions",
    "role_permissions",
    "test_logs",
    "admin_audit_logs",
    "notifications",
    "user_settings"
  ];

  console.log("Checking candidate public tables...");
  for (const table of candidateTables) {
    const { data, error } = await supabaseAdmin.from(table).select("count", { count: "exact", head: true });
    if (!error) {
      console.log(`Table EXISTS: public.${table}`);
    } else {
      console.log(`Table ${table}:`, error.message);
    }
  }
}

findPublicTables();
