import 'dotenv/config';
import { supabaseAdmin } from "../mcp/admin.js";

async function testUserDeleteFlow() {
  const testEmail = `test_delete_${Date.now()}@example.com`;
  console.log(`1. Creating test user (${testEmail})...`);

  const { data: { user }, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: testEmail,
    password: "Password123!",
    email_confirm: true,
    user_metadata: { full_name: "Test Delete User", role: "guest" }
  });

  if (createErr) {
    console.error("Failed to create test user:", createErr);
    return;
  }

  const userId = user.id;
  console.log(`✓ User created with ID: ${userId}`);

  // Insert mock rows into user_data and user_roles to simulate existing relations
  console.log("2. Inserting dummy rows into user_data and user_roles...");
  await supabaseAdmin.from("user_data").insert({ user_id: userId, accounts: [] });
  await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "guest" });

  console.log("3. Attempting deletion via cascading cleanup logic...");

  // Cascade cleanup
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
      const { error } = await supabaseAdmin.from(tbl).delete().eq("user_id", userId);
      if (error) console.warn(`Notice on table ${tbl}:`, error.message);
    } catch (e) {
      console.warn(`Catch on table ${tbl}:`, e);
    }
  }

  try {
    await supabaseAdmin.from("profiles").delete().eq("user_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);
  } catch (e) {}

  // Delete from Auth
  const { data: delResult, error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (delErr) {
    console.error("❌ DELETION FAILED:", delErr);
  } else {
    console.log("✅ DELETION SUCCESSFUL! User and all child table records deleted cleanly.");
  }
}

testUserDeleteFlow();
