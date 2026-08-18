export const SUPER_ADMIN_EMAILS = [
  "rolanmolano_77@yahoo.com"
];

export function isSuperAdminEmail(email) {
  if (!email || typeof email !== "string") return false;
  const cleanEmail = email.trim().toLowerCase();
  
  const envAdminsStr = (typeof process !== "undefined" && process.env?.ADMIN_EMAILS) || "";
  const envAdmins = envAdminsStr.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

  return SUPER_ADMIN_EMAILS.includes(cleanEmail) || envAdmins.includes(cleanEmail);
}
