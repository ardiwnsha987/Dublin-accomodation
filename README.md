# WhatsApp Accommodation Watcher

Watches selected WhatsApp groups in real time and forwards messages that match
your filters (keywords like "room available", "double", "ensuite", etc.) to
another WhatsApp number of yours — so you get pinged the moment a listing you
care about is posted, without having to sit in every group.

## Important: read this first

- This uses **Baileys**, an unofficial library that talks to WhatsApp using
  your real personal account (via the same protocol WhatsApp Web uses). It is
  **not** an official WhatsApp/Meta API and using it is against WhatsApp's
  Terms of Service. It's widely used for personal projects like this one, but
  there's a real (small) risk your account could get flagged or temporarily
  restricted. Use at your own risk, and don't send high volumes of automated
  messages with it.
- It must run continuously on a device you control (your laptop) to catch
  messages in real time. If the laptop is off/asleep or the process isn't
  running, you won't get alerts during that time.
- Nothing is sent to any third-party server — the script only talks directly
  to WhatsApp and forwards matches to the WhatsApp number you configure.

## Setup

1. **Install Node.js** (v18 or later) if you don't have it.
2. Install dependencies:
   ```
   npm install
   ```
3. Copy the example config and fill in your details:
   ```
   cp config.example.json config.json
   ```
   Edit `config.json`:
   - `targetNumber`: the WhatsApp number that should receive alerts, in
     international format without `+` or spaces (e.g. Irish number
     `+353 89 978 7519` becomes `"353899787519"`).
   - `groupIds`: leave as `[]` for the first run.
   - `groupNameKeywords`: any word that, if found in a group's name, gets it
     watched automatically — including groups you join later.
   - `keywords.include` / `keywords.exclude`: words/phrases to match or
     ignore, case-insensitive. Single words match as whole words (so `"male"`
     won't false-match inside `"female"`); phrases match as substrings.
   - `maxRent`: hard cutoff — a message with a single, unambiguous €-amount at
     or above this is skipped entirely.
   - `preferredRent`: amounts at or below this get tagged "priority" in the
     forwarded message so it's easy to spot at a glance.
   - `nearbyAreaKeywords`: place names to flag as "near DBS" in the forwarded
     message. This is just a keyword check against the message text, not a
     real distance calculation — edit the list to whatever areas you consider
     close to your college.
4. Start the watcher:
   ```
   npm start
   ```
5. Open **http://localhost:3000** in your browser — a QR code appears there
   too (as well as in the terminal). On your phone: **WhatsApp → Settings →
   Linked Devices → Link a Device**, then scan it. This only needs to be done
   once — your session is saved in `auth_info/`.
6. Use the dashboard's Filters tab to tick which groups to watch and edit
   keywords/rent/location settings instead of hand-editing JSON.

## Dashboard

Starting the watcher (`npm start`) also starts a local web dashboard at
**http://localhost:3000** (only reachable from your own machine, nothing is
exposed to the internet). It has two tabs:

- **Live Matches** — every match forwarded to your WhatsApp shows up here
  too, in real time, as a card with rent/location chips, a link to open the
  source group in WhatsApp (when your account can generate an invite link —
  most groups you're a plain member of won't allow this, WhatsApp restricts
  it to admins), and a Dismiss button to clear items you've already handled.
  A search box and "All / Priority rent / Near DBS" filter chips help you
  triage a long list. A stats bar up top shows total matches, how many are
  priority-rent, how many are tagged near DBS, and how many groups are
  currently watched.
- **Filters** — edit `include`/`exclude` keywords, `maxRent`/`preferredRent`,
  `nearbyAreaKeywords`, `groupNameKeywords`, and tick which of your joined
  WhatsApp groups to watch (fetched live from your account). Saving writes
  straight to `config.json` and takes effect immediately — no restart needed.

Other controls on the Live Matches tab:

- **🔍 Search watched groups** (with an "include all joined groups" checkbox)
  — asks WhatsApp to resend older messages so listings posted before the
  watcher started can be matched too. This is best-effort: WhatsApp's
  companion-device history sync decides what it's willing to hand back,
  older messages may not come through at all, and there's no guarantee of
  getting everything you've already scrolled past. Running it repeatedly
  adds to the account-flag risk noted above, so use it sparingly — once or
  twice, not on a loop.
- **✉️ Send test message** — sends a one-line confirmation to your target
  number, useful for checking the forwarding path works without waiting for
  a real listing.
- **⬇️ Export matches** / **🗑️ Clear all** — download your match history as
  JSON, or wipe the dashboard's list (this doesn't affect WhatsApp itself).

**Log out** (top right) logs the currently linked WhatsApp account out
properly (not just a local file delete) and immediately brings up a fresh QR
code in the dashboard so you can link a different WhatsApp account if you
want. Confirm before clicking — it ends the current session.

### On forwarded messages

Each match sends **two** WhatsApp messages to your target number: a text
summary (group, sender, time, rent/location tags, and the group's invite
link when available), followed by a native **forward of the original
message** (preserving its original formatting/media, tagged "Forwarded" by
WhatsApp itself). There is no such thing as a link that jumps straight to a
specific message inside a group — WhatsApp doesn't support that in the
official app either, so no library, official or not, can produce one; the
native forward plus the group link are the closest practical equivalent.

## Running it continuously

Keep the terminal/process running in the background, e.g.:
```
nohup npm start > watcher.log 2>&1 &
```
or use a process manager like `pm2` if you want it to survive reboots and
auto-restart on crashes.

## How matching works

- A message only counts if it's in a watched group, contains at least one
  `include` keyword (if you set any), and contains none of the `exclude`
  keywords.
- If exactly one clear €-price is found in the message and it's at or above
  `maxRent`, the message is skipped even if the keywords matched. If no price
  is found, or more than one number looks like it could be a price, it's
  still forwarded (tagged "check manually") rather than risk hiding a real
  listing — price parsing from free-form chat text is inherently imperfect.
- The forwarded message is prefixed with a rent tag (💰) and a location tag
  (📍) so you can triage matches quickly without opening every one.
- Already-forwarded messages are tracked in `data/seen-messages.json` so
  restarts don't re-send duplicates.

## Files

- `src/index.js` — connects to WhatsApp, listens for messages, forwards matches.
- `src/config.js` — loads `config.json`, hot-reloads it on change, exposes read/write helpers.
- `src/matcher.js` — keyword include/exclude filtering, price extraction, location tagging.
- `src/seenStore.js` — tracks which message IDs have already been forwarded.
- `src/matchStore.js` — persists forwarded matches for the dashboard's history list.
- `src/state.js` — shared connection/group status used by the dashboard.
- `src/server.js` — the local dashboard's HTTP/API server (Express).
- `public/` — the dashboard's front-end (plain HTML/CSS/JS, no build step).
- `config.json`, `auth_info/`, `data/` — all local-only, gitignored (not committed).
