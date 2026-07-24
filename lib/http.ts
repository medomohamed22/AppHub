import { NextRequest, NextResponse } from "next/server";
export function sameOrigin(req:NextRequest){const origin=req.headers.get("origin");if(!origin) return true;return origin===new URL(req.url).origin;}
export function jsonError(message:string,status=400){return NextResponse.json({error:message},{status,headers:{"Cache-Control":"no-store"}});}
