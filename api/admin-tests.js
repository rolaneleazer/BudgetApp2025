import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { createBudgetMcpServer, normalizeProfile, buildModulePayload } from "../mcp/core.js";
import { shouldFire } from "../mcp/scheduler.js";

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

function runSystemTest(moduleName) {
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

  const results = {};

  const runSingleModule = (mod) => {
    try {
      const profile = normalizeProfile(mockRow);
      buildModulePayload(profile, mod, { year: 2026, month: 7 });
      results[mod] = { status: "success", error: null };
    } catch (err) {
      results[mod] = { status: "failure", error: err.message };
    }
  };

  const runMcp = () => {
    try {
      const server = createBudgetMcpServer();
      const registeredTools = Object.keys(server._registeredTools || {});
      const expectedTools = ["get_net_worth", "get_financial_profile", "select_user_data"];
      for (const t of expectedTools) {
        if (!registeredTools.includes(t)) {
          throw new Error(`Tool ${t} not registered`);
        }
      }
      results["mcp"] = { status: "success", error: null };
    } catch (err) {
      results["mcp"] = { status: "failure", error: err.message };
    }
  };

  const runScheduler = () => {
    try {
      const mockSchedule = { frequency: "daily", time: "08:00", timezone: "Asia/Manila", last_sent_at: null };
      shouldFire(mockSchedule);
      results["scheduler"] = { status: "success", error: null };
    } catch (err) {
      results["scheduler"] = { status: "failure", error: err.message };
    }
  };

  const modules = ["dashboard", "history", "monthly", "accounts", "investments", "debts", "credits", "major", "calendar", "raw"];

  if (moduleName === "all") {
    modules.forEach(runSingleModule);
    runMcp();
    runScheduler();
  } else if (moduleName === "mcp") {
    runMcp();
  } else if (moduleName === "scheduler") {
    runScheduler();
  } else if (modules.includes(moduleName)) {
    runSingleModule(moduleName);
  } else {
    throw new Error(`Unknown module: ${moduleName}`);
  }

  return results;
}

export default async function handler(req, res) {
  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured." });
  }

  const userId = await getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  const action = req.query?.action || new URL(req.url, 'http://localhost').searchParams.get('action');

  if (req.method === 'GET') {
    // Fetch test logs history
    const { data, error } = await supabase
      .from('system_test_logs')
      .select('*')
      .eq('user_id', userId)
      .order('tested_at', { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ logs: data || [] });
  }

  if (req.method === 'POST') {
    const { module: moduleName } = req.body || {};
    if (!moduleName) {
      return res.status(400).json({ error: "Missing module name." });
    }

    try {
      const results = runSystemTest(moduleName);
      const hasFailure = Object.values(results).some(r => r.status === "failure");
      const status = hasFailure ? "failure" : "success";

      const { data: logEntry, error: saveErr } = await supabase
        .from('system_test_logs')
        .insert({
          user_id: userId,
          module_name: moduleName,
          status,
          results
        })
        .select()
        .single();

      if (saveErr) {
        console.error("Failed to save system_test_log:", saveErr.message);
      }

      return res.status(200).json({ success: true, status, results, log: logEntry });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed." });
}
