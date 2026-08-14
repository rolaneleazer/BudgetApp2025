import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBudgetMcpServer } from "./core.js";

async function main() {
  const server = createBudgetMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Failed to start MCP stdio server:", error);
  process.exit(1);
});
