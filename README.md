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
3. Start a game on the laptop, open the spymaster view, tap **Podeli**, and let
   each spymaster scan the QR. Their phone opens the identical board.
   The **seed is the room code** — same code always produces the same table.

Note: hosting makes the key shareable via link — fine for a party game, but the
board is no longer confined to the laptop.
