import { oauthMetadata } from "../../mcp/oauth.js";

export default function handler(req, res) {
  res.status(200).json(oauthMetadata(req));
}
