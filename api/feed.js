import { allow, db, json, requireUser, safeError } from "./_lib/core.js";
export default async function handler(req, res) {
  if (!allow(req, res, ["GET"])) return;
  try {
    const auth = await requireUser(req);
    const client = db();
    const [{ data: posts, error }, { data: liked }, { data: promotions }] = await Promise.all([
      client.from("posts")
        .select("id,user_id,content,media_url,likes_count,comments_count,created_at,profiles!posts_user_id_fkey(id,username,display_name,avatar_url)")
        .eq("is_deleted", false).order("created_at", { ascending: false }).limit(30),
      client.from("post_likes").select("post_id").eq("user_id", auth.id),
      client.from("active_promotions").select("*").neq("user_id", auth.id).limit(4)
    ]);
    if (error) throw error;
    const likedSet = new Set((liked || []).map(x => x.post_id));
    const promoMap = new Map((promotions || []).map(x => [x.post_id, x]));
    const normal = (posts || []).map(post => ({
      ...post, author: post.profiles, profiles: undefined,
      viewer_liked: likedSet.has(post.id), sponsored: false
    }));
    const sponsored = normal.filter(p => promoMap.has(p.id)).map(p => ({
      ...p, sponsored: true, promotion_id: promoMap.get(p.id).promotion_id
    }));
    const combined = [];
    let i = 0;
    normal.forEach((post, index) => {
      combined.push(post);
      if ((index + 1) % 7 === 0 && sponsored[i]) combined.push(sponsored[i++]);
    });
    return json(res, 200, { posts: combined });
  } catch (error) {
    return json(res, error.status || 400, { error: safeError(error) });
  }
}
