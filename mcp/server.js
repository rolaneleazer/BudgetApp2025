import "dotenv/config";

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import {
  createBudgetMcpServer,
  getMcpConfig,
  healthPayload,
  isAuthorized,
} from "./core.js";
import { adminHandler } from "./admin.js";
import sendReportHandler from "../api/send-report.js";
import schedulesHandler from "../api/schedules.js";
import adminTestsHandler from "../api/admin-tests.js";
import { startScheduler } from "./scheduler.js";

const config = getMcpConfig();
const isLocalHost = ["127.0.0.1", "localhost", "::1"].includes(config.host);

if (!config.accessToken && !isLocalHost) {
  console.error("Refusing to start a non-local MCP server without MCP_ACCESS_TOKEN.");
  process.exit(1);
}

const app = createMcpExpressApp({
  host: config.host,
  allowedHosts: config.allowedHosts,
});

app.all("/api/admin/check", async (req, res) => {
  await adminHandler(req, res);
});

app.all("/api/admin/users", async (req, res) => {
  await adminHandler(req, res);
});

app.post("/api/send-report", async (req, res) => {
  await sendReportHandler(req, res);
});


function authenticate(req, res, next) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

app.get("/health", (_req, res) => {
  res.json(healthPayload());
});

app.post("/mcp", authenticate, async (req, res) => {
  const server = createBudgetMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  } finally {
    res.on("close", async () => {
      await transport.close();
      await server.close();
    });
  }
});

app.get("/mcp", authenticate, async (req, res) => {
  const server = createBudgetMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("Error handling MCP stream:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

app.delete("/mcp", authenticate, (_req, res) => {
  res.status(405).json({ error: "Method not allowed" });
});

app.all("/api/schedules", async (req, res) => {
  await schedulesHandler(req, res);
});

app.all("/api/admin-tests", async (req, res) => {
  await adminTestsHandler(req, res);
});

app.listen(config.port, config.host, (error) => {
  if (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }

  console.log(`BudgetApp2025 MCP server listening at http://${config.host}:${config.port}/mcp`);
  if (!config.accessToken) {
    console.warn("MCP_ACCESS_TOKEN is not set. This is only acceptable for local development.");
  }

  // Start the scheduled report cron job
  startScheduler();
});
