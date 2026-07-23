import { createClient } from "@supabase/supabase-js";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

const PI_API_BASE_URL = "https://api.minepi.com";
let supabaseClient;

export const schemas = {
  login: z.object({ accessToken: z.string().min(20).max(5000) }),
  post: z.object({
    content: z.string().trim().max(1000).default(""),
    mediaUrl: z.string().url().nullable().optional()
  }).refine(value => value.content || value.mediaUrl, "Post cannot be empty"),
  comment: z.object({ content: z.string().trim().min(1).max(500) }),
  profile: z.object({
    displayName: z.string().trim().max(50),
    bio: z.string().trim().max(160)
  }),
  approve: z.object({
    paymentId: z.string().min(5).max(200),
    postId: z.string().uuid(),
    packageId: z.string().uuid()
  }),
  complete: z.object({
    paymentId: z.string().min(5).max(200),
    txid: z.string().min(5).max(200)
  })
};

export function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.end(JSON.stringify(body));
}

export function allow(req, res, methods) {
  if (!methods.includes(req.method)) {
    json(res, 405, { error: "Method not allowed" });
    return false;
  }
  return true;
}

export function safeError(error) {
  console.error(error);
  return error?.issues?.[0]?.message || error?.message || "Internal server error";
}

function assertEnv() {
  for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "PI_API_KEY", "SESSION_SECRET"]) {
    if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
  }
  if (process.env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
}

export function db() {
  assertEnv();
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return supabaseClient;
}

function jwtSecret() {
  assertEnv();
  return new TextEncoder().encode(process.env.SESSION_SECRET);
}

export async function createSession(user) {
  return new SignJWT({ username: user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .setIssuer("meshora")
    .setAudience("meshora-web")
    .sign(jwtSecret());
}

export async function requireUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw Object.assign(new Error("يرجى تسجيل الدخول"), { status: 401 });

  try {
    const { payload } = await jwtVerify(token, jwtSecret(), {
      issuer: "meshora",
      audience: "meshora-web"
    });
    return { id: payload.sub, username: payload.username };
  } catch {
    throw Object.assign(new Error("انتهت الجلسة. سجل الدخول مجددًا."), { status: 401 });
  }
}

async function piRequest(path, options = {}, bearer = null) {
  assertEnv();
  const response = await fetch(`${PI_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: bearer ? `Bearer ${bearer}` : `Key ${process.env.PI_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error_message || data?.message || `Pi API error ${response.status}`);
    error.status = response.status === 401 ? 401 : 502;
    error.details = data;
    throw error;
  }
  return data;
}

export const verifyPiToken = token => piRequest("/v2/me", {}, token);
export const approvePiPayment = id => piRequest(`/v2/payments/${encodeURIComponent(id)}/approve`, { method: "POST" });
export const completePiPayment = (id, txid) => piRequest(`/v2/payments/${encodeURIComponent(id)}/complete`, {
  method: "POST",
  body: JSON.stringify({ txid })
});
export const getPiPayment = id => piRequest(`/v2/payments/${encodeURIComponent(id)}`);
