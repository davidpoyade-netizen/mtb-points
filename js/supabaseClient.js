// js/supabaseClient.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/**
 * Configuration Supabase
 * ⚠️ Clé publique uniquement (anon / publishable)
 */
export const SUPABASE_URL = "https://pqtjvvvemypuhhvsoyrc.supabase.co";
export const SUPABASE_ANON_KEY =
  "sb_publishable_iIXfzTXrNjdPavfxXX6jGQ_9nsnGNj_";

/**
 * Client Supabase
 */
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
