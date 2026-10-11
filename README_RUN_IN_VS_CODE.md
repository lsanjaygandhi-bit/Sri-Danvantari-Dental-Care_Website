# Preview in VS Code

## Folder layout
- `Sri_Danvantari_Dental_Care/` — **the website. Upload only this folder's contents to your host.**
  (You may leave out its `supabase/` sub-folder; the site does not use it at runtime.)
- `tools/` — the configure step and the test harness. Never upload it.
- `*.md` at this level — guides and reports. Never upload them.
- `.env.example` — template for your Supabase settings (copy to `.env`; never upload or commit `.env`).

## Preview the website
1. In VS Code: **File → Open Folder** → choose this package folder.
2. Open a terminal in VS Code and run:
   `cd Sri_Danvantari_Dental_Care` then `python3 -m http.server 8000` (Windows: `python -m http.server 8000`)
3. Open `http://localhost:8000`. (The Live Server extension also works: right-click `index.html` → Open with Live Server.)

The **Admin Login** button is in the header of every page, right after Contact (on phones, in the ☰ menu). It opens `admin/index.html`. Until Supabase is configured, the site shows its built-in content and the admin page shows "Admin Login is not connected yet" with the setup steps. This is expected.

## Connect Supabase (to use the Admin Dashboard)
1. Copy `.env.example` to `.env` and fill in `SUPABASE_URL` and the publishable (or anon) key.
2. In the terminal at this package folder, run `node tools/configure.mjs`.
3. Follow `ADMIN_CMS_GUIDE.md` for the database steps and the first admin account.

## sitemap.xml
Do not upload a sitemap with a placeholder domain. Once the site is live, set the domain in
Dashboard → Website settings → Site, then download `sitemap.xml` and `robots.txt` from Dashboard → SEO.
