// Account settings. Fill these in from your Supabase project
// (Project Settings → API Keys) to turn on sign-in and sync. The key can be
// the newer "publishable" key (sb_publishable_...) or the legacy anon key. Leave them empty
// and the planner works on this device only.
//
// This key is meant to be public: it's shipped to every browser, and the
// database's row-level security (supabase/schema.sql) is what keeps each
// student's planner private.

export const SUPABASE_URL = 'https://fknaqhlakprrbfhmzsqf.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_Ejg2p1Uy8iS4-BqscWtmTA_CexUeKTm';

export const SUPABASE_JS_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
