/*
 * Public configuration for the website's content service (Supabase).
 *
 * Do not edit by hand: generate it with
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... node tools/configure.mjs
 * (see ADMIN_CMS_GUIDE.md). Both values are designed to be public: the key only
 * allows what the database's Row Level Security policies allow for visitors
 * (read published content, submit an appointment request).
 * NEVER put a service_role / secret key, a database password or an access token here.
 *
 * While these are empty, the CMS is switched off: the website shows its built-in
 * static content and the Admin Dashboard shows a "not configured" message.
 */
window.SDDC_CONFIG = {
  supabaseUrl: 'https://aywservzotejmoprxsir.supabase.co',
  supabaseKey: 'sb_publishable_Oga6p3X8jo1FiOP58fv9Jw_z2OFB9QG',
  // A visitor's browser reuses content it fetched less than this many seconds
  // ago without asking again. Published changes appear within this time.
  freshSeconds: 60
};
