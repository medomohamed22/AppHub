import { z } from "zod";
const schema=z.object({NEXT_PUBLIC_SUPABASE_URL:z.string().url(),SUPABASE_SECRET_KEY:z.string().min(10),PI_SERVER_API_KEY:z.string().min(10),SESSION_SECRET:z.string().min(32)});
export function serverEnv(){const parsed=schema.safeParse(process.env);if(!parsed.success) throw new Error("Server environment is incomplete");return parsed.data;}
