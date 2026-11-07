export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const forwardedFor = req.headers["x-forwarded-for"];
  const ip =
    (typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : "") ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "127.0.0.1";

  const country = req.headers["x-vercel-ip-country"] || "PH";
  const region = req.headers["x-vercel-ip-country-region"] || "NCR";
  const rawCity = req.headers["x-vercel-ip-city"] || "Manila";
  let city = rawCity;
  try {
    city = decodeURIComponent(rawCity);
  } catch (_) {}

  const userAgent = req.headers["user-agent"] || "Unknown Client / Scanner";
  const referer = req.headers["referer"] || "Direct Probe";
  const action = req.query?.action || "";
  const trapName = req.query?.trap || "decoy_api_endpoint";
  const targetPath = req.query?.target || req.url || "/api/honeypot";

  const telemetry = {
    ip,
    location: `${city}, ${region}, ${country}`,
    country,
    city,
    userAgent,
    referer,
    method: req.method,
    targetPath,
    trapName,
    timestamp: new Date().toISOString()
  };

  // Mode 1: Provide live client IP & geo telemetry to the authenticated frontend Honeynet engine
  if (action === "telemetry") {
    return res.status(200).json({
      ok: true,
      telemetry
    });
  }

  // Mode 2: Decoy Honeypot Trap Hit (e.g., /.env, /api/debug-env, /api/v1/export-db)
  return res.status(200).json({
    status: "HONEYPOT_TRAP_TRIGGERED",
    warning: "UNAUTHORIZED ACCESS ATTEMPT DETECTED AND LOGGED BY HONEYNET SECURITY.",
    decoyData: {
      db_host: "honeypot-vault-trap-01.internal.ph",
      db_user: "canary_readonly_trap",
      account_snapshot: "DECOY_HONEYNET_PAYLOAD_ACTIVE"
    },
    forensics: telemetry
  });
}

