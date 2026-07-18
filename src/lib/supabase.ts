/**
 * Supabase client — server & browser.
 *
 * Server: uses service role key for admin operations
 * Browser: uses anon key for user-facing auth
 */
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { AstroGlobal } from 'astro';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Browser-side Supabase client (anon key).
 */
export function createBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

/**
 * Server-side Supabase client (anon key, with cookies).
 * Used for user session handling in Astro pages/endpoints.
 */
export function createServerSupabaseClient(Astro: AstroGlobal) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return Astro.cookies.getAll().map((c) => ({
          name: c.name,
          value: c.value,
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          Astro.cookies.set(name, value, options);
        });
      },
    },
  });
}

/**
 * Admin Supabase client (service role key — server only, never expose to browser).
 */
export function createAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Get current session from Astro request.
 */
export async function getSession(Astro: AstroGlobal) {
  const supabase = createServerSupabaseClient(Astro);
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  } catch {
    return null;
  }
}
