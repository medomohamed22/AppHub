import { allow, createSession, db, json, safeError, schemas, verifyPiToken } from "./_lib/core.js";
export default async function handler(req, res) {
  if (!allow(req, res, ["POST"])) return;
  try {
    const { accessToken } = schemas.login.parse(req.body);
    const piUser = await verifyPiToken(accessToken);
    if (!piUser.uid || !piUser.username) {
      throw Object.assign(new Error("Pi /v2/me لم يُرجع uid وusername"), { status: 401 });
    }
    const { data: user, error } = await db().from("profiles").upsert({
      pi_uid: piUser.uid,
      username: piUser.username,
      updated_at: new Date().toISOString()
    }, { onConflict: "pi_uid" }).select("id,username,display_name,bio,avatar_url").single();
    if (error) throw error;
    return json(res, 200, { token: await createSession(user), user });
  } catch (error) {
    return json(res, error.status || 400, { error: safeError(error) });
  }
}
