import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import ws from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const ignoredDirs = new Set([
  ".git",
  ".agents",
  ".codex",
  "node_modules",
  "dist",
  "dist-ssr",
  "coverage",
]);
const blockedFileNames = new Set([".env"]);
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mjs",
  ".cjs",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const otRates = { weekday: 750, weekend: 680 };
const taxRate = 0.2;

const defaultAccounts = [
  { id: "sla-c", name: "SLA Capcon", balance: 507000, type: "Investment" },
  { id: "sla-s", name: "SLA Saving", balance: 15000, type: "Savings" },
  { id: "mp2", name: "Pagibig MP2", balance: 128000, type: "Investment" },
  { id: "git", name: "Business Gitstack", balance: 40000, type: "Checking" },
  { id: "sbc", name: "SB Checking", balance: 25000, type: "Checking" },
  { id: "sbe1", name: "SB eSaving 1", balance: 263000, type: "Savings" },
  { id: "sbe2", name: "SB eSaving 2", balance: 500, type: "Savings" },
  { id: "maya", name: "Maya / Ownbank", balance: 306900, type: "Digital" },
];

const defaultMajorExpenses = [
  { id: 1, name: "Parent Birthday", budget: 60000, actual: 0, done: false, date: "2026-08-15" },
  { id: 2, name: "Eisley Wedding", budget: 60000, actual: 0, done: false, date: "2026-10-10" },
  { id: 3, name: "Zed Wedding", budget: 45000, actual: 0, done: false, date: "2026-11-20" },
  { id: 4, name: "Papa Hospital", budget: 172000, actual: 0, done: true, date: "2025-11-15" },
  { id: 5, name: "Christmas Food", budget: 38000, actual: 38000, done: true, date: "2025-12-25" },
  { id: 6, name: "Christmas Gifts", budget: 48000, actual: 0, done: false, date: "2026-12-24" },
  { id: 7, name: "Omega Watch", budget: 30000, actual: 0, done: false, date: "2027-02-14" },
  { id: 8, name: "Birthday (Office)", budget: 30000, actual: 0, done: false, date: "2026-07-01" },
  { id: 9, name: "Japan Trip", budget: 180000, actual: 0, done: false, date: "2027-04-10" },
];

const defaultDebts = [
  { id: "d1", name: "RCBC CC", balance: 24500, limit: 100000, apr: 3.5, minPayment: 1200 },
  { id: "d2", name: "RCBC Gold", balance: 12000, limit: 50000, apr: 3.5, minPayment: 600 },
  { id: "d3", name: "Atome", balance: 5000, limit: 20000, apr: 0, minPayment: 1666 },
];

const moduleNames = [
  "dashboard",
  "history",
  "monthly",
  "accounts",
  "investments",
  "debts",
  "credits",
  "major",
  "calendar",
  "raw",
];

export function getMcpConfig() {
  const host = process.env.MCP_HOST || "127.0.0.1";
  const accessToken = process.env.MCP_ACCESS_TOKEN || "";
  const defaultUserId = process.env.MCP_DEFAULT_USER_ID || "";
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.MCP_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  return {
    host,
    port: Number(process.env.MCP_PORT || 3333),
    accessToken,
    allowedHosts: (process.env.MCP_ALLOWED_HOSTS || "localhost,127.0.0.1")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    defaultUserId,
    supabaseUrl,
    supabaseKey,
    supabaseKeySource: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? "service"
      : process.env.MCP_SUPABASE_SERVICE_ROLE_KEY
        ? "mcp_service"
        : process.env.VITE_SUPABASE_ANON_KEY
          ? "anon"
          : "missing",
    hasSupabase: Boolean(supabaseUrl && supabaseKey),
  };
}

export function isAuthorized(req) {
  const { accessToken } = getMcpConfig();
  if (!accessToken) return true;

  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  return bearerToken === accessToken;
}

export function healthPayload() {
  const config = getMcpConfig();
  return {
    ok: true,
    name: "budgetapp2025-remote-mcp",
    auth: Boolean(config.accessToken),
    supabase: config.hasSupabase,
    supabaseKeySource: config.supabaseKeySource,
    defaultUser: Boolean(config.defaultUserId),
  };
}

function getSupabaseClient() {
  const { supabaseUrl, supabaseKey } = getMcpConfig();
  return supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, {
    realtime: {
      transport: ws
    }
  }) : null;
}

function jsonContent(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function textContent(text) {
  return {
    content: [{ type: "text", text }],
  };
}

function toRelativePath(absolutePath) {
  return path.relative(projectRoot, absolutePath).replaceAll(path.sep, "/");
}

function resolveSafePath(inputPath) {
  const normalizedInput = inputPath.replaceAll("\\", "/");
  if (normalizedInput.includes("\0")) {
    throw new Error("Invalid path.");
  }

  const absolutePath = path.resolve(projectRoot, normalizedInput);
  const relativePath = path.relative(projectRoot, absolutePath);
  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    relativePath === ""
  ) {
    throw new Error("Path must stay inside the project.");
  }

  const parts = relativePath.split(path.sep);
  if (parts.some((part) => ignoredDirs.has(part) || blockedFileNames.has(part))) {
    throw new Error("That path is not available through this MCP server.");
  }

  return absolutePath;
}

async function isTextFile(absolutePath) {
  return textExtensions.has(path.extname(absolutePath).toLowerCase());
}

async function walkFiles(directory, results = []) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name) || blockedFileNames.has(entry.name)) continue;

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(absolutePath, results);
    } else if (entry.isFile()) {
      results.push(absolutePath);
    }
  }

  return results;
}

async function readJsonFile(relativePath) {
  try {
    const absolutePath = resolveSafePath(relativePath);
    return JSON.parse(await fs.readFile(absolutePath, "utf8"));
  } catch {
    return null;
  }
}

async function getUserDataRow({ userId } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for the MCP server.");
  }

  const { defaultUserId } = getMcpConfig();
  const effectiveUserId = userId || defaultUserId;
  let query = supabase.from("user_data").select("*").limit(1);

  if (effectiveUserId) {
    query = query.eq("user_id", effectiveUserId);
  } else {
    query = query.order("updated_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return data?.[0] || null;
}

function numberValue(value) {
  return Number(value) || 0;
}

function makeKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function parseMonthKey(key) {
  const [year, month] = String(key || "").split("-");
  return {
    year: Number.parseInt(year, 10),
    monthIndex: Number.parseInt(month, 10) - 1,
  };
}

function displayMonthKey(key) {
  const { year, monthIndex } = parseMonthKey(key);
  if (!year || monthIndex < 0 || monthIndex > 11) return key;
  return `${monthNames[monthIndex]} ${year}`;
}

function classifyExpense(name) {
  const normalized = String(name || "").toLowerCase();
  if (
    normalized.includes("rent") ||
    normalized.includes("parent") ||
    normalized.includes("pru") ||
    normalized.includes("insurance")
  ) {
    return "Fixed";
  }
  if (
    normalized.includes("cc") ||
    normalized.includes("gold") ||
    normalized.includes("watch") ||
    normalized.includes("atome") ||
    normalized.includes("zed") ||
    normalized.includes("iphone") ||
    normalized.includes("loan")
  ) {
    return "Debt";
  }
  if (
    normalized.includes("mp2") ||
    normalized.includes("investment") ||
    normalized.includes("invest")
  ) {
    return "Investment";
  }
  return "Variable";
}

function calcOt(ot = {}) {
  const weekdayEarned = numberValue(ot.weekday) * otRates.weekday;
  const weekendEarned = numberValue(ot.weekend) * otRates.weekend;
  const gross = weekdayEarned + weekendEarned;
  const tax = gross * taxRate;
  return { gross, tax, net: gross - tax, weekdayEarned, weekendEarned };
}

function calcPeriodSummary(period = {}) {
  const expenses = Array.isArray(period.expenses) ? period.expenses : [];
  const otCalc = calcOt(period.ot || {});
  const totalIncome = numberValue(period.salary) + otCalc.net;
  const totalExpenses = expenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0);
  const paidExpenses = expenses
    .filter((expense) => expense.done)
    .reduce((sum, expense) => sum + numberValue(expense.amount), 0);

  return {
    otCalc,
    totalIncome,
    totalExpenses,
    paidExpenses,
    netSavings: totalIncome - totalExpenses,
    unpaidExpenses: totalExpenses - paidExpenses,
    expenseCount: expenses.length,
    paidExpenseCount: expenses.filter((expense) => expense.done).length,
  };
}

function calcMonthSummary(monthData = {}) {
  const fifth = monthData["5th"] || {};
  const twentieth = monthData["20th"] || {};
  const s5 = calcPeriodSummary(fifth);
  const s20 = calcPeriodSummary(twentieth);
  const income = s5.totalIncome + s20.totalIncome;
  const expenses = s5.totalExpenses + s20.totalExpenses;
  const savings = s5.netSavings + s20.netSavings;

  return {
    income,
    expenses,
    savings,
    s5,
    s20,
    otIncome: s5.otCalc.net + s20.otCalc.net,
    otHours:
      numberValue(fifth.ot?.weekday) +
      numberValue(fifth.ot?.weekend) +
      numberValue(twentieth.ot?.weekday) +
      numberValue(twentieth.ot?.weekend),
    savingsRate: income > 0 ? (savings / income) * 100 : 0,
  };
}

function normalizeProfile(row) {
  return {
    userId: row?.user_id,
    updatedAt: row?.updated_at,
    budgetData: row?.budget_data && typeof row.budget_data === "object" ? row.budget_data : {},
    accounts: Array.isArray(row?.accounts) ? row.accounts : defaultAccounts,
    majorExpenses: Array.isArray(row?.major_expenses) ? row.major_expenses : defaultMajorExpenses,
    credits: Array.isArray(row?.credits) ? row.credits : [],
    debts: Array.isArray(row?.debts) ? row.debts : defaultDebts,
    balanceHistory: Array.isArray(row?.balance_history) ? row.balance_history : [],
  };
}

function summarizeNetWorth(row) {
  const { accounts, credits, debts, userId, updatedAt } = normalizeProfile(row);

  const accountBreakdown = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    balance: numberValue(account.balance),
  }));
  const creditBreakdown = credits
    .filter((credit) => !credit.done)
    .map((credit) => ({
      id: credit.id,
      name: credit.name,
      amount: numberValue(credit.amount),
    }));
  const debtBreakdown = debts.map((debt) => ({
    id: debt.id,
    name: debt.name,
    balance: numberValue(debt.balance),
    limit: numberValue(debt.limit),
    apr: numberValue(debt.apr),
  }));

  const totalAccounts = accountBreakdown.reduce((sum, account) => sum + account.balance, 0);
  const totalCredits = creditBreakdown.reduce((sum, credit) => sum + credit.amount, 0);
  const totalDebts = debtBreakdown.reduce((sum, debt) => sum + debt.balance, 0);
  const netWorth = totalAccounts + totalCredits - totalDebts;
  const debtLimit = debtBreakdown.reduce((sum, debt) => sum + debt.limit, 0);

  const byAccountType = accountBreakdown.reduce((groups, account) => {
    groups[account.type || "Other"] = (groups[account.type || "Other"] || 0) + account.balance;
    return groups;
  }, {});

  return {
    userId,
    updatedAt,
    totals: {
      accounts: totalAccounts,
      openCredits: totalCredits,
      debts: totalDebts,
      netWorth,
      debtLimit,
      debtUtilization: debtLimit > 0 ? totalDebts / debtLimit : null,
    },
    byAccountType,
    accounts: accountBreakdown,
    openCredits: creditBreakdown,
    debts: debtBreakdown,
  };
}

function summarizeAccounts(accounts) {
  const accountList = accounts.map((account) => ({
    ...account,
    balance: numberValue(account.balance),
  }));
  const byType = accountList.reduce((groups, account) => {
    const type = account.type || "Other";
    groups[type] = (groups[type] || 0) + account.balance;
    return groups;
  }, {});

  return {
    total: accountList.reduce((sum, account) => sum + account.balance, 0),
    byType,
    accounts: accountList,
  };
}

function summarizeDebts(debts) {
  const debtList = debts.map((debt) => ({
    ...debt,
    balance: numberValue(debt.balance),
    limit: numberValue(debt.limit),
    apr: numberValue(debt.apr),
    minPayment: numberValue(debt.minPayment),
  }));
  const totalOwed = debtList.reduce((sum, debt) => sum + debt.balance, 0);
  const totalLimit = debtList.reduce((sum, debt) => sum + debt.limit, 0);

  return {
    totalOwed,
    totalLimit,
    availableCredit: totalLimit - totalOwed,
    utilization: totalLimit > 0 ? totalOwed / totalLimit : null,
    minimumPaymentTotal: debtList.reduce((sum, debt) => sum + debt.minPayment, 0),
    debts: debtList,
  };
}

function summarizeCredits(credits) {
  const creditList = credits.map((credit) => ({
    ...credit,
    amount: numberValue(credit.amount),
  }));

  return {
    totalOpen: creditList
      .filter((credit) => !credit.done)
      .reduce((sum, credit) => sum + credit.amount, 0),
    totalCollected: creditList
      .filter((credit) => credit.done)
      .reduce((sum, credit) => sum + credit.amount, 0),
    credits: creditList,
  };
}

function summarizeMajorExpenses(majorExpenses) {
  const majorList = majorExpenses.map((expense) => ({
    ...expense,
    budget: numberValue(expense.budget),
    actual: numberValue(expense.actual),
  }));

  return {
    totalBudget: majorList.reduce((sum, expense) => sum + expense.budget, 0),
    totalActual: majorList.reduce((sum, expense) => sum + expense.actual, 0),
    doneCount: majorList.filter((expense) => expense.done).length,
    upcoming: majorList
      .filter((expense) => !expense.done)
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))),
    expenses: majorList,
  };
}

function summarizeMonthlyBudget(budgetData) {
  const months = Object.keys(budgetData)
    .filter((key) => /^\d{4}-\d{2}$/.test(key))
    .sort()
    .map((key) => ({
      key,
      label: displayMonthKey(key),
      summary: calcMonthSummary(budgetData[key]),
      data: budgetData[key],
    }));

  const totals = months.reduce(
    (acc, month) => {
      acc.income += month.summary.income;
      acc.expenses += month.summary.expenses;
      acc.savings += month.summary.savings;
      return acc;
    },
    { income: 0, expenses: 0, savings: 0 },
  );

  return {
    totals: {
      ...totals,
      savingsRate: totals.income > 0 ? (totals.savings / totals.income) * 100 : 0,
    },
    months,
  };
}

function summarizeInvestments(accounts) {
  const investments = accounts
    .filter((account) => {
      const name = String(account.name || "").toLowerCase();
      return account.type === "Investment" || name.includes("capcon") || name.includes("mp2");
    })
    .map((account) => ({
      ...account,
      balance: numberValue(account.balance),
    }));

  return {
    total: investments.reduce((sum, account) => sum + account.balance, 0),
    investments,
  };
}

function summarizeHistory(budgetData, balanceHistory) {
  const monthly = summarizeMonthlyBudget(budgetData).months;
  return {
    monthly: monthly.map((month) => ({
      key: month.key,
      label: month.label,
      income: month.summary.income,
      expenses: month.summary.expenses,
      savings: month.summary.savings,
      savingsRate: month.summary.savingsRate,
      otIncome: month.summary.otIncome,
      otHours: month.summary.otHours,
    })),
    balanceHistory,
  };
}

function summarizeCalendar(budgetData, year, monthIndex) {
  const key = makeKey(year, monthIndex);
  const monthData = budgetData[key] || {};
  const events = [];

  for (const [period, day] of [["5th", 5], ["20th", 20]]) {
    events.push({ date: `${key}-${String(day).padStart(2, "0")}`, type: "payroll", label: `Payroll ${period}` });
    const expenses = Array.isArray(monthData[period]?.expenses) ? monthData[period].expenses : [];
    for (const expense of expenses) {
      if (numberValue(expense.amount) > 0) {
        events.push({
          date: `${key}-${String(day).padStart(2, "0")}`,
          type: "bill",
          label: expense.name,
          amount: numberValue(expense.amount),
          budget: numberValue(expense.budget),
          done: Boolean(expense.done),
          category: classifyExpense(expense.name),
        });
      }
    }
  }

  return {
    key,
    label: displayMonthKey(key),
    events,
    unpaidBills: events.filter((event) => event.type === "bill" && !event.done),
    paidBills: events.filter((event) => event.type === "bill" && event.done),
  };
}

function dashboardSnapshot(profile) {
  const now = new Date();
  const currentKey = makeKey(now.getFullYear(), now.getMonth());
  const monthly = summarizeMonthlyBudget(profile.budgetData);
  const currentMonth = profile.budgetData[currentKey]
    ? calcMonthSummary(profile.budgetData[currentKey])
    : null;
  const activeMonths = monthly.months.filter((month) => month.summary.income > 0);
  const averageExpenses = activeMonths.length
    ? activeMonths.reduce((sum, month) => sum + month.summary.expenses, 0) / activeMonths.length
    : 0;
  const liquid = profile.accounts
    .filter((account) => ["Savings", "Checking", "Digital"].includes(account.type))
    .reduce((sum, account) => sum + numberValue(account.balance), 0);
  const debtSummary = summarizeDebts(profile.debts);
  const netWorth = summarizeNetWorth({
    user_id: profile.userId,
    updated_at: profile.updatedAt,
    accounts: profile.accounts,
    credits: profile.credits,
    debts: profile.debts,
  });

  return {
    currentMonthKey: currentKey,
    currentMonth,
    netWorth: netWorth.totals.netWorth,
    monthlySavings: currentMonth?.savings || 0,
    savingsRate: currentMonth?.savingsRate || 0,
    emergencyFundMonths: averageExpenses > 0 ? liquid / averageExpenses : 0,
    debtRatio: currentMonth?.income ? debtSummary.totalOwed / currentMonth.income : null,
    accountsTotal: netWorth.totals.accounts,
    openCreditsTotal: netWorth.totals.openCredits,
    debtsTotal: netWorth.totals.debts,
    updatedAt: profile.updatedAt,
  };
}

function buildModulePayload(profile, moduleName, args = {}) {
  switch (moduleName) {
    case "dashboard":
      return dashboardSnapshot(profile);
    case "history":
      return summarizeHistory(profile.budgetData, profile.balanceHistory);
    case "monthly":
      return summarizeMonthlyBudget(profile.budgetData);
    case "accounts":
      return summarizeAccounts(profile.accounts);
    case "investments":
      return summarizeInvestments(profile.accounts);
    case "debts":
      return summarizeDebts(profile.debts);
    case "credits":
      return summarizeCredits(profile.credits);
    case "major":
      return summarizeMajorExpenses(profile.majorExpenses);
    case "calendar": {
      const now = new Date();
      return summarizeCalendar(
        profile.budgetData,
        args.year || now.getFullYear(),
        args.month ? args.month - 1 : now.getMonth(),
      );
    }
    case "raw":
      return profile;
    default:
      throw new Error(`Unknown module '${moduleName}'.`);
  }
}

export function createBudgetMcpServer() {
  const server = new McpServer({
    name: "budgetapp2025-remote-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "project_overview",
    {
      title: "Project overview",
      description: "Summarize this app's package metadata, scripts, and known data model.",
      inputSchema: {},
    },
    async () => {
      const packageJson = await readJsonFile("package.json");
      return jsonContent({
        name: packageJson?.name || "BudgetApp2025",
        type: packageJson?.type,
        scripts: packageJson?.scripts || {},
        dependencies: packageJson?.dependencies || {},
        knownSupabaseTables: ["user_data"],
        notes: [
          "The frontend is a Vite React app.",
          "Budget data is read from and synced to Supabase table user_data.",
          "This MCP server exposes read-only project and financial profile tools.",
        ],
      });
    },
  );

  server.registerTool(
    "list_project_files",
    {
      title: "List project files",
      description: "List non-secret project files, excluding node_modules, .git, build output, and .env files.",
      inputSchema: {
        maxFiles: z.number().int().min(1).max(500).default(150),
      },
    },
    async ({ maxFiles }) => {
      const files = await walkFiles(projectRoot);
      return jsonContent({
        count: Math.min(files.length, maxFiles),
        truncated: files.length > maxFiles,
        files: files.slice(0, maxFiles).map(toRelativePath),
      });
    },
  );

  server.registerTool(
    "read_project_file",
    {
      title: "Read project file",
      description: "Read a non-secret text file from the project.",
      inputSchema: {
        path: z.string().min(1).describe("Relative path from the project root."),
        maxBytes: z.number().int().min(1_000).max(200_000).default(80_000),
      },
    },
    async ({ path: filePath, maxBytes }) => {
      const absolutePath = resolveSafePath(filePath);
      if (!(await isTextFile(absolutePath))) {
        throw new Error("Only known text/code file types can be read.");
      }

      const handle = await fs.open(absolutePath, "r");
      try {
        const buffer = Buffer.alloc(maxBytes);
        const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
        return textContent(buffer.subarray(0, bytesRead).toString("utf8"));
      } finally {
        await handle.close();
      }
    },
  );

  server.registerTool(
    "search_code",
    {
      title: "Search code",
      description: "Search project text files for a case-insensitive string.",
      inputSchema: {
        query: z.string().min(2),
        maxResults: z.number().int().min(1).max(100).default(25),
      },
    },
    async ({ query, maxResults }) => {
      const files = await walkFiles(projectRoot);
      const needle = query.toLowerCase();
      const matches = [];

      for (const absolutePath of files) {
        if (matches.length >= maxResults) break;
        if (!(await isTextFile(absolutePath))) continue;

        const text = await fs.readFile(absolutePath, "utf8").catch(() => "");
        const lines = text.split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
          if (!lines[index].toLowerCase().includes(needle)) continue;
          matches.push({
            file: toRelativePath(absolutePath),
            line: index + 1,
            preview: lines[index].trim().slice(0, 300),
          });
          if (matches.length >= maxResults) break;
        }
      }

      return jsonContent({ query, matches, truncated: matches.length >= maxResults });
    },
  );

  server.registerTool(
    "budget_data_model",
    {
      title: "Budget data model",
      description: "Describe the app's known Supabase table and JSON fields.",
      inputSchema: {},
    },
    async () =>
      jsonContent({
        table: "user_data",
        knownColumnsFromApp: [
          "id",
          "user_id",
          "budget_data",
          "accounts",
          "major_expenses",
          "credits",
          "debts",
          "balance_history",
          "created_at",
          "updated_at",
        ],
        supportedModules: moduleNames,
        source: "src/App.jsx",
      }),
  );

  server.registerTool(
    "list_budget_modules",
    {
      title: "List Budget App modules",
      description: "List the Budget App modules this connector can read.",
      inputSchema: {},
    },
    async () =>
      jsonContent({
        modules: moduleNames.filter((moduleName) => moduleName !== "raw"),
        notes: [
          "Use get_budget_module for one module.",
          "Use get_budget_app_snapshot for every module in one response.",
        ],
      }),
  );

  server.registerTool(
    "get_budget_app_snapshot",
    {
      title: "Get full Budget App snapshot",
      description: "Read the user's complete Budget App profile across all UI modules.",
      inputSchema: {
        userId: z.string().optional().describe("Optional Supabase auth user UUID. Defaults to MCP_DEFAULT_USER_ID when configured."),
        includeRaw: z.boolean().default(false).describe("Include raw saved JSON fields from user_data."),
      },
    },
    async ({ userId, includeRaw }) => {
      const row = await getUserDataRow({ userId });
      if (!row) {
        return jsonContent({
          error: "No user_data row found.",
          hint: "Set MCP_DEFAULT_USER_ID in Vercel or pass a userId to this tool.",
          supabaseKeySource: getMcpConfig().supabaseKeySource,
        });
      }

      const profile = normalizeProfile(row);
      return jsonContent({
        userId: profile.userId,
        updatedAt: profile.updatedAt,
        dashboard: buildModulePayload(profile, "dashboard"),
        history: buildModulePayload(profile, "history"),
        monthly: buildModulePayload(profile, "monthly"),
        accounts: buildModulePayload(profile, "accounts"),
        investments: buildModulePayload(profile, "investments"),
        debts: buildModulePayload(profile, "debts"),
        credits: buildModulePayload(profile, "credits"),
        major: buildModulePayload(profile, "major"),
        calendar: buildModulePayload(profile, "calendar"),
        raw: includeRaw ? buildModulePayload(profile, "raw") : undefined,
      });
    },
  );

  server.registerTool(
    "get_budget_module",
    {
      title: "Get Budget App module",
      description: "Read one Budget App UI module: dashboard, history, monthly, accounts, investments, debts, credits, major, calendar, or raw.",
      inputSchema: {
        module: z.enum(moduleNames),
        userId: z.string().optional().describe("Optional Supabase auth user UUID. Defaults to MCP_DEFAULT_USER_ID when configured."),
        year: z.number().int().min(2000).max(2100).optional().describe("Calendar year, used only for the calendar module."),
        month: z.number().int().min(1).max(12).optional().describe("Calendar month 1-12, used only for the calendar module."),
      },
    },
    async ({ module, userId, year, month }) => {
      const row = await getUserDataRow({ userId });
      if (!row) {
        return jsonContent({
          error: "No user_data row found.",
          hint: "Set MCP_DEFAULT_USER_ID in Vercel or pass a userId to this tool.",
          supabaseKeySource: getMcpConfig().supabaseKeySource,
        });
      }

      const profile = normalizeProfile(row);
      return jsonContent({
        module,
        userId: profile.userId,
        updatedAt: profile.updatedAt,
        data: buildModulePayload(profile, module, { year, month }),
      });
    },
  );

  server.registerTool(
    "get_net_worth",
    {
      title: "Get net worth",
      description: "Read the user's Budget App profile and calculate net worth from accounts, open credits, and debts.",
      inputSchema: {
        userId: z.string().optional().describe("Optional Supabase auth user UUID. Defaults to MCP_DEFAULT_USER_ID when configured."),
      },
    },
    async ({ userId }) => {
      const row = await getUserDataRow({ userId });
      if (!row) {
        return jsonContent({
          error: "No user_data row found.",
          hint: "Set MCP_DEFAULT_USER_ID in Vercel or pass a userId to this tool.",
          supabaseKeySource: getMcpConfig().supabaseKeySource,
        });
      }

      return jsonContent(summarizeNetWorth(row));
    },
  );

  server.registerTool(
    "get_financial_profile",
    {
      title: "Get financial profile",
      description: "Read the user's Budget App financial profile fields needed for analysis.",
      inputSchema: {
        userId: z.string().optional().describe("Optional Supabase auth user UUID. Defaults to MCP_DEFAULT_USER_ID when configured."),
      },
    },
    async ({ userId }) => {
      const row = await getUserDataRow({ userId });
      if (!row) {
        return jsonContent({
          error: "No user_data row found.",
          hint: "Set MCP_DEFAULT_USER_ID in Vercel or pass a userId to this tool.",
          supabaseKeySource: getMcpConfig().supabaseKeySource,
        });
      }

      return jsonContent({
        userId: row.user_id,
        updatedAt: row.updated_at,
        budgetData: row.budget_data || {},
        accounts: row.accounts || [],
        credits: row.credits || [],
        debts: row.debts || [],
        majorExpenses: row.major_expenses || [],
        balanceHistory: row.balance_history || [],
      });
    },
  );

  const registerModuleAlias = (toolName, moduleName, title, description) => {
    server.registerTool(
      toolName,
      {
        title,
        description,
        inputSchema: {
          userId: z.string().optional().describe("Optional Supabase auth user UUID. Defaults to MCP_DEFAULT_USER_ID when configured."),
        },
      },
      async ({ userId }) => {
        const row = await getUserDataRow({ userId });
        if (!row) {
          return jsonContent({
            error: "No user_data row found.",
            hint: "Set MCP_DEFAULT_USER_ID in Vercel or pass a userId to this tool.",
            supabaseKeySource: getMcpConfig().supabaseKeySource,
          });
        }

        const profile = normalizeProfile(row);
        return jsonContent({
          module: moduleName,
          userId: profile.userId,
          updatedAt: profile.updatedAt,
          data: buildModulePayload(profile, moduleName),
        });
      },
    );
  };

  registerModuleAlias("get_dashboard_data", "dashboard", "Get dashboard data", "Read Dashboard metrics and summary data.");
  registerModuleAlias("get_history_data", "history", "Get history data", "Read History monthly summaries and balance logs.");
  registerModuleAlias("get_monthly_budget_data", "monthly", "Get monthly budget data", "Read Monthly budget periods, expenses, income, and savings.");
  registerModuleAlias("get_accounts_data", "accounts", "Get accounts data", "Read Accounts balances and totals.");
  registerModuleAlias("get_investments_data", "investments", "Get investments data", "Read Investments data derived from account records.");
  registerModuleAlias("get_debts_data", "debts", "Get debts data", "Read Debt Manager balances, limits, APRs, and utilization.");
  registerModuleAlias("get_credits_data", "credits", "Get credits data", "Read Credits money owed records and totals.");
  registerModuleAlias("get_major_expenses_data", "major", "Get major expenses data", "Read Major planned expenses, budgets, actuals, and completion state.");

  server.registerTool(
    "get_calendar_data",
    {
      title: "Get calendar data",
      description: "Read Calendar payroll and bill events for a month.",
      inputSchema: {
        userId: z.string().optional().describe("Optional Supabase auth user UUID. Defaults to MCP_DEFAULT_USER_ID when configured."),
        year: z.number().int().min(2000).max(2100).optional(),
        month: z.number().int().min(1).max(12).optional().describe("Month number from 1 to 12."),
      },
    },
    async ({ userId, year, month }) => {
      const row = await getUserDataRow({ userId });
      if (!row) {
        return jsonContent({
          error: "No user_data row found.",
          hint: "Set MCP_DEFAULT_USER_ID in Vercel or pass a userId to this tool.",
          supabaseKeySource: getMcpConfig().supabaseKeySource,
        });
      }

      const profile = normalizeProfile(row);
      return jsonContent({
        module: "calendar",
        userId: profile.userId,
        updatedAt: profile.updatedAt,
        data: buildModulePayload(profile, "calendar", { year, month }),
      });
    },
  );

  server.registerTool(
    "select_user_data",
    {
      title: "Select budget rows",
      description: "Read rows from the Supabase user_data table. Requires Supabase env vars on the MCP server.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        userId: z.string().optional(),
        limit: z.number().int().min(1).max(25).default(5),
      },
    },
    async ({ userId, limit }) => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error("Supabase is not configured for the MCP server.");
      }

      let query = supabase.from("user_data").select("*").limit(limit);
      const effectiveUserId = userId || getMcpConfig().defaultUserId;
      if (effectiveUserId) {
        query = query.eq("user_id", effectiveUserId);
      } else {
        query = query.order("updated_at", { ascending: false });
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(error.message);
      }

      return jsonContent({
        rows: data,
        userId: effectiveUserId || undefined,
        warning:
          getMcpConfig().supabaseKeySource === "anon"
            ? "Using the anon key; Supabase RLS may limit returned rows."
            : undefined,
      });
    },
  );

  return server;
}
