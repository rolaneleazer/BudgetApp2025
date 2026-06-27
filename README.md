# React + Vite

## Vercel MCP Endpoint

This project includes a remote MCP endpoint for ChatGPT when deployed on Vercel:

```text
https://your-vercel-domain.vercel.app/api/mcp
```

Health check:

```text
https://your-vercel-domain.vercel.app/api/health
```

Required Vercel environment variables:

```bash
MCP_ACCESS_TOKEN=replace-with-a-long-random-token
MCP_ALLOWED_HOSTS=your-vercel-domain.vercel.app
MCP_PUBLIC_BASE_URL=https://your-vercel-domain.vercel.app
MCP_OAUTH_CLIENT_ID=budget-app-2026
MCP_OAUTH_CLIENT_SECRET=replace-with-another-long-random-token
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

ChatGPT OAuth connector values:

```text
Auth URL: https://your-vercel-domain.vercel.app/api/oauth/authorize
Token URL: https://your-vercel-domain.vercel.app/api/oauth/token
OAuth Client ID: budget-app-2026
OAuth Client Secret: value of MCP_OAUTH_CLIENT_SECRET
Token endpoint auth method: client_secret_post
Default scopes: project.read
Base scopes: project.read
```

Optional server-side Supabase access for MCP database reads:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
