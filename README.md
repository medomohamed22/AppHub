# Island Way

MVP 3D browser game for Pi Browser, Vercel and Supabase.

## Local setup
1. `cp .env.example .env.local` and fill values.
2. Run `supabase/migrations/001_initial.sql` in Supabase SQL Editor.
3. `npm install`
4. `npm run dev`

## Production
Deploy to Vercel, add the same environment variables, configure your Vercel URL in Pi Developer Portal, and keep `NEXT_PUBLIC_PI_SANDBOX=true` until Sandbox payments work end-to-end.

## Security notes
Pi identity is verified server-side with `/v2/me`; secret keys never reach the browser; payment price comes from the database; completion validates UID, order metadata, amount, direction, transaction and status; inventory delivery is transactional and idempotent; mutable tables are inaccessible to anon/authenticated roles.
