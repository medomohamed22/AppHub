import { createClient } from '@supabase/supabase-js';
import { SignJWT, jwtVerify } from 'jose';

const enc = new TextEncoder();
const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...jsonHeaders, ...extra } });
}
export function error(message, status = 400, code = 'BAD_REQUEST') { return json({ error: message, code }, status); }
export async function body(req, max = 250000) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > max) throw Object.assign(new Error('Payload too large'), { status: 413 });
  const text = await req.text();
  if (text.length > max) throw Object.assign(new Error('Payload too large'), { status: 413 });
  try { return text ? JSON.parse(text) : {}; } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}
export function method(req, allowed) {
  if (!allowed.includes(req.method)) return error('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
}
export function assertOrigin(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const expected = process.env.APP_ORIGIN;
  const origin = req.headers.get('origin');
  if (!expected || !origin || origin !== expected) throw Object.assign(new Error('Invalid origin'), { status: 403 });
}
export function db() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Supabase environment');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}
export async function signSession(profile) {
  const secret = process.env.APP_JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('APP_JWT_SECRET must be at least 32 characters');
  return new SignJWT({ username: profile.username, role: profile.role || 'user' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(profile.id)
    .setIssuer('circles-hub').setAudience('circles-hub-web').setIssuedAt().setExpirationTime('15m')
    .sign(enc.encode(secret));
}
export async function auth(req) {
  const header = req.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) throw Object.assign(new Error('Authentication required'), { status: 401 });
  try {
    const secret = process.env.APP_JWT_SECRET;
    const { payload } = await jwtVerify(header.slice(7), enc.encode(secret), { issuer: 'circles-hub', audience: 'circles-hub-web' });
    return { id: payload.sub, username: payload.username, role: payload.role };
  } catch { throw Object.assign(new Error('Invalid or expired session'), { status: 401 }); }
}
export async function rateLimit(client, key, limit = 30, windowSeconds = 60) {
  const { data, error: e } = await client.rpc('consume_rate_limit', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (e) throw e;
  if (!data) throw Object.assign(new Error('Too many requests'), { status: 429 });
}
export function ip(req) { return (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0, 64); }
export function cleanText(v, max = 2000) { return String(v || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max); }
export async function handler(fn, req) {
  try { assertOrigin(req); return await fn(); }
  catch (e) { console.error(e); return error(e.message || 'Server error', e.status || 500, e.status ? 'REQUEST_FAILED' : 'SERVER_ERROR'); }
}
