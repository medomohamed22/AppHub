# AppHub Pi Directory

## Setup
1. Create a Supabase project and run `sql/schema.sql`.
2. Create a **public** Storage bucket named `app-media`.
3. Add the variables from `.env.example` to Vercel.
4. Deploy, then open the site in Pi Browser.
5. After your first login, promote your account in Supabase:
   ```sql
   update public.users set role='admin' where username='YOUR_PI_USERNAME';
   ```

## Features
- Pi sign-in and JWT session
- Mainnet/Testnet filters and category search
- Logo + exactly three screenshot uploads to Supabase Storage
- Paid app submission through Pi SDK with server-side approve/complete
- Pending moderation workflow
- Owner-only edit/delete actions
- Admin approval/rejection/suspension dashboard and payment revenue records

## Notes
- Submission price is currently `1 Pi` in `index.html`.
- The backend uses `PI_SECRET_KEY`; never expose it in client code.
- Verify your Pi app domain, wallet and production settings in the Pi Developer Portal before using Mainnet.

## Engagement upgrade
Run `sql/engagement-features.sql` after the base schema. It adds:
- One 1–5 star rating per Pi user, with automatic average and rating count
- Daily-deduplicated app views and Get clicks per browser
- Developer analytics in Profile
- User reports and admin report review
- Admin-controlled AppHub Verified badges

## v15 submission/edit update
- New submissions require a logo and at least one screenshot; screenshots 2 and 3 are optional.
- Developer contact email is optional.
- Uploaded image previews include a remove button.
- Owners can reopen the full submission form, edit every field/image, and resubmit for review without another payment.
- Existing Supabase projects must run `sql/optional-screenshots-email-update.sql` once.


## v17 image optimization and rejection feedback
- New and replacement logos/screenshots are resized and converted to WebP in the browser before upload.
- Logos use a maximum 900px dimension at high quality; screenshots use a maximum 1800px dimension at high quality.
- Admin rejection requires a written reason, which appears to the developer in My Apps.

## Automatic Storage cleanup (v19)

When an owner deletes an app, the backend removes its logo and screenshots from the `app-media` bucket before deleting the database row. When an owner replaces or removes an image during editing, the app is updated first and then media files that are no longer referenced are removed automatically.

Run `sql/storage-cleanup-permissions.sql` once in Supabase SQL Editor. Storage mutations stay backend-only through `SUPABASE_SERVICE_ROLE_KEY`; never expose that key in browser code.
