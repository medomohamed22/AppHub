import { allow, json } from "./_lib/core.js";
export default async function handler(req, res) {
  if (!allow(req, res, ["GET"])) return;
  return json(res, 200, {
    ok: true,
    app: "Meshora",
    node: process.version,
    timestamp: new Date().toISOString()
  });
}
