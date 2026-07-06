import { createClient } from '@supabase/supabase-js'

// Publishable key — safe to ship in frontend code. RLS guards the data.
const SUPABASE_URL = 'https://icjcqtkdeadsdqdjghuw.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_HGx0x8q1PaFc1zNPrHUoOQ_17qyiK3K'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
