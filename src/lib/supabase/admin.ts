import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Shared, lazily-instantiated service-role client for platform-level
// admin operations: cross-account reads/writes that must bypass RLS,
// and `auth.admin.*` calls (inviting company owners by email).
//
// Mirrors the shape of src/lib/flows/admin-client.ts and
// src/lib/automations/admin-client.ts so the convention is the same
// everywhere. SERVER-ONLY — never import this from a client component;
// it carries the service-role key.
let _adminClient: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _adminClient
}
