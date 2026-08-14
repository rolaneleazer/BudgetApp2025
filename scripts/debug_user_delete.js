import 'dotenv/config';
import { supabaseAdmin } from "../mcp/admin.js";

async function inspectForeignKeys() {
  console.log("Checking Supabase tables and foreign keys...");
  try {
    // Check tables in public schema
    const { data: tables, error: tablesErr } = await supabaseAdmin.rpc('exec_sql', {
      query: `
        SELECT
            tc.table_schema, 
            tc.constraint_name, 
            tc.table_name, 
            kcu.column_name, 
            ccu.table_schema AS foreign_table_schema,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name 
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.referential_constraints AS rco
          ON rco.constraint_name = tc.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = rco.unique_constraint_name
        WHERE ccu.table_name = 'users' OR tc.table_name = 'user_data';
      `
    });

    if (tablesErr) {
      console.log("exec_sql RPC not available, querying directly via REST or listing known tables...");
      console.error(tablesErr);
    } else {
      console.log("Foreign keys referencing auth.users:", JSON.stringify(tables, null, 2));
    }

    // Try deleting from user_data directly for target user
    const targetId = "f8b8a3ad-ed35-4efd-8d96-d29c612abd6e";
    console.log(`\nTesting manual deletion for user ${targetId}...`);
    
    // 1. Delete from user_data
    const { data: d1, error: e1 } = await supabaseAdmin
      .from("user_data")
      .delete()
      .eq("user_id", targetId);
    console.log("Delete from user_data result:", { d1, error: e1?.message });

    // 2. Check if other tables exist in public schema
    const publicTables = ["profiles", "role_permissions", "test_logs", "user_roles", "permissions"];
    for (const tbl of publicTables) {
      const { data: d, error: e } = await supabaseAdmin.from(tbl).delete().eq("user_id", targetId);
      if (!e) console.log(`Deleted from table '${tbl}' for user ${targetId}`);
    }

    // 3. Try deleting auth user
    const { data: dAuth, error: eAuth } = await supabaseAdmin.auth.admin.deleteUser(targetId);
    console.log("Delete from auth.users result:", { data: dAuth, error: eAuth });

  } catch (err) {
    console.error("Error inspecting:", err);
  }
}

inspectForeignKeys();
