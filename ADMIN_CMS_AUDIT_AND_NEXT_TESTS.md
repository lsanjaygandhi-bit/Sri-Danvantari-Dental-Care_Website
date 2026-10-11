# Admin CMS audit — Sri Danvantari Dental Care

## Changes made in this revision
- Added a left-to-right horizontally scrollable treatment-card strip for the six homepage treatment cards.
- Added touch scrolling, scroll snapping, a visible scrollbar, keyboard focus, and a mobile-specific card width.
- Applied the same changes to the root and nested website copies to keep them in sync.
- Did not edit homepage hero markup or text.

## Static audit findings
- The archive contains two website copies (`Sri Danvantari Dental Care_Website/` and its nested `Sri_Danvantari_Dental_Care/` copy). Deploy only the intended canonical copy; keep them synchronized to avoid editing one copy and deploying the other.
- The full modular admin implementation is under `Sri_Danvantari_Dental_Care/admin/` and includes modules for pages, collections (doctors/treatments/categories/testimonials/gallery/FAQs), media, settings, navigation, appointments, admin users, and audit logs.
- The root `admin/index.html` is not the same complete module tree as the nested admin copy. Verify which admin path the live site serves before deployment.
- Static inspection cannot prove that every admin button works end-to-end. This requires a live authenticated browser test against the configured Supabase schema, RLS policies, storage bucket, and RPC functions.
- The CMS can manage only content represented by its supported tables/fields and `data-cms*` bindings. Any hard-coded text, links, cards, metadata, or sections not bound to CMS fields will not automatically become editable in the admin panel. Perform a page-by-page content coverage audit before claiming all live website content is manageable.
- No production database migrations were executed by this ZIP edit. No passwords or Supabase secret/service-role keys were added.

## Required end-to-end acceptance tests before launch
1. Sign in as the designated Super Admin; verify `admin_me()` and dashboard stats RPCs.
2. Edit and publish each page section, then verify the live page reflects the changes after refresh.
3. Create/edit/publish/unpublish/archive a doctor and a treatment; verify slug, ordering, images, and public page rendering.
4. Upload/replace/delete media and verify storage policy, alt text, usage checks, and public image URLs.
5. Test appointment submit, list, status change, notes, and CSV export using test data only.
6. Test navigation, SEO settings, site settings, user roles, audit log, password reset, sign-out, and unauthorized-role denial.
7. Repeat key flows on mobile and desktop; verify the treatment strip scrolls horizontally and the hero remains unchanged.
