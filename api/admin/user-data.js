import { adminHandler } from "../../mcp/admin.js";

export default async function handler(req, res) {
  await adminHandler(req, res);
}
