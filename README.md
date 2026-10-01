# Multi-client grocery store system (HTML/CSS/vanilla JS + Supabase)

Files: `index.html style.css script.js` (storefront) · `admin.html admin.css admin.js` (admin) · `config.js` (per-client) · `schema.sql` (tables, RLS, storage).

## Which keys are safe?
- **Safe in frontend:** Supabase Project URL and the `anon` (public) key. Row Level Security is what protects data.
- **Never in frontend or Git:** the `service_role` key, database password, and admin passwords.

## Setup
1. Create a project at supabase.com. Local run: `python3 -m http.server 8000`, open `http://localhost:8000` (admin at `/admin.html`).
2. SQL Editor → paste all of `schema.sql` → Run. This creates `stores`, `categories`, `products`, `store_admins`, RLS policies, the public `product-images` bucket and its upload policies, plus a demo store.
3. Authentication → Providers: keep Email enabled. Authentication → Settings: **disable "Allow new users to sign ups"** so only you create accounts.
4. Project Settings → API: copy the URL and `anon` key into `config.js`. Set `STORE_SLUG` to the store's slug.
5. **First admin:** Authentication → Users → Add user (email + password, tick auto-confirm). Copy the user's UUID, then run:
   `insert into store_admins(user_id, store_id) select '<USER_UUID>', id from stores where slug='freshmart';`
6. Deploy: push the folder to a GitHub repo → Settings → Pages → deploy from branch `main` / root. Then in Supabase → Authentication → URL Configuration, add your Pages URL as Site URL.

## Daily use (client)
Open `/admin.html`, log in. Products tab: add/edit/delete, set category, price, old price, discount toggle, availability, and image (the file picker opens camera/gallery on phones; images go to Storage, not into code). Settings tab: store name, logo, phone, WhatsApp (digits only, with country code), address, hours, delivery, about text, colours, social links.

## New client
1. SQL: `insert into stores(slug,name,whatsapp) values('client2','Client Two','92300...');`
2. Create their Auth user, then link: `insert into store_admins(user_id,store_id) select '<UUID>', id from stores where slug='client2';`
3. Copy the folder (or a branch/repo), change only `STORE_SLUG` in `config.js`, deploy. Everything else (logo, colours, products) is edited in their admin.
Same Supabase project can serve all clients; or use one project per client for stronger isolation.

## How clients are isolated
Every row has a `store_id`. RLS policy `is_store_admin(store_id)` allows writes only when the logged-in user has a row in `store_admins` for that store. Storage uploads are only allowed inside the folder named after the admin's own `store_id`. Clients cannot create stores or admins.

## Testing checklist
- Storefront loads products, categories, store info; empty/error states show when offline.
- Search, category filter, offers section, out-of-stock disables Add.
- Cart add/+/−/remove/clear, refresh keeps cart, WhatsApp message has store, items, prices, total.
- Test at 320, 375, 390, 414, 768, 1024, 1280, 1440px: no sideways scroll.
- Admin: wrong password rejected; add/edit/delete product with image from phone; settings save and appear on storefront.
- Isolation: log in as client A, try updating a client B product in the browser console → must fail.
