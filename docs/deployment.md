# Private playtest hosting (Railway)

14 October 2026 · issue #6 · plan #4.

## What this is

A **private, invite-only** multiplayer playtest for about six trusted testers.
- Each tester gets a personal invite key.
- There are no accounts.
- Characters are anonymous per browser and may be wiped.
- It is **not** public.

The owner approved paid hosting and this labelled exception to "do not expose the checkpoint server publicly" on 14 October 2026 (decisions D1 and D2). Hosted logins (OIDC) still come before any public testing; see [technical architecture](technical-architecture.md).

The game server serves the page and the WebSocket from one address. The hosted page contains no solo code or quest answers; `npm run build:hosted` checks this.

## Before you start

- **Merge the work.** The hosting PR (#6) is merged to `main`, and CI is green. CI includes the `hosted` job, which builds and runs the Docker image.
- **Make one key per tester.** Use 16–128 characters: letters, digits, `_` or `-`. For example:

  ```sh
  node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
  ```

  Keep the keys in a password manager. Never put them in the repository, the journal or an issue.

## Railway, step by step

1. **Create an account.** Sign in to [Railway](https://railway.com) with GitHub. Choose the **Hobby** plan ($5 a month, including $5 of usage) and add a card.
2. **Create the project.** **New Project → Deploy from GitHub repo**. Authorise the Railway app for `shaunnez/3kingdoms`.
3. **Source.** Under **Service → Settings → Source**, set the branch to `main` and turn on **Wait for CI**.
4. **Region.** Under **Settings → Deploy**, set the region to **Southeast Asia (Singapore)**. It is the closest to NZ and Australia; Railway has no Sydney region.
5. **Builder.** Railway detects the root `Dockerfile`. Leave the custom start command **empty**: the image runs `node` directly, so a redeploy's SIGTERM reaches the game and it saves.
6. **Volume.** Add a **Volume** mounted at `/data`. In its **Backups** tab, turn on daily backups.
7. **Domain.** Under **Networking**, choose **Generate Domain**. If Railway asks for a port, enter `8080`.
8. **Variables.** Set the variables in the table below.
9. **Service settings:**
   - health check path `/health`;
   - **App Sleeping (Serverless)** off;
   - **1 replica**. The game is one stateful room on one volume.
10. **Spending.** Under **Workspace → Usage**, set a **hard limit of $10–20**, and a custom email alert at about half of it. Railway also emails at 75%, 90% and 100%. **When the hard limit is reached, Railway takes the game offline.** The save stays on the volume.
11. **Deploy.** In the logs, look for `"event":"checkpoint-ready"` with `"mode":"playtest"`. Open the domain, paste your key and enter Highcross.

### Variables

The image already sets these, so you don't need to:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `THREEFOLD_PUBLIC` | `1`, public mode |
| `THREEFOLD_HOST` | `0.0.0.0` |
| `PORT` | `8080` |
| `THREEFOLD_SAVE` | `/data/world.json` |
| `THREEFOLD_CLIENT_DIR` | `/app/dist/hosted` |

The server **refuses to start** if a required variable is missing. The log line names the variable.

| Variable | Required | What it does | Example (not a real value) |
|---|---|---|---|
| `THREEFOLD_ORIGINS` | yes | The address of the playtest page. Browsers on any other site are refused. | `https://your-app.up.railway.app` |
| `THREEFOLD_PLAYTEST_KEYS` | yes | One `name:key` pair per tester, comma-separated. Names are lower-case. Keys must be unique, and the server refuses obvious example keys. | `alice:<key>,bob:<key>` |
| `THREEFOLD_TRUST_PROXY` | yes on Railway | Set it to `1`. The server then takes each player's address from Railway's `X-Real-IP` header for the per-address limits. Without it, every tester looks like one address. | `1` |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | recommended | Time the old deployment gets to save before it stops. | `15` |
| `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS` | recommended | Railway already stops two deployments mounting one volume; setting this makes it explicit. | `0` |
| `THREEFOLD_MAX_CHARACTERS` | no | Most characters the save keeps. | `200` (default) |
| `THREEFOLD_NEW_CHARACTERS_PER_IP` | no | New characters per address per day. The count is kept in memory, so a restart or redeploy resets it; `THREEFOLD_MAX_CHARACTERS` still caps the total. | `4` (default) |
| `THREEFOLD_MAX_SOCKETS_PER_IP` | no | Open connections per address. | `4` (default) |
| `THREEFOLD_MATCHMAKE_PER_MINUTE` | no | Join attempts per address per minute. | `30` (default) |
| `THREEFOLD_PENDING_SEATS_PER_IP` | no | Seats an address may hold while connecting. | `2` (default) |
| `THREEFOLD_RECONNECT_SECONDS` | no | How long a dropped player can come back to the same session. | `20` (default) |
| `THREEFOLD_WS_DEFLATE` | no | WebSocket compression. Leave it off until its CPU cost has been measured. | unset |

If the logs say `/data` is not writable, set `RAILWAY_RUN_UID=0`. The image then fixes the volume's ownership itself before it drops privileges.

## If saving fails

The logs show `save-failed` when the volume refuses a write. Ordinary progress is retried. When loot changes hands (a body drops, items are claimed) and that save fails, the server logs `escrow-unsaved` and stops at once, so nobody acts on property that never reached the disk. Railway restarts it from the last good save. If it keeps stopping, check the volume's free space in **Volume → Metrics**.

## Add or remove a tester

1. Edit `THREEFOLD_PLAYTEST_KEYS`, then **Deploy**.
2. Everyone drops for a moment and reconnects automatically.
3. A removed key gets "That invite key isn't valid".

Testers can also open `https://<domain>/#invite=<their-key>`. The key fills in once and is then removed from the address bar; browsers never send `#` fragments to servers.

## Backup, restore and rollback

- **Backups.** The save is `world.json` on the volume. Backups run daily, so up to 24 hours of progress can be lost.
- **Restore.** **Volume → Backups → Restore** stages a backup; deploy to apply it. Try one restore before testers rely on the server.
- **Rollback.** **Deployments → an earlier deployment → Rollback**. The volume is not rolled back. If a rollback crosses a protocol change, testers are asked to reload.

## First-deploy checks

- [ ] Two testers on different networks connect over `wss://` and see each other.
- [ ] The logs show no `proxy-header-missing`. If they do, the per-address limits are not seeing real addresses: check `THREEFOLD_TRUST_PROXY=1`.
- [ ] A redeploy logs `"event":"shutdown"` with `"ok":true`. Players reconnect by themselves and keep their characters.
- [ ] One volume restore has been tried.
- [ ] Removing a tester's key has been tried.
- [ ] One week of usage is compared with the estimate of about $5 a month.

## Latency from NZ and Australia

Each tester should measure their connection in two ways:

- Run this five times:

  ```sh
  curl -o /dev/null -s -w 'connect %{time_connect}s tls %{time_appconnect}s total %{time_total}s\n' https://<domain>/health
  ```

- Read the in-game ping in **Settings**.

Record the median. If it is above about 150 ms, or combat feels laggy, try **Fly.io's Sydney region (`syd`)**:
- the same `Dockerfile`;
- one machine;
- a 1 GB volume mounted at `/data`;
- the same variables, set as Fly secrets.

Fly's Sydney pricing has not been checked.

## Rehearse locally first (no spend)

Without Docker, run the bundle on this machine in public mode (`npm start` alone has no invite keys or matching origin, so it refuses the page's join):

```sh
npm run build:hosted && npm run build:server && npm run smoke:server
THREEFOLD_PUBLIC=1 THREEFOLD_PORT=2620 THREEFOLD_ORIGINS=http://127.0.0.1:2620 \
  THREEFOLD_SAVE=.local/playtest-world.json \
  THREEFOLD_PLAYTEST_KEYS=you:<a-real-key> npm start
```

Open `http://127.0.0.1:2620` and paste the key. To try it in the container instead:

```sh
docker build -t threefold .
docker run -p 2620:8080 -v threefold-data:/data \
  -e THREEFOLD_ORIGINS=http://<this-machine's-LAN-IP>:2620 \
  -e THREEFOLD_PLAYTEST_KEYS=you:<a-real-key> threefold
```

Open `http://<LAN-IP>:2620` on two machines on the same network. `docker stop` should exit with code 0 and leave `/data/world.json`. A new container on the same volume should restore your character.

## What this does not provide

- logins or a database (these come with accounts later);
- chat (#21) or moderation tools;
- access for strangers.

Testers should read [the playtest privacy note](playtest-privacy.md).
