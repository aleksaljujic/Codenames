# Kodna Imena

Install with `npm install`, then run with `npm run dev` and open the printed URL.
Paste your Serbian words (Latin, UPPERCASE) into `src/data/words.ts`.

## Deploy to Vercel

The whole board is derived from the seed, which lives in the URL — so no backend
or database is needed. Deploy the static site and share by QR code:

1. Push this folder to a Git repo (GitHub/GitLab).
2. On vercel.com → New Project → import the repo. Vercel auto-detects Vite
   (build: `npm run build`, output: `dist`). No config needed — hash routing
   means every path serves `index.html`.
3. **Napravi sobu** on the laptop. The room screen shows a **QR** (players scan
   it to open the board) and a **4-digit spymaster code**.
4. Players scan the QR → they get the plain word board. Spymasters open the same
   app, tap **🔒 Špijun**, and enter the code → they get the colored map.
   The code is shown only on the room screen, so players never see it.

Notes:
- The **seed is the room** — same seed always produces the same table.
- The spymaster code blocks *accidental* access to the colored map. It is not a
  hard secret: the board device holds the roles, so a determined person could
  still recover the key. True enforcement would require a server.
