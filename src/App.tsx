import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { WORDS } from './data/words';
import { buildGame, toCyrillic, type Game, type Role, type Team } from './lib';

type Script = 'lat' | 'cyr';
type View = 'home' | 'spy' | 'board';
type Outcome = 'red-win' | 'blue-win' | 'assassin' | null;

const randomSeed = () => Math.floor(Math.random() * 0xffffffff);
const teamName = (t: Team) => (t === 'red' ? 'CRVENI' : 'PLAVI');

/* ---------------- URL <-> game (the seed is the room code) ---------------- */

function parseHash(hash: string): { view: View; seed: string | null } {
  const h = hash.replace(/^#/, ''); // e.g. "/spy?seed=abc"
  const [path, query] = h.split('?');
  const seed = new URLSearchParams(query || '').get('seed');
  const view: View = path.startsWith('/spy') ? 'spy' : path.startsWith('/board') ? 'board' : 'home';
  return { view, seed: seed && seed.length ? seed : null };
}

function gameHash(view: Exclude<View, 'home'>, seed: string): string {
  return `#/${view}?${new URLSearchParams({ seed }).toString()}`;
}

function nav(view: View, seed?: string) {
  window.location.hash = view === 'home' || !seed ? '#/' : gameHash(view, seed);
}

/** Absolute URL that opens the spymaster view for a given seed on any device. */
function spyLink(seed: string): string {
  return window.location.origin + window.location.pathname + gameHash('spy', seed);
}

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return useMemo(() => parseHash(hash), [hash]);
}

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lock: any = null;
    const request = async () => {
      try {
        lock = await (navigator as any).wakeLock?.request('screen');
      } catch {
        /* unsupported / denied — fail silently */
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') request();
    };
    request();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      try {
        lock?.release?.();
      } catch {
        /* ignore */
      }
    };
  }, [active]);
}

/* ---------------- App ---------------- */

export default function App() {
  const { view, seed } = useHash();
  const [script, setScript] = useState<Script>('lat');

  // The board is fully derived from the seed in the URL — so a scanned link
  // reproduces the exact same board on a phone, with no backend.
  const game = useMemo<Game | null>(() => (seed ? buildGame(seed) : null), [seed]);

  // Reveals are per-device (Option A: phones view the static map). Reset on new seed.
  const [revealed, setRevealed] = useState<boolean[]>(() => Array(25).fill(false));
  useEffect(() => {
    setRevealed(Array(25).fill(false));
  }, [seed]);

  useWakeLock(game !== null && view !== 'home');

  if (WORDS.length < 25) return <ErrorScreen count={WORDS.length} />;

  const disp = (w: string) => (script === 'cyr' ? toCyrillic(w) : w);

  if (view === 'home' || !game) {
    return <Home script={script} setScript={setScript} onStart={(s) => nav('spy', s)} />;
  }

  if (view === 'spy') {
    return <SpyView game={game} disp={disp} script={script} setScript={setScript} />;
  }

  return (
    <BoardView
      game={game}
      revealed={revealed}
      setRevealed={setRevealed}
      disp={disp}
      onNew={() => nav('home')}
    />
  );
}

/* ---------------- Home ---------------- */

function Home({
  script,
  setScript,
  onStart,
}: {
  script: Script;
  setScript: (s: Script) => void;
  onStart: (seed: string) => void;
}) {
  const [seed, setSeed] = useState('');
  const start = () => onStart(seed.trim() === '' ? String(randomSeed()) : seed.trim());
  return (
    <div className="home">
      <div className="title">
        <h1>
          <span className="tred">KODNA</span> <span className="tblue">IMENA</span>
        </h1>
        <p className="sub">Srpska verzija igre Codenames · {WORDS.length} reči</p>
      </div>

      <ScriptToggle script={script} setScript={setScript} big />

      <div className="field">
        <label>Kod sobe / seed (opciono)</label>
        <input
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') start();
          }}
          placeholder="npr. petak-veče ili 12345"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="hint">Isti kod uvek daje istu tablu. Ostavi prazno za nasumičnu.</span>
      </div>

      <button className="btn btn-primary big" onClick={start}>
        Nova igra →
      </button>
    </div>
  );
}

/* ---------------- Spymaster view ---------------- */

function SpyView({
  game,
  disp,
  script,
  setScript,
}: {
  game: Game;
  disp: (w: string) => string;
  script: Script;
  setScript: (s: Script) => void;
}) {
  const [showShare, setShowShare] = useState(false);
  const other: Team = game.startingTeam === 'red' ? 'blue' : 'red';
  return (
    <div className="app">
      <header className="topbar">
        <div className="startinfo">
          <span className={`pill ${game.startingTeam}`}>{teamName(game.startingTeam)} POČINJU</span>
          <span className="split">
            <b className={game.startingTeam}>9</b>
            <span className="dash">:</span>
            <b className={other}>8</b>
          </span>
        </div>
        <div className="spacer" />
        <ScriptToggle script={script} setScript={setScript} />
        <button className="btn" onClick={() => setShowShare(true)}>
          ⧉ Podeli
        </button>
        <button className="btn btn-primary" onClick={() => nav('board', game.seedLabel)}>
          Kreni →
        </button>
      </header>

      <div className="board-area">
        <div className="board">
          {game.cards.map((c, i) => (
            <div key={i} className={`spycard role-${c.role}`}>
              {c.role === 'assassin' && <span className="skull">☠</span>}
              <span className="word">{disp(c.word)}</span>
            </div>
          ))}
        </div>
      </div>

      {showShare && <ShareOverlay seed={game.seedLabel} onClose={() => setShowShare(false)} />}
    </div>
  );
}

function ShareOverlay({ seed, onClose }: { seed: string; onClose: () => void }) {
  const link = spyLink(seed);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can still scan the QR */
    }
  };
  return (
    <div className="share-backdrop" onClick={onClose}>
      <div className="share-card" onClick={(e) => e.stopPropagation()}>
        <h2>Špijuni skeniraju kod</h2>
        <div className="qr-wrap">
          <QRCodeSVG value={link} size={232} level="M" marginSize={1} />
        </div>
        <div className="roomcode">
          <small>Kod sobe</small>
          {seed}
        </div>
        <p className="share-note">
          Otvara istu mapu na svakom telefonu. Isti kod = ista tabla.
        </p>
        <div className="share-actions">
          <button className="btn btn-dark" onClick={copy}>
            {copied ? '✓ Kopirano' : 'Kopiraj link'}
          </button>
          <button className="btn" onClick={onClose}>
            Zatvori
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Board view ---------------- */

function BoardView({
  game,
  revealed,
  setRevealed,
  disp,
  onNew,
}: {
  game: Game;
  revealed: boolean[];
  setRevealed: React.Dispatch<React.SetStateAction<boolean[]>>;
  disp: (w: string) => string;
  onNew: () => void;
}) {
  const totals = useMemo(
    () => ({
      red: game.cards.filter((c) => c.role === 'red').length,
      blue: game.cards.filter((c) => c.role === 'blue').length,
    }),
    [game],
  );

  const revealedCount = useMemo(() => {
    let red = 0;
    let blue = 0;
    game.cards.forEach((c, i) => {
      if (revealed[i]) {
        if (c.role === 'red') red++;
        if (c.role === 'blue') blue++;
      }
    });
    return { red, blue };
  }, [game, revealed]);

  const redRem = totals.red - revealedCount.red;
  const blueRem = totals.blue - revealedCount.blue;

  const assassinRevealed = game.cards.some((c, i) => c.role === 'assassin' && revealed[i]);
  const outcome: Outcome = assassinRevealed
    ? 'assassin'
    : redRem <= 0
      ? 'red-win'
      : blueRem <= 0
        ? 'blue-win'
        : null;

  const reveal = (i: number) => {
    if (revealed[i] || outcome) return;
    setRevealed((prev) => {
      const next = [...prev];
      next[i] = true;
      return next;
    });
  };

  return (
    <div className="app">
      <header className="topbar">
        <span className="pill red">CRVENI {Math.max(0, redRem)}</span>
        <span className="pill blue">PLAVI {Math.max(0, blueRem)}</span>
        <div className="spacer" />
        <button className="btn" onClick={() => nav('spy', game.seedLabel)}>
          Prikaži mapu
        </button>
        <button className="btn" onClick={onNew}>
          Nova igra
        </button>
      </header>

      <div className="board-area">
        <div className="board">
          {game.cards.map((c, i) => (
            <BoardCard
              key={i}
              role={c.role}
              word={disp(c.word)}
              revealed={revealed[i]}
              onReveal={() => reveal(i)}
            />
          ))}
        </div>
      </div>

      {outcome && <Overlay outcome={outcome} onNew={onNew} />}
    </div>
  );
}

function BoardCard({
  role,
  word,
  revealed,
  onReveal,
}: {
  role: Role;
  word: string;
  revealed: boolean;
  onReveal: () => void;
}) {
  return (
    <button
      className={`card role-${role} ${revealed ? 'is-revealed' : ''}`}
      onClick={onReveal}
      disabled={revealed}
      aria-label={word}
    >
      <div className="card-inner">
        <div className="face face-front">
          <span className="word">{word}</span>
        </div>
        <div className="face face-back">
          {role === 'assassin' && <span className="skull">☠</span>}
          <span className="word">{word}</span>
        </div>
      </div>
    </button>
  );
}

/* ---------------- Overlay ---------------- */

function Overlay({ outcome, onNew }: { outcome: Exclude<Outcome, null>; onNew: () => void }) {
  const cfg = {
    'red-win': { cls: 'win-red', title: 'CRVENI POBEĐUJU', sub: 'Svi crveni agenti su otkriveni.' },
    'blue-win': { cls: 'win-blue', title: 'PLAVI POBEĐUJU', sub: 'Svi plavi agenti su otkriveni.' },
    assassin: {
      cls: 'assassin',
      title: '☠ UBICA',
      sub: 'Kraj igre — tim koji je otkrio ubicu je izgubio.',
    },
  }[outcome];

  return (
    <div className={`overlay ${cfg.cls}`}>
      <h1>{cfg.title}</h1>
      <p className="osub">{cfg.sub}</p>
      <button className="btn btn-primary big" onClick={onNew}>
        Nova igra
      </button>
    </div>
  );
}

/* ---------------- Shared bits ---------------- */

function ScriptToggle({
  script,
  setScript,
  big,
}: {
  script: Script;
  setScript: (s: Script) => void;
  big?: boolean;
}) {
  return (
    <div className={`seg ${big ? 'seg-big' : ''}`}>
      <button className={script === 'lat' ? 'active' : ''} onClick={() => setScript('lat')}>
        Latinica
      </button>
      <button className={script === 'cyr' ? 'active' : ''} onClick={() => setScript('cyr')}>
        Ћирилица
      </button>
    </div>
  );
}

function ErrorScreen({ count }: { count: number }) {
  return (
    <div className="home">
      <div className="title">
        <h1 className="err">⚠ Nedovoljno reči</h1>
        <p className="sub">
          Za igru je potrebno najmanje 25 reči, a lista trenutno ima {count}.
          <br />
          Dodajte reči u <code>src/data/words.ts</code>.
        </p>
      </div>
    </div>
  );
}
