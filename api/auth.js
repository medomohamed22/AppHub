import { z } from 'zod';
import { body, db, handler, json, method, rateLimit, ip, signSession } from '../lib/core.js';
import { verifyPiUser } from '../lib/pi.js';

export default async function(req) {
  return handler(async () => {
    const bad = method(req, ['POST']); if (bad) return bad;
    const client = db(); await rateLimit(client, `auth:${ip(req)}`, 10, 60);
    const input = z.object({ accessToken: z.string().min(20).max(5000) }).parse(await body(req, 12000));
    const pi = await verifyPiUser(input.accessToken);
    if (!pi?.uid || !pi?.username) throw Object.assign(new Error('Pi identity verification failed'), { status: 401 });
    const { data: profile, error } = await client.from('profiles').upsert({ pi_uid: pi.uid, username: pi.username, last_login_at: new Date().toISOString() }, { onConflict: 'pi_uid' }).select('id,username,display_name,avatar_url,bio,points_balance,role,premium_until').single();
    if (error) throw error;
    const token = await signSession(profile);
    return json({ token, expiresIn: 900, profile });
  }, req);
}
