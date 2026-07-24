import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { serverEnv } from "./env";
const name="iw_session";
function key(){return new TextEncoder().encode(serverEnv().SESSION_SECRET);}
export async function issueSession(playerId:string,piUid:string){const token=await new SignJWT({piUid}).setProtectedHeader({alg:"HS256"}).setSubject(playerId).setIssuedAt().setExpirationTime("7d").sign(key());const jar=await cookies();jar.set(name,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:604800});}
export async function requirePlayer(){const token=(await cookies()).get(name)?.value;if(!token) throw new Error("UNAUTHORIZED");try{const {payload}=await jwtVerify(token,key(),{algorithms:["HS256"]});if(!payload.sub||typeof payload.piUid!=="string") throw new Error();return {playerId:payload.sub,piUid:payload.piUid};}catch{throw new Error("UNAUTHORIZED");}}
