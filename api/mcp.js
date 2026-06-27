import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createBudgetMcpServer, isAuthorized } from "../mcp/core.js";

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, DELETE");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (req.method === "DELETE") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const server = createBudgetMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling Vercel MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  } finally {
    if (!res.writableEnded) {
      res.on("close", async () => {
        await transport.close();
        await server.close();
      });
    } else {
      await transport.close();
      await server.close();
    }
  }
}
