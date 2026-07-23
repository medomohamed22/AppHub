import crypto from "node:crypto";
import { allow, db, json, requireUser, safeError } from "./_lib/core.js";
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
export default async function handler(req, res) {
  if (!allow(req, res, ["POST"])) return;
  try {
    const auth = await requireUser(req);
    const { filename, mimeType, size } = req.body || {};
    if (!allowedTypes.has(mimeType)) throw new Error("نوع الصورة غير مسموح.");
    if (!Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024) throw new Error("حجم الصورة غير مسموح.");
    const ext = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
    const path = `${auth.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const client = db();
    const { data, error } = await client.storage.from("post-media").createSignedUploadUrl(path);
    if (error) throw error;
    const { data: publicData } = client.storage.from("post-media").getPublicUrl(path);
    return json(res, 200, {
      path, signedUrl: data.signedUrl, publicUrl: publicData.publicUrl,
      originalFilename: String(filename || "").slice(0, 120)
    });
  } catch (error) {
    return json(res, error.status || 400, { error: safeError(error) });
  }
}
