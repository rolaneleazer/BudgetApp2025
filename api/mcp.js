import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createBudgetMcpServer, isAuthorized } from "../mcp/core.js";

import { getOAuthConfig } from "../mcp/oauth.js";

export const config = {
  api: {
    bodyParser: true,
  },
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, mcp-session-id, x-mcp-version"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!isAuthorized(req)) {
    const { baseUrl } = getOAuthConfig(req);
    res.setHeader(
      "WWW-Authenticate",
      `Bearer realm="BudgetApp2025", error="invalid_token", authorization_uri="${baseUrl}/api/oauth/authorize"`
    );
    res.setHeader(
      "Link",
      `<${baseUrl}/.well-known/oauth-authorization-server>; rel="oauth2-as"`
    );
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, OPTIONS, DELETE");
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
