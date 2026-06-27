import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

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

export function getMcpConfig() {
  const host = process.env.MCP_HOST || "127.0.0.1";
  const accessToken = process.env.MCP_ACCESS_TOKEN || "";
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
    supabaseUrl,
    supabaseKey,
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
  };
}

function getSupabaseClient() {
  const { supabaseUrl, supabaseKey } = getMcpConfig();
  return supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
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
          "This MCP server exposes read-only project and database tools.",
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
        source: "src/App.jsx",
      }),
  );

  server.registerTool(
    "select_user_data",
    {
      title: "Select budget rows",
      description: "Read rows from the Supabase user_data table. Requires Supabase env vars on the MCP server.",
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
      if (userId) {
        query = query.eq("user_id", userId);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(error.message);
      }

      return jsonContent({
        rows: data,
        warning:
          getMcpConfig().supabaseKey === process.env.VITE_SUPABASE_ANON_KEY
            ? "Using the anon key; Supabase RLS may limit returned rows."
            : undefined,
      });
    },
  );

  return server;
}
