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
5. A QR code prints in the terminal. On your phone: **WhatsApp → Settings →
   Linked Devices → Link a Device**, then scan it. This only needs to be done
   once — your session is saved in `auth_info/`.
6. Once connected, the script prints every group you're in along with its
   ID, e.g.:
   ```
   Dublin Rooms & Flatshares -> 120363012345678901@g.us
   ```
   Copy the IDs of the accommodation groups you actually want watched into
   `groupIds` in `config.json`, then restart (`npm start`) so it only
   watches those groups instead of all of them.

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
- `src/config.js` — loads and validates `config.json`.
- `src/matcher.js` — keyword include/exclude filtering logic.
- `src/seenStore.js` — tracks which message IDs have already been forwarded.
- `config.json`, `auth_info/`, `data/` — all local-only, gitignored (not committed).
