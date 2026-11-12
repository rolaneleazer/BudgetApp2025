export const ADMIN_RESTRICTED_FEATURE_MODULES = [
  "security",
  "pullboard",
  "ux-advisor",
  "resources",
  "second-brain",
  "ai-office",
];

export const ADMIN_ONLY_MODULES = new Set([
  ...ADMIN_RESTRICTED_FEATURE_MODULES,
  "admin",
]);

export const BASELINE_USER_MODULES = new Set([
  "dashboard",
  "account-dashboard",
  "history",
  "budget",
  "accounts",
  "reconcile",
  "transactions",
  "investments",
  "debts",
  "credits",
  "expenses",
  "calendar",
  "graph",
  "reports",
]);

/**
 * Resolve default RBAC access level for a role/module pair when no explicit
 * Supabase `role_permissions` override exists.
 */
export function getDefaultModuleAccess(roleName, moduleName) {
  if (roleName === "admin") return "update";
  if (roleName === "viewer") return ADMIN_ONLY_MODULES.has(moduleName) ? "none" : "read";
  if (roleName === "guest") {
    return moduleName === "dashboard" || moduleName === "account-dashboard" ? "read" : "none";
  }
  return !ADMIN_ONLY_MODULES.has(moduleName) && BASELINE_USER_MODULES.has(moduleName)
    ? "update"
    : "none";
}
