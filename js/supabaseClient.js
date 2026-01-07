// js/supabaseClient.js

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "https://pqtjvvvemypuhhvsoyrc.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxdGp2dnZlbXlwdWhodnNveXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2OTQ1MzksImV4cCI6MjA4MjI3MDUzOX0.KA62g7qLe17ZXpjzuCPj49c-s1mk428LrVwh3NsC2to"; // Settings > API > anon public

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "https://pqtjvvvemypuhhvsoyrc.supabase.co";
export const SUPABASE_ANON_KEY = "…";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

