import crypto from "node:crypto";

import { getMcpConfig } from "./core.js";

const codeTtlMs = 5 * 60 * 1000;

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function fromBase64url(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function oauthSecret() {
  const { accessToken } = getMcpConfig();
  return process.env.MCP_OAUTH_SIGNING_SECRET || accessToken;
}

export function getOAuthConfig(req) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const baseUrl = process.env.MCP_PUBLIC_BASE_URL || `${protocol}://${host}`;

  return {
    baseUrl,
    clientId: process.env.MCP_OAUTH_CLIENT_ID || "budget-app-2026",
    clientSecret: process.env.MCP_OAUTH_CLIENT_SECRET || "",
  };
}

function signPayload(payload) {
  const secret = oauthSecret();
  if (!secret) {
    throw new Error("MCP_ACCESS_TOKEN or MCP_OAUTH_SIGNING_SECRET is required for OAuth.");
  }

  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyCode(code) {
  const secret = oauthSecret();
  const [body, signature] = String(code || "").split(".");
  if (!body || !signature || !secret) return null;

  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const payload = JSON.parse(fromBase64url(body));
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

function getBasicClientCredentials(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Basic ")) return {};

  const decoded = Buffer.from(authHeader.slice("Basic ".length), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator === -1) return {};

  return {
    client_id: decoded.slice(0, separator),
    client_secret: decoded.slice(separator + 1),
  };
}

function validateClient(req, body = {}) {
  const { clientId, clientSecret } = getOAuthConfig(req);
  const basic = getBasicClientCredentials(req);
  const submittedClientId = body.client_id || basic.client_id;
  const submittedClientSecret = body.client_secret || basic.client_secret || "";

  if (submittedClientId !== clientId) {
    return false;
  }

  if (clientSecret && submittedClientSecret !== clientSecret) {
    return false;
  }

  return true;
}

export function handleAuthorize(req, res) {
  const { clientId } = getOAuthConfig(req);
  const query = req.query || {};

  if (query.response_type !== "code") {
    res.status(400).send("Unsupported response_type.");
    return;
  }

  if (query.client_id !== clientId) {
    res.status(400).send("Invalid client_id.");
    return;
  }

  if (!query.redirect_uri) {
    res.status(400).send("Missing redirect_uri.");
    return;
  }

  const code = signPayload({
    client_id: query.client_id,
    redirect_uri: query.redirect_uri,
    scope: query.scope || "",
    exp: Date.now() + codeTtlMs,
    nonce: crypto.randomBytes(16).toString("hex"),
  });

  const redirectUrl = new URL(query.redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (query.state) {
    redirectUrl.searchParams.set("state", query.state);
  }

  res.redirect(302, redirectUrl.toString());
}

export function handleToken(req, res) {
  const { accessToken } = getMcpConfig();
  const body = req.body || {};

  if (!accessToken) {
    res.status(500).json({ error: "server_error", error_description: "MCP_ACCESS_TOKEN is not configured." });
    return;
  }

  if (!validateClient(req, body)) {
    res.status(401).json({ error: "invalid_client" });
    return;
  }

  if (body.grant_type !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }

  const payload = verifyCode(body.code);
  if (!payload || payload.client_id !== body.client_id) {
    res.status(400).json({ error: "invalid_grant" });
    return;
  }

  if (body.redirect_uri && payload.redirect_uri !== body.redirect_uri) {
    res.status(400).json({ error: "invalid_grant" });
    return;
  }

  res.status(200).json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 60 * 60 * 24 * 365,
    scope: payload.scope || "",
  });
}

export function oauthMetadata(req) {
  const { baseUrl } = getOAuthConfig(req);
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: [
      "client_secret_post",
      "client_secret_basic",
      "none",
    ],
    code_challenge_methods_supported: ["plain", "S256"],
    scopes_supported: ["project.read"],
  };
}
