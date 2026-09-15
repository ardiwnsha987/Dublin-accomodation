# Deploying to a Hetzner VPS as apps.ardiwnsha.in

This sets up a small always-on server that hosts:
- `apps.ardiwnsha.in` — a portal page listing your personal apps
- `watcher.apps.ardiwnsha.in` — this accommodation watcher's dashboard
- (later) `<newapp>.apps.ardiwnsha.in` — any future app, following the same pattern

Everything sits behind one shared HTTP Basic Auth login, since the watcher's
dashboard has no login of its own and controls a live WhatsApp session —
without this, anyone who found the URL could see your matches or log out
your WhatsApp account.

## 1. Create the Hetzner server

1. Sign up at hetzner.com/cloud and create a new project.
2. Create a server: cheapest **CX22** (or similar) is plenty, image
   **Ubuntu 24.04**, add your SSH key during creation (Hetzner walks you
   through generating one if you don't have one).
3. Note the server's public IPv4 address — you'll need it for DNS.

## 2. Point DNS at it

Wherever you manage DNS for `ardiwnsha.in` (your domain registrar, or
Netlify DNS if that's where it's configured — check whichever dashboard
controls the domain's nameservers), add:

| Type | Name              | Value              |
|------|-------------------|---------------------|
| A    | apps              | your server's IP    |
| A    | watcher.apps      | your server's IP    |

(For each future app, add another `A` record: `<appname>.apps` → same IP.)

DNS can take a few minutes to a few hours to propagate.

## 3. Server setup

SSH in: `ssh root@your-server-ip`

Install everything needed:
```bash
apt update && apt upgrade -y
apt install -y nginx certbot python3-certbot-nginx apache2-utils git

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

npm install -g pm2
```

Basic firewall (only SSH, HTTP, HTTPS reachable):
```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

## 4. Deploy this app

```bash
git clone <this-repo-url> /opt/dublin-accommodation
cd /opt/dublin-accommodation
git checkout claude/dublin-accommodation-whatsapp-lfbuhc
npm install
cp config.example.json config.json
nano config.json   # fill in targetNumber, keywords, etc. — same as local setup
```

Run it under pm2 so it survives crashes and reboots:
```bash
pm2 start src/index.js --name watcher --cwd /opt/dublin-accommodation
pm2 save
pm2 startup   # run the command it prints
```

## 5. Set up the portal page

```bash
mkdir -p /var/www/apps-portal
cp /opt/dublin-accommodation/deploy/portal/index.html /var/www/apps-portal/index.html
```
Edit that file later to add a card for each new app you deploy.

## 6. Set up nginx

```bash
cp /opt/dublin-accommodation/deploy/nginx/apps-portal.conf /etc/nginx/sites-available/
cp /opt/dublin-accommodation/deploy/nginx/watcher.conf /etc/nginx/sites-available/
ln -s /etc/nginx/sites-available/apps-portal.conf /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/watcher.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
```

## 7. Set a login (shared across all apps on this domain)

```bash
htpasswd -c /etc/nginx/.htpasswd yourusername
```
(Drop the `-c` for additional usernames later — it overwrites the file.)
Pick a real password here; this is the only thing standing between the
public internet and your WhatsApp session once HTTPS is on.

## 8. Add HTTPS

```bash
certbot --nginx -d apps.ardiwnsha.in -d watcher.apps.ardiwnsha.in
```
Certbot edits the nginx configs to redirect HTTP to HTTPS and sets up
auto-renewal. Visit `https://apps.ardiwnsha.in` and
`https://watcher.apps.ardiwnsha.in` to confirm both prompt for the login
you set above, then serve the portal / dashboard respectively.

## Adding a future app

1. Run the new app on its own port (e.g. `pm2 start ... --name newapp`,
   listening on `127.0.0.1:3001`).
2. Copy `deploy/nginx/watcher.conf` to a new file, change `server_name` to
   `newapp.apps.ardiwnsha.in` and the `proxy_pass` port.
3. Symlink it into `sites-enabled`, `nginx -t && systemctl reload nginx`.
4. Add the DNS `A` record for `newapp.apps`.
5. Expand the certificate: `certbot --nginx --expand -d apps.ardiwnsha.in -d watcher.apps.ardiwnsha.in -d newapp.apps.ardiwnsha.in`
6. Add a card for it in `/var/www/apps-portal/index.html`.

Same shared login covers it automatically since it's the same
`/etc/nginx/.htpasswd` file referenced in the new config.
