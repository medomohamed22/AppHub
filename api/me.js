import { allow, db, json, requireUser, safeError, schemas } from "./_lib/core.js";
export default async function handler(req, res) {
  if (!allow(req, res, ["GET", "PATCH"])) return;
  try {
    const auth = await requireUser(req);
    if (req.method === "PATCH") {
      const input = schemas.profile.parse(req.body);
      const { data, error } = await db().from("profiles").update({
        display_name: input.displayName || null,
        bio: input.bio || null,
        updated_at: new Date().toISOString()
      }).eq("id", auth.id).select("id,username,display_name,bio,avatar_url").single();
      if (error) throw error;
      return json(res, 200, { user: data });
    }
    const { data, error } = await db().from("profiles")
      .select("id,username,display_name,bio,avatar_url,created_at")
      .eq("id", auth.id).single();
    if (error) throw error;
    return json(res, 200, { user: data });
  } catch (error) {
    return json(res, error.status || 400, { error: safeError(error) });
  }
}
