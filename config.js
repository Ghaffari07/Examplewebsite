// Per-client settings. Both Supabase values are PUBLIC and safe in frontend code (RLS protects data).
// NEVER put the service_role key here.
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_PUBLIC_ANON_KEY",
  STORE_SLUG: "freshmart",          // which store row this site shows
  BUCKET: "product-images"
};
