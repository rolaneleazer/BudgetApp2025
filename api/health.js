import { healthPayload } from "../mcp/core.js";

export default function handler(_req, res) {
  res.status(200).json(healthPayload());
}
