import { allow, db, json, requireUser, safeError, schemas } from "./_lib/core.js";
export default async function handler(req, res) {
  if (!allow(req, res, ["GET", "POST"])) return;
  try {
    const auth = await requireUser(req);
    if (req.method === "POST") {
      const input = schemas.post.parse(req.body);
      const { data, error } = await db().from("posts").insert({
        user_id: auth.id,
        content: input.content || null,
        media_url: input.mediaUrl || null
      }).select("*").single();
      if (error) throw error;
      return json(res, 201, { post: data });
    }
    const userId = req.query.userId || (req.query.mine === "true" ? auth.id : null);
    let query = db().from("posts")
      .select("id,user_id,content,media_url,likes_count,comments_count,created_at")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false }).limit(50);
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query;
    if (error) throw error;
    return json(res, 200, { posts: data || [] });
  } catch (error) {
    return json(res, error.status || 400, { error: safeError(error) });
  }
}
