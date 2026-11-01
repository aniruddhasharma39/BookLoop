import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Reverse Proxy Architecture:
// In the browser, all API traffic routes to window.location.origin + '/api/supabase'.
// Netlify, Vercel, and local Vite forward this to the actual Supabase project in the background.
// This completely shields and hides 'ofaybxxfymkzceydqfia.supabase.co' from:
// 1. Browser Network Tab
// 2. Developer Console
// 3. Client JavaScript Bundle
const isBrowser = typeof window !== 'undefined';
const useProxy = import.meta.env.VITE_PROXY_SUPABASE !== 'false';

export const supabaseUrl = isBrowser && useProxy
  ? `${window.location.origin}/api/supabase`
  : (rawUrl || 'https://placeholder.supabase.co');

export const isSupabaseConfigured = Boolean(
  (supabaseUrl || rawUrl) && 
  supabaseAnonKey && 
  !rawUrl.includes('your-project-id') &&
  !supabaseAnonKey.includes('your-supabase-publishable-anon-key')
);

if (!isSupabaseConfigured) {
  console.warn(
    '⚠️ [BookLoop] Supabase environment variables missing or incomplete. ' +
    'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env.local file.'
  );
}

// Fallback empty client or active client
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

