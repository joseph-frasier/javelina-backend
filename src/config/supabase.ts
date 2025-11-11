import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Create Supabase client with service role key for admin operations
export const supabaseAdmin = createClient(
  env.supabase.url,
  env.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Create Supabase client with anon key for user operations
export const supabaseClient = createClient(
  env.supabase.url,
  env.supabase.anonKey
);
