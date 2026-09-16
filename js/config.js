/* ============================================================
   TIQNORA AI — Platform Configuration
   ------------------------------------------------------------
   SUPABASE_URL and SUPABASE_ANON_KEY are SAFE to expose publicly
   (the anon key is protected by Row Level Security on the server).
   Replace the empty strings after creating/configuring your
   Supabase project. The site keeps working (static fallback)
   even while these are empty.
   ============================================================ */
window.TIQNORA_CONFIG = {
  googleAnalyticsId: '',
  googleSearchConsoleMeta: '',
  supabaseUrl: 'https://mndyabvlhvrhdbgmepkg.supabase.co',
supabaseAnonKey: 'sb_publishable_MyEtiYvxwkP0_PhRDH8aIQ_iYY6cQao',

  // Admin dashboard: first admin email(s) that get role 'super_admin'
  // after they sign up (must match auth.users email exactly)
  ownerEmails: ['eng.eyadalhaj848@gmail.com'],
  version: '3.0.1'
};
