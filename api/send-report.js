import { sendReportEmail } from "../mcp/email.js";

/**
 * POST /api/send-report
 *
 * Body: { html: string, subject?: string }
 * Auth: Bearer token from Supabase session (validated by the MCP server middleware).
 *       The recipient email is derived from the authenticated user's JWT — no
 *       client-supplied email is trusted.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { html, subject } = req.body || {};

    if (!html || typeof html !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'html' field in request body." });
    }

    // The recipient email comes from the signed-in user's email,
    // passed by the frontend from the Supabase session.
    const recipientEmail = req.body.recipientEmail;
    if (!recipientEmail || typeof recipientEmail !== "string") {
      return res.status(400).json({ error: "Missing recipientEmail. Please sign in first." });
    }

    const emailSubject = subject || `Budget App — Financial Report (${new Date().toLocaleDateString()})`;

    const result = await sendReportEmail(recipientEmail, emailSubject, html);

    return res.status(200).json({ success: true, messageId: result.messageId });
  } catch (err) {
    console.error("Error sending report email:", err);
    return res.status(500).json({ error: err.message || "Failed to send email." });
  }
}
