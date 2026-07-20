import nodemailer from "nodemailer";

/**
 * Create a reusable SMTP transporter from environment variables.
 * Required env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 */
export function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in .env"
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/**
 * Send an HTML email report to the given recipient.
 *
 * @param {string} recipientEmail - The signed-in user's email address
 * @param {string} subject        - Email subject line
 * @param {string} html           - Full HTML body of the report
 * @returns {Promise<{messageId: string}>}
 */
export async function sendReportEmail(recipientEmail, subject, html) {
  const transporter = createTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const info = await transporter.sendMail({
    from: `"Budget App Reports" <${from}>`,
    to: recipientEmail,
    subject,
    html,
  });

  return { messageId: info.messageId };
}
