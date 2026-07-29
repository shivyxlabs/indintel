import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error("🚨 CRITICAL: Missing Supabase Environment Variables!");
  console.error("Check your .env.local file. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are exactly matched.");
}

// Force a valid string fallback to prevent Turbopack from crashing the entire server during build
const safeUrl = supabaseUrl && supabaseUrl.length > 5 ? String(supabaseUrl) : 'https://placeholder-url.supabase.co';
const safeKey = supabaseKey && supabaseKey.length > 5 ? String(supabaseKey) : 'placeholder-anon-key-string';

// Initialize the secure Supabase client
export const supabase = createClient(safeUrl, safeKey);