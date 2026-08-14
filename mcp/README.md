# BudgetApp2025 MCP Server

This folder contains a Model Context Protocol (MCP) server supporting both **Stdio (Standard I/O)** and **Streamable HTTP** transports for AI assistants like Gemini, Claude, Cursor, and ChatGPT.

## Tools

- `project_overview` - summarizes package metadata and the app data model.
- `list_project_files` - lists non-secret project files.
- `read_project_file` - reads a safe text/code file by relative path.
- `search_code` - searches project text files.
- `budget_data_model` - describes the known Supabase `user_data` shape used by the app.
- `get_budget_app_snapshot` - reads full financial profile snapshot across all UI modules.
- `get_budget_module` - reads specific module (`dashboard`, `history`, `monthly`, `accounts`, `investments`, `debts`, `credits`, `major`, `calendar`).
- `get_net_worth` - calculates net worth, debt utilization, and account summaries.
- `select_user_data` - reads rows from Supabase `user_data` when server-side Supabase env vars are configured.

The server deliberately blocks `.env`, `.git`, `node_modules`, build output, and other internal folders.

## Connecting to Gemini / Local MCP Clients (Stdio)

For Gemini CLI, Claude Desktop, Cursor, or VS Code MCP extensions using standard I/O:

Add this to your MCP configuration file:

```json
{
  "mcpServers": {
    "budgetapp2025": {
      "command": "node",
      "args": ["c:/Users/rtm1863/BudgetApp2025/mcp/stdio.js"]
    }
  }
}
```

## Local HTTP Server Run

Copy `.env.example` to `.env`, set at least:

```bash
MCP_ACCESS_TOKEN=replace-with-a-long-random-token
MCP_HOST=127.0.0.1
MCP_PORT=3333
```

Then run:

```bash
npm run mcp
```

Health check:

```bash
curl http://127.0.0.1:3333/health
```

MCP endpoint:

```text
http://127.0.0.1:3333/mcp
```

## Vercel Deployment

This repo includes Vercel API routes:

- `GET /api/health`
- `GET|POST /api/mcp`

After deploying to Vercel, your ChatGPT MCP URL is:

```text
https://your-vercel-domain.vercel.app/api/mcp
```

Set these Vercel environment variables:

```bash
MCP_ACCESS_TOKEN=replace-with-a-long-random-token
MCP_ALLOWED_HOSTS=your-vercel-domain.vercel.app
MCP_DEFAULT_USER_ID=your-supabase-auth-user-uuid
MCP_PUBLIC_BASE_URL=https://your-vercel-domain.vercel.app
MCP_OAUTH_CLIENT_ID=budget-app-2026
MCP_OAUTH_CLIENT_SECRET=replace-with-another-long-random-token
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Also keep your frontend variables in Vercel:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Do not set `MCP_HOST` on Vercel. That setting is only for the local standalone server.

Use these values when Gemini Spark asks for Custom Connected App OAuth settings:

```text
Add a custom app link: https://your-vercel-domain.vercel.app/api/mcp
Authorization endpoint: https://<your-supabase-id>.supabase.co/auth/v1/oauth/authorize
Token endpoint: https://<your-supabase-id>.supabase.co/auth/v1/oauth/token
Client ID: <Client ID from Supabase OAuth App> (e.g. dac89170-7d26-459a-aa94-3a5cc550ebfb)
Client Secret: <Client Secret generated in Supabase OAuth App>
```

Or for ChatGPT / Self-Hosted OAuth:

```text
Auth URL: https://your-vercel-domain.vercel.app/api/oauth/authorize
Token URL: https://your-vercel-domain.vercel.app/api/oauth/token
OAuth Client ID: budget-app-2026 (or client_id generated in your app)
OAuth Client Secret: value of MCP_OAUTH_CLIENT_SECRET
Token endpoint auth method: client_secret_post
Default scopes: project.read
Base scopes: project.read
```

## Remote Deployment Notes

- Set `MCP_HOST=0.0.0.0` only on a trusted server.
- Always set `MCP_ACCESS_TOKEN` for remote use.
- Set `MCP_ALLOWED_HOSTS` to the public hostnames that should be accepted.
- Use HTTPS in front of this server.
- For Supabase data access, use `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY` only on the trusted server. Never expose a service role key to frontend code.
