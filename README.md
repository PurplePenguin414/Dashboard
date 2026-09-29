# Dashboard — dashboard.megangibbs.net

A self-hosted, password-protected daily dashboard. All of it shows on one
page as widgets — no tabs to click between. Ships **Brain Dump**, **Due
Today**, and **Budget** so far; **Today's Schedule** comes in a later round.

## How it works

- **Capture bar** (top of the page, above every widget): type a thought and
  hit Add or Enter. It's pinned so it's always reachable — this is the
  whole point, zero friction to jot something down.
- **Widget layout**: Brain Dump, Due Today, and Budget all show at once —
  side by side in a grid on desktop, stacked on mobile. Nothing is hidden
  behind a click; everything loads as soon as you log in.
- **Brain Dump widget**: shows everything you've captured, oldest pending
  first (so the longest-neglected ones rise to the top instead of getting
  buried). A pending note gets a colored left border once it's sat
  untouched for 3+ days — a visual nudge, not a notification.
- **Done**: mark a note Done and it moves to a collapsed "Done" section
  (most recent first, last 20 shown) instead of disappearing outright.
- **Delete**: removes a note permanently, pending or done.

There's deliberately no "push this note into Daily Planner" feature — that
was considered and dropped as not something that'd actually get used here.

- **Due Today widget**: fully interactive, backed by Daily Planner's Tasks
  panel over a key-protected API — nothing is duplicated or cached here.
  Check a task off, add a new one, or delete one right from Dashboard and
  it's reflected in Daily Planner immediately (and vice versa). This
  server holds the shared API key; the browser never sees it, it just
  talks to Dashboard's own `/api/due-today` routes with the normal login
  session, and Dashboard forwards to Daily Planner behind the scenes.
  If the widget shows a "Daily Planner isn't connected yet" message, the
  `DAILY_PLANNER_API_URL`/`DAILY_PLANNER_API_KEY` pair below isn't set.
- **Budget widget**: read-only — this month's income, expenses, savings
  rate, and any categories running over or near target, pulled straight
  from Budget Dashboard's existing iOS-widget API (no new API needed
  there). Same key-protected-proxy pattern as Due Today.

A note on the proxied widgets: if the downstream app (Daily Planner or
Budget Dashboard) rejects the shared key, this server reports that as a
"couldn't reach" error on the widget itself — it deliberately never
forwards that as a 401, so a key mismatch on one widget can't be confused
with you being logged out of Dashboard.

## Local install

Requirements: Node.js 22 or newer (better-sqlite3 needs Node ≥22).

```bash
npm install
cp .env.example .env
node scripts/set-password.js "your password here"
```

That prints a line like `APP_PASSWORD_HASH=$2b$12$...` — open `.env` and
fill in real values:

```
PORT=3000
SESSION_SECRET=some-long-random-string
APP_PASSWORD_HASH=$2b$12$...   # from the command above
DAILY_PLANNER_API_URL=http://daily-planner:3000   # container name, not host port — only matters once deployed
DAILY_PLANNER_API_KEY=                            # must match DASHBOARD_API_KEY in Daily Planner's .env
BUDGET_API_URL=http://budget-dashboard:3000
BUDGET_API_KEY=                                   # must match WIDGET_API_KEY in Budget Dashboard's .env
```

The last four are only needed for the Due Today and Budget widgets.
Locally, without those apps running in Docker on the same network, leave
them blank — the widget just shows "isn't connected yet" instead of
erroring.

Then:

```bash
npm start
```

Open `http://localhost:3000` and log in with the password you chose.

Run the automated logic tests any time with `npm test`.

### Changing the password later

```bash
node scripts/set-password.js "new password"
```

Paste the new `APP_PASSWORD_HASH` into `.env` and restart.

## Deploying to dashboard.megangibbs.net on MLG-VPS02

Same pattern as your other MLG-VPS02 apps — Apache reverse proxy,
Cloudflare DNS, Let's Encrypt via certbot, Docker Compose v2.

Port **3060** is reserved for this app (next free port after 3010/3011/
3012/3013/3020/3030/3040/3050/9090/9091).

1. Get the code onto the server — clone from your GitHub repo once it
   exists there, same pattern as Mind Map, into `/opt/dashboard`.
2. Copy the template env file (`-n` so it won't overwrite a real `.env`
   if one's already there):
   ```bash
   cd /opt/dashboard
   cp -n .env.example .env
   ```
3. Generate a password hash and write `.env` in one shot — this avoids
   the literal-`$`-in-bcrypt-hash issue: Docker Compose interpolates `$`
   in `.env` values on its own, so writing the hash straight via `echo`
   or an unescaped variable will silently corrupt it. Doubling every `$`
   to `$$` in the file is what stops that:
   ```bash
   cd /opt/dashboard && HASH_LINE=$(docker compose run --rm dashboard node scripts/set-password.js 'your password' | grep APP_PASSWORD_HASH) && ESCAPED_HASH=$(printf '%s' "$HASH_LINE" | sed 's/\$/$$/g') && printf 'PORT=3000\nSESSION_SECRET=%s\n%s\n' "$(openssl rand -hex 32 | sed 's/\$/$$/g')" "$ESCAPED_HASH" > .env && cat .env
   ```
   Confirm the printed `.env` shows `APP_PASSWORD_HASH=$$2b$$12$$...`
   (doubled `$`) before moving on — Compose will un-double them back to
   the real hash when it hands the value to the container.
4. Add the Due Today tab's two lines to that same `.env` (append, don't
   overwrite what step 3 wrote):
   ```bash
   echo "DAILY_PLANNER_API_URL=http://daily-planner:3000" >> .env
   echo "DAILY_PLANNER_API_KEY=<paste the key you generated on Daily Planner>" >> .env
   ```
   That key must be the exact same value as `DASHBOARD_API_KEY` in Daily
   Planner's own `.env` — if you haven't generated one there yet, see
   Daily Planner's README.
5. Make sure the `apps-net` Docker network exists (harmless if it
   already does — the command just no-ops with a message):
   ```bash
   docker network create apps-net
   ```
6. Build and start it:
   ```bash
   docker compose build && docker compose up -d
   ```
   Bound to `127.0.0.1:3060` — confirm nothing else is on that port
   before starting. Check the Due Today tab loads tasks once it's up; if
   it shows "Couldn't reach Daily Planner," confirm Daily Planner is
   also on `apps-net` (its own compose file needs the same network
   block — see its README) and that the two keys match exactly.
7. Add the Cloudflare DNS record:
   - Cloudflare dashboard → `megangibbs.net` zone → DNS → Records → Add record
   - Type: `A`, Name: `dashboard`, IPv4: `129.121.121.162`
   - Proxy status: click the orange cloud so it turns grey ("DNS only")
     — stays grey until the cert is issued in step 8
   - Save
8. Add the Apache vhost — build it line by line (heredocs hang in your
   terminal):
   ```bash
   VHOST=/etc/apache2/sites-available/dashboard.megangibbs.net.conf
   echo "<VirtualHost *:80>" > $VHOST
   echo "    ServerName dashboard.megangibbs.net" >> $VHOST
   echo "    ProxyPreserveHost On" >> $VHOST
   echo "    ProxyPass / http://127.0.0.1:3060/" >> $VHOST
   echo "    ProxyPassReverse / http://127.0.0.1:3060/" >> $VHOST
   echo "</VirtualHost>" >> $VHOST
   ```
   Check it landed right: `cat $VHOST` should show all six lines. Then:
   ```bash
   a2ensite dashboard.megangibbs.net.conf
   a2enmod proxy proxy_http
   systemctl reload apache2
   certbot --apache -d dashboard.megangibbs.net
   ```
   Say yes to the HTTP→HTTPS redirect prompt. Once the cert's issued, go
   back to Cloudflare DNS, find the `dashboard` A record, and click the
   grey cloud so it turns orange ("Proxied"). Save.
9. Add `/opt/dashboard/db` to borgmatic's `source_directories`, alongside
   your other apps, then:
   ```bash
   borgmatic config validate
   borgmatic --dry-run --verbosity 1
   ```

### Updating the app later

```bash
cd /opt/dashboard
git pull
docker compose build && docker compose up -d
```

`.env` and `db/` aren't tracked by git, so a pull never touches your
password or your saved notes.

## Roadmap

Planned build order for the remaining widgets:
1. ~~**Due Today**~~ — done. Tasks/To-do feature on Daily Planner, pulled
   in here as a fully interactive widget (add/check off/delete, synced
   both ways).
2. ~~**Budget Snapshot**~~ — done. Reuses Budget Dashboard's existing
   iOS-widget API, read-only.
3. **Today's Schedule** — straight pull from Daily Planner's existing
   data, no merge logic needed since Med Tracker appointments already
   flow into Daily Planner.

Note: the layout changed from tabs to always-visible widgets after the
first round — everything above already reflects that.

All three live on MLG-VPS02 alongside Daily Planner, Med Tracker, and
Budget Dashboard, so they talk to each other over the existing local
`apps-net` Docker network — no external API keys or cross-server calls
needed.
