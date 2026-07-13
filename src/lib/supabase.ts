import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Reads config from env (Netlify vars or .env). Until it's set, the app runs
// entirely on-device (localStorage) exactly as it does today — connecting
// Supabase later flips it to shared, multi-device, real-time data.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseEnabled = Boolean(url && anon)
export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url as string, anon as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
