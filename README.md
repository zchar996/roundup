# Round Up — Monthly Meetup Planner

A no-signup group scheduler: each friend taps their name and marks dates
they're free on a shared calendar. The best overlapping date is
auto-highlighted.

This guide gets you from this folder to a real, working URL you can send
to friends. It takes about 15 minutes and is free for normal group sizes.

---

## 1. Create a free Supabase project (the database)

1. Go to [supabase.com](https://supabase.com) and sign up (free tier is plenty).
2. Click **New Project**. Pick any name/region, set a database password
   (you won't need to remember it — just save it somewhere).
3. Wait ~2 minutes for the project to finish setting up.
4. In the left sidebar, go to **SQL Editor** → **New query**.
5. Open `supabase_schema.sql` from this folder, copy all of it, paste it
   into the SQL editor, and click **Run**. This creates the `groups`
   table and turns on realtime sync.
6. Go to **Settings → API** in the sidebar. You'll need two values from
   this page in step 3 below:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (a long string under "Project API keys")

---

## 2. Get the code onto GitHub

If you don't already have a GitHub account, make one at
[github.com](https://github.com) (free).

1. Create a new repository (e.g. `round-up`).
2. Upload everything in this folder to that repository. The easiest way
   if you're not familiar with git:
   - On the new repo's GitHub page, click **uploading an existing file**
   - Drag in all the files from this folder (keep the `src` folder
     structure intact)
   - Commit the changes

---

## 3. Deploy to Vercel (free hosting)

1. Go to [vercel.com](https://vercel.com) and sign up using your GitHub
   account.
2. Click **Add New → Project**, then select the `round-up` repository
   you just created.
3. Before clicking Deploy, expand **Environment Variables** and add:
   - `VITE_SUPABASE_URL` → paste your Project URL from step 1.6
   - `VITE_SUPABASE_ANON_KEY` → paste your anon public key from step 1.6
4. Click **Deploy**. Wait about a minute.
5. You'll get a live URL like `round-up-yourname.vercel.app` — that's
   the link to send your friends.

That's it. Anyone with the link can open it, create or join a group with
a short code, tap their name, and start marking dates — and it'll sync
live for everyone, no further setup needed.

---

## Updating the app later

If you ask Claude to make changes to `src/RoundUp.jsx`, just re-upload
the updated file to the same GitHub repository (overwrite the old one).
Vercel automatically redeploys within a minute or two whenever the
repository changes — no need to repeat steps 1 or 3.

---

## Notes & limits

- **Free tier limits**: Supabase's free tier supports far more usage
  than a handful of friends planning monthly meetups will ever hit.
- **No login system**: anyone with a group's code can view and edit that
  group, by design (matches "no sign-up, just tap your name"). Don't
  reuse codes for anything sensitive.
- **Local dev**: if you want to run this on your own computer first,
  copy `.env.example` to `.env`, fill in your Supabase values, then run:
  ```
  npm install
  npm run dev
  ```
