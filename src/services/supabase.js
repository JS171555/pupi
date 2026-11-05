import { createClient } from '@supabase/supabase-js';
import { readPublicConfig } from '../config/environment.js';

export function createPupiClient(values, options = {}) {
  const { supabaseUrl, supabasePublishableKey } = readPublicConfig(values);
  return createClient(supabaseUrl, supabasePublishableKey, {
    ...options,
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      ...options.auth,
    },
  });
}
