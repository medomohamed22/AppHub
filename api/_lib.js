import { createClient } from '@supabase/supabase-js';
import { SignJWT, jwtVerify } from 'jose';

const supabaseUrl=process.env.SUPABASE_URL;
const serviceRoleKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret=process.env.APP_JWT_SECRET;
export function requireEnv(){const m=[];if(!supabaseUrl)m.push('SUPABASE_URL');if(!serviceRoleKey)m.push('SUPABASE_SERVICE_ROLE_KEY');if(!jwtSecret||jwtSecret.length<32)m.push('APP_JWT_SECRET');if(m.length)throw new Error(`Missing environment variables: ${m.join(', ')}`)}
export function db(){requireEnv();return createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}})}
export function json(res,status,body){res.status(status).setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify(body))}
export function allowMethods(req,res,methods){if(methods.includes(req.method))return true;res.setHeader('Allow',methods.join(', '));json(res,405,{error:'Method not allowed'});return false}
export async function signAppToken(user){requireEnv();return new SignJWT({username:user.username,pi_uid:user.pi_uid,role:user.role}).setProtectedHeader({alg:'HS256'}).setSubject(user.id).setIssuedAt().setExpirationTime('7d').sign(new TextEncoder().encode(jwtSecret))}
export async function requireUser(req){requireEnv();const auth=req.headers.authorization||'';const token=auth.startsWith('Bearer ')?auth.slice(7):'';if(!token)throw new Error('UNAUTHORIZED');const {payload}=await jwtVerify(token,new TextEncoder().encode(jwtSecret));if(!payload.sub)throw new Error('UNAUTHORIZED');return{id:payload.sub,username:payload.username,pi_uid:payload.pi_uid,role:payload.role||'user'}}
export function requireAdmin(user){if(!['admin','moderator'].includes(user.role))throw new Error('FORBIDDEN')}
export function cleanText(v,max=500){return String(v??'').trim().slice(0,max)}
export function safeUrl(v){const u=new URL(String(v));if(!['http:','https:'].includes(u.protocol))throw new Error('INVALID_URL');return u.toString()}
export function handleError(error,res,fallback='Server error'){console.error(error);if(error.message==='UNAUTHORIZED')return json(res,401,{error:'Sign in with Pi first'});if(error.message==='FORBIDDEN')return json(res,403,{error:'Admin access required'});if(error.message==='INVALID_URL')return json(res,400,{error:'Invalid URL'});return json(res,500,{error:fallback})}
