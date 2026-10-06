# Guitar Guard

1. `npm install`
2. `npx wrangler d1 create guitar-guard-db` → paste the `database_id` into `wrangler.toml`
3. `npm run db:init` (remote) and/or `npm run db:init:local`
4. `npx wrangler secret put PARENT_PIN` (protects parent changes)
5. Add `public/icon-192.png` and `public/icon-512.png` (Chrome needs PNG icons to offer "Install")
6. Dev: `npx wrangler dev` + `npm run dev` · Deploy: `npm run deploy` (HTTPS is required for the microphone and install)
