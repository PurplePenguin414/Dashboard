# Dashboard — dashboard.megangibbs.net

A self-hosted, password-protected daily dashboard. This first round ships the
**Brain Dump** tab and the globally-pinned capture bar; **Due Today**,
**Budget Snapshot**, and **Today's Schedule** tabs come in later rounds.

## How it works

- **Capture bar** (top of every screen, every tab): type a thought and hit
  Add or Enter. It's pinned so it's always reachable no matter which tab
  you're looking at — this is the whole point, zero friction to jot
  something down.
- **Brain Dump tab**: shows everything you've captured, oldest pending first
  (so the longest-neglected ones rise to the top instead of getting buried).
  A pending note gets a colored left border once it's sat untouched for 3+
  days — a visual nudge, not a notification.
- **Done**: mark a note Done and it moves to a collapsed "Done" section
  (most recent first, last 20 shown) instead of disappearing outright.
- **Delete**: removes a note permanently, pending or done.

There's deliberately no "push this note into Daily Planner" feature — that
was considered and dropped as not something that'd actually get used here.

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
```

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
4. Build and start it:
   ```bash
   docker compose build && docker compose up -d
   ```
   Bound to `127.0.0.1:3060` — confirm nothing else is on that port
   before starting.
5. Add the Cloudflare DNS record:
   - Cloudflare dashboard → `megangibbs.net` zone → DNS → Records → Add record
   - Type: `A`, Name: `dashboard`, IPv4: `129.121.121.162`
   - Proxy status: click the orange cloud so it turns grey ("DNS only")
     — stays grey until the cert is issued in step 6
   - Save
6. Add the Apache vhost — build it line by line (heredocs hang in your
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
7. Add `/opt/dashboard/db` to borgmatic's `source_directories`, alongside
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

Planned build order for the remaining tabs:
1. **Due Today** — a new Tasks/To-do feature on Daily Planner, pulled in
   here as its own card/tab.
2. **Budget Snapshot** — a new read-only external API on Budget
   Dashboard (this month's income, expenses, savings %, over-budget
   categories).
3. **Today's Schedule** — straight pull from Daily Planner's existing
   data, no merge logic needed since Med Tracker appointments already
   flow into Daily Planner.

All three live on MLG-VPS02 alongside Daily Planner, Med Tracker, and
Budget Dashboard, so they talk to each other over the existing local
`apps-net` Docker network — no external API keys or cross-server calls
needed.
