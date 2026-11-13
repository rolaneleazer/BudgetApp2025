import { adminHandler } from "../mcp/admin.js";
import rolesHandler from "../mcp/roles.js";
import permissionsHandler from "../mcp/permissions.js";
import url from "node:url";

export default async function handler(req, res) {
  const parsedUrl = url.parse(req.url || "", true);
  const pathname = parsedUrl.pathname || "";

  if (pathname.includes("/roles")) {
    return await rolesHandler(req, res);
  }
  if (pathname.includes("/permissions")) {
    return await permissionsHandler(req, res);
  }
  
  // Dispatch to default adminHandler for /check, /users, /user-data, etc.
  return await adminHandler(req, res);
}
