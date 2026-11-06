# Čiki Puki

1. `npm install`
2. `npx wrangler d1 create guitar-guard-db` → paste the `database_id` into `wrangler.toml`
3. `npm run db:init` (remote) and/or `npm run db:init:local`
4. Optional: `npx wrangler r2 bucket create ciki-puki-audio` and uncomment `[[r2_buckets]]` in `wrangler.toml` (without it, recordings are stored in D1 and limited to ~1.9 MB ≈ 20 min)
5. Parent PIN: created in the app on first visit to the parent view (optional fallback: `npx wrangler secret put PARENT_PIN`)
6. Add `public/icon-192.png` and `public/icon-512.png` (Chrome needs PNG icons to offer "Install")
7. Dev: `npx wrangler dev` + `npm run dev` · Deploy: `npm run deploy` (HTTPS is required for the microphone and install)



When you activate R2 later:

Run npx wrangler r2 bucket create ciki-puki-audio.
Remove the # in wrangler.toml.
Optionally set the bitrate back to 24000.
Deploy.
New recordings then go to R2, and recordings already saved in the database still play.
