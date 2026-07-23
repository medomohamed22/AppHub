import { allow, db, json, requireUser, safeError, schemas } from "./_lib/core.js";
export default async function handler(req, res) {
  if (!allow(req, res, ["GET", "POST"])) return;
  try {
    const auth = await requireUser(req);
    const { action, postId } = req.query;
    if (!postId) throw new Error("Post ID is required");
    const client = db();

    if (action === "like" && req.method === "POST") {
      const { data: existing } = await client.from("post_likes")
        .select("post_id").eq("post_id", postId).eq("user_id", auth.id).maybeSingle();
      if (existing) {
        const { error } = await client.from("post_likes").delete().eq("post_id", postId).eq("user_id", auth.id);
        if (error) throw error;
      } else {
        const { error } = await client.from("post_likes").insert({ post_id: postId, user_id: auth.id });
        if (error) throw error;
      }
      const { count } = await client.from("post_likes").select("*", { count: "exact", head: true }).eq("post_id", postId);
      await client.from("posts").update({ likes_count: count || 0 }).eq("id", postId);
      return json(res, 200, { liked: !existing, likesCount: count || 0 });
    }

    if (action === "comments" && req.method === "POST") {
      const { content } = schemas.comment.parse(req.body);
      const { error } = await client.from("comments").insert({ post_id: postId, user_id: auth.id, content });
      if (error) throw error;
      const { count } = await client.from("comments").select("*", { count: "exact", head: true }).eq("post_id", postId);
      await client.from("posts").update({ comments_count: count || 0 }).eq("id", postId);
      return json(res, 201, { success: true });
    }

    if (action === "comments" && req.method === "GET") {
      const { data, error } = await client.from("comments")
        .select("id,content,created_at,profiles!comments_user_id_fkey(username,display_name)")
        .eq("post_id", postId).order("created_at").limit(100);
      if (error) throw error;
      return json(res, 200, {
        comments: (data || []).map(x => ({ ...x, author: x.profiles, profiles: undefined }))
      });
    }

    return json(res, 400, { error: "Unsupported action" });
  } catch (error) {
    return json(res, error.status || 400, { error: safeError(error) });
  }
}
