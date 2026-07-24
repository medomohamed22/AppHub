import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "./env";
export function adminDb(){const e=serverEnv();return createClient(e.NEXT_PUBLIC_SUPABASE_URL,e.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});}
