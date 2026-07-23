import crypto from "node:crypto";
import { allow, db, json, requireUser, safeError } from "./_lib/core.js";
export default async function handler(req, res) {
  if (!allow(req, res, ["GET", "POST"])) return;
  try {
    const auth = await requireUser(req);
    const action = req.query.action;
    const client = db();

    if (action === "packages" && req.method === "GET") {
      const { data, error } = await client.from("promotion_packages")
        .select("id,name,amount_pi,target_impressions")
        .eq("is_active", true).order("amount_pi");
      if (error) throw error;
      return json(res, 200, { packages: data || [] });
    }

    if (action === "list" && req.method === "GET") {
      const { data, error } = await client.from("post_promotions")
        .select("id,status,delivered_impressions,target_impressions,created_at,promotion_packages(name)")
        .eq("user_id", auth.id).order("created_at", { ascending: false });
      if (error) throw error;
      return json(res, 200, {
        campaigns: (data || []).map(x => ({
          ...x, package_name: x.promotion_packages?.name || "حملة", promotion_packages: undefined
        }))
      });
    }

    if (action === "impression" && req.method === "POST") {
      const { promotionId } = req.body || {};
      const day = new Date().toISOString().slice(0, 10);
      const key = crypto.createHash("sha256").update(`${promotionId}:${auth.id}:${day}`).digest("hex");
      const { error } = await client.from("promotion_impressions").insert({
        promotion_id: promotionId, viewer_id: auth.id, impression_key: key
      });
      if (error && error.code !== "23505") throw error;
      if (!error) await client.rpc("increment_promotion_impression", { promotion_uuid: promotionId });
      return json(res, 200, { success: true });
    }

    return json(res, 400, { error: "Unsupported action" });
  } catch (error) {
    return json(res, error.status || 400, { error: safeError(error) });
  }
}
