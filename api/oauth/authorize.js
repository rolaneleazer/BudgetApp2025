import { handleAuthorize } from "../../mcp/oauth.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).send("Method not allowed");
    return;
  }

  handleAuthorize(req, res);
}
