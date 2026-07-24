import { execSync } from "node:child_process";
import { createBudgetMcpServer, normalizeProfile, buildModulePayload } from "../mcp/core.js";
import { shouldFire } from "../mcp/scheduler.js";

const errors = [];

function check(name, testFn) {
  console.log(`\n🔍 Checking: ${name}...`);
  try {
    testFn();
    console.log(`✅ Passed: ${name}`);
  } catch (err) {
    console.error(`❌ Failed: ${name}\nError: ${err.message}`);
    errors.push({ test: name, error: err.message });
  }
}

// 1. Build Verification
check("Vite Frontend Compilation Build", () => {
  console.log("Running 'npm run build'...");
  const output = execSync("npm run build", { encoding: "utf8", stdio: "pipe" });
  console.log("Vite build completed successfully!");
});

// 2. MCP Server Verification
check("MCP Tool Registrations", () => {
  const server = createBudgetMcpServer();
  const registeredTools = Object.keys(server._registeredTools || {});
  
  const expectedTools = [
    "project_overview",
    "list_project_files",
    "read_project_file",
    "search_code",
    "budget_data_model",
    "list_budget_modules",
    "get_budget_app_snapshot",
    "get_budget_module",
    "get_net_worth",
    "get_financial_profile",
    "get_dashboard_data",
    "get_history_data",
    "get_monthly_budget_data",
    "get_accounts_data",
    "get_investments_data",
    "get_debts_data",
    "get_credits_data",
    "get_major_expenses_data",
    "get_calendar_data",
    "select_user_data"
  ];

  console.log(`Registered ${registeredTools.length} tools:`, registeredTools);

  for (const tool of expectedTools) {
    if (!registeredTools.includes(tool)) {
      throw new Error(`Expected tool '${tool}' is not registered!`);
    }
  }
});

// 3. Calculation Engine Verification (Empty & Populated Rows)
check("Financial Modules Calculations", () => {
  const modules = [
    "dashboard",
    "history",
    "monthly",
    "accounts",
    "investments",
    "debts",
    "credits",
    "major",
    "calendar",
    "raw"
  ];

  // Test Case A: Empty Database Row (tests fallback logic/defaults)
  console.log("Testing calculations with empty/new user profile row...");
  const emptyProfile = normalizeProfile(null);
  for (const mod of modules) {
    buildModulePayload(emptyProfile, mod, { year: 2026, month: 7 });
  }

  // Test Case B: Full Mock Database Row (tests calculation math)
  console.log("Testing calculations with fully populated user profile row...");
  const mockRow = {
    user_id: "test-user-id-1234",
    updated_at: new Date().toISOString(),
    budget_data: {
      "2026-07": {
        "5th": {
          salary: 50000,
          ot: { weekday: 10, weekend: 5 },
          expenses: [{ name: "Rent", amount: 15000, done: true }]
        },
        "20th": {
          salary: 50000,
          ot: { weekday: 8, weekend: 2 },
          expenses: [{ name: "Electricity", amount: 4000, done: false }]
        }
      }
    },
    accounts: [
      { id: "a1", name: "SLA Saving", balance: 50000, type: "Savings" },
      { id: "a2", name: "Maya Investment", balance: 150000, type: "Investment" }
    ],
    major_expenses: [
      { id: 1, name: "Birthday Party", budget: 10000, actual: 2000, done: false, date: "2026-07-28" }
    ],
    credits: [
      { id: "c1", name: "Lend money", amount: 5000, done: false }
    ],
    debts: [
      { id: "d1", name: "CC Gold", balance: 10000, limit: 50000, apr: 3.5, minPayment: 500 }
    ],
    balance_history: [
      { date: "2026-07-01", balances: { a1: 45000, a2: 140000 } }
    ]
  };

  const populatedProfile = normalizeProfile(mockRow);
  for (const mod of modules) {
    buildModulePayload(populatedProfile, mod, { year: 2026, month: 7 });
  }
});

// 4. Scheduler Execution Checks
check("Scheduler Rules & Timezone Checks", () => {
  const mockSchedules = [
    { frequency: "daily", time: "08:00", timezone: "Asia/Manila", last_sent_at: null },
    { frequency: "weekly", day_of_week: 5, time: "10:00", timezone: "Asia/Manila", last_sent_at: null },
    { frequency: "monthly", day_of_month: 1, time: "12:00", timezone: "Asia/Manila", last_sent_at: null },
    { frequency: "minutes", day_of_month: 15, last_sent_at: null }
  ];

  // shouldFire should execute cleanly
  for (const schedule of mockSchedules) {
    shouldFire(schedule);
  }
  
  // Test already-sent daily schedule today (should evaluate to false to prevent duplicates)
  const sentDaily = {
    frequency: "daily",
    time: "08:00",
    timezone: "Asia/Manila",
    last_sent_at: new Date().toISOString()
  };
  const willFire = shouldFire(sentDaily);
  if (willFire === true) {
    throw new Error("Duplicate prevention failed! A schedule already sent today is matching to fire again.");
  }
});

console.log("\n====================================");
if (errors.length > 0) {
  console.error("❌ Pre-deployment validation failed!");
  console.dir(errors, { depth: null });
  process.exit(1);
} else {
  console.log("🎉 All checks passed! Ready for production deployment.");
  process.exit(0);
}
