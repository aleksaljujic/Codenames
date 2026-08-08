import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { WORDS } from './data/words';
import { buildGame, spyCode, toCyrillic, type Game, type Role, type Team } from './lib';

type Script = 'lat' | 'cyr';
type View = 'home' | 'room' | 'spy' | 'board';
type Outcome = 'red-win' | 'blue-win' | 'assassin' | null;

const randomSeed = () => Math.floor(Math.random() * 0xffffffff);
const teamName = (t: Team) => (t === 'red' ? 'CRVENI' : 'PLAVI');

/* ---------------- URL <-> game (the seed is the room, driven by the URL) ---------------- */

function parseHash(hash: string): { view: View; seed: string | null } {
  const h = hash.replace(/^#/, ''); // e.g. "/board?seed=abc"
  const [path, query] = h.split('?');
  const seed = new URLSearchParams(query || '').get('seed');
  const view: View = path.startsWith('/spy')
    ? 'spy'
    : path.startsWith('/board')
      ? 'board'
      : path.startsWith('/room')
        ? 'room'
        : 'home';
  return { view, seed: seed && seed.length ? seed : null };
}

function gameHash(view: Exclude<View, 'home'>, seed: string): string {
  return `#/${view}?${new URLSearchParams({ seed }).toString()}`;
}

function nav(view: View, seed?: string) {
  window.location.hash = view === 'home' || !seed ? '#/' : gameHash(view, seed);
}

/** Absolute link that opens the players' board for a given seed on any device. */
function boardLink(seed: string): string {
  return window.location.origin + window.location.pathname + gameHash('board', seed);
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

  // Board is fully derived from the seed in the URL — a scanned link reproduces
  // the identical board on any device, with no backend.
  const game = useMemo<Game | null>(() => (seed ? buildGame(seed) : null), [seed]);

  // Reveals are per-device (this device holds the live game). Reset on new seed.
  const [revealed, setRevealed] = useState<boolean[]>(() => Array(25).fill(false));
  useEffect(() => {
    setRevealed(Array(25).fill(false));
  }, [seed]);

  // Which seed's spymaster map this device has unlocked (persists across refresh).
  const [unlocked, setUnlocked] = useState<string | null>(() =>
    sessionStorage.getItem('unlockedSeed'),
  );
  const unlock = (s: string) => {
    sessionStorage.setItem('unlockedSeed', s);
    setUnlocked(s);
  };

  useWakeLock(game !== null && view !== 'home');

  if (WORDS.length < 25) return <ErrorScreen count={WORDS.length} />;

  const disp = (w: string) => (script === 'cyr' ? toCyrillic(w) : w);

  let content: React.ReactNode;
  if (view === 'home' || !game || !seed) {
    content = <Home script={script} setScript={setScript} onStart={(s) => nav('room', s)} />;
  } else if (view === 'room') {
    content = <Room game={game} onUnlockSpy={() => unlock(seed)} />;
  } else if (view === 'spy') {
    content =
      unlocked === seed ? (
        <SpyMap game={game} disp={disp} />
      ) : (
        <CodeGate seed={seed} onUnlock={() => unlock(seed)} />
      );
  } else {
    content = (
      <BoardView
        game={game}
        revealed={revealed}
        setRevealed={setRevealed}
        disp={disp}
        onNew={() => nav('home')}
      />
    );
  }

  return (
    <>
      {view !== 'home' && seed && (
        <Menu
          seed={seed}
          current={view}
          spymaster={unlocked === seed}
          script={script}
          setScript={setScript}
        />
      )}
      {content}
    </>
  );
}

/* ---------------- Side menu (drawer) ---------------- */

function Menu({
  seed,
  current,
  spymaster,
  script,
  setScript,
}: {
  seed: string;
  current: View;
  spymaster: boolean;
  script: Script;
  setScript: (s: Script) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const go = (v: View) => {
    setOpen(false);
    nav(v, seed);
  };
  return (
    <>
      <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Meni">
        ☰
      </button>

      {open && (
        <div className="drawer-backdrop" onClick={() => setOpen(false)}>
          <nav className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <span className="drawer-title">KODNA IMENA</span>
              <button className="drawer-x" onClick={() => setOpen(false)} aria-label="Zatvori">
                ✕
              </button>
            </div>

            <button
              className={`drawer-item ${current === 'board' ? 'active' : ''}`}
              onClick={() => go('board')}
            >
              🁢 Tabla
            </button>
            <button
              className={`drawer-item ${current === 'spy' ? 'active' : ''}`}
              onClick={() => go('spy')}
            >
              {spymaster ? '🗺 Špijunska mapa' : '🔒 Špijunska mapa'}
            </button>
            <button
              className="drawer-item"
              onClick={() => {
                setOpen(false);
                setShowQr(true);
              }}
            >
              ⧉ Podeli tablu (QR)
            </button>
            {spymaster && (
              <button
                className={`drawer-item ${current === 'room' ? 'active' : ''}`}
                onClick={() => go('room')}
              >
                # Špijunski kod / soba
              </button>
            )}

            <div className="drawer-sep" />
            <div className="drawer-label">Pismo</div>
            <ScriptToggle script={script} setScript={setScript} />

            <div className="drawer-sep" />
            <button className="drawer-item danger" onClick={() => go('home')}>
              ↻ Nova igra
            </button>
          </nav>
        </div>
      )}

      {showQr && <BoardQrOverlay seed={seed} onClose={() => setShowQr(false)} />}
    </>
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
        Napravi sobu →
      </button>
    </div>
  );
}

/* ---------------- Room (share hub — shows the QR + spymaster code) ---------------- */

function Room({ game, onUnlockSpy }: { game: Game; onUnlockSpy: () => void }) {
  const seed = game.seedLabel;
  const link = boardLink(seed);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — QR still works */
    }
  };
  return (
    <div className="home room">
      <div className="title">
        <h1 className="roomtitle">Soba spremna</h1>
        <p className="sub">Igrači skeniraju QR da otvore tablu.</p>
      </div>

      <div className="qr-wrap">
        <QRCodeSVG value={link} size={216} level="M" marginSize={1} />
      </div>

      <div className="codebox">
        <small>Špijunski kod</small>
        <div className="bigcode">{spyCode(seed)}</div>
        <span className="hint">Reci ga samo špijunima — njime otključavaju obojenu mapu.</span>
      </div>

      <div className="share-actions">
        <button className="btn btn-primary big" onClick={() => nav('board', seed)}>
          Otvori tablu
        </button>
        <button
          className="btn big"
          onClick={() => {
            onUnlockSpy();
            nav('spy', seed);
          }}
        >
          Špijunska mapa
        </button>
        <button className="btn big" onClick={copy}>
          {copied ? '✓ Kopirano' : 'Kopiraj link'}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Spymaster code gate ---------------- */

function CodeGate({ seed, onUnlock }: { seed: string; onUnlock: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const submit = () => {
    if (code === spyCode(seed)) onUnlock();
    else setError(true);
  };
  return (
    <div className="home">
      <div className="title">
        <h1 className="roomtitle">🔒 Špijunski prikaz</h1>
        <p className="sub">Unesi špijunski kod da vidiš obojenu mapu.</p>
      </div>

      <div className="field">
        <input
          className="codeinput"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 4));
            setError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          inputMode="numeric"
          autoComplete="off"
          placeholder="••••"
          autoFocus
        />
        {error && <span className="gate-err">Pogrešan kod, probaj ponovo.</span>}
      </div>

      <div className="share-actions">
        <button className="btn btn-primary big" onClick={submit}>
          Otključaj
        </button>
        <button className="btn big" onClick={() => nav('board', seed)}>
          Na tablu
        </button>
      </div>
    </div>
  );
}

/* ---------------- Spymaster map ---------------- */

function SpyMap({ game, disp }: { game: Game; disp: (w: string) => string }) {
  const [rotated, setRotated] = useState(false);
  const other: Team = game.startingTeam === 'red' ? 'blue' : 'red';
  return (
    <div className={`app ${rotated ? 'rot180' : ''}`}>
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
        <button
          className={`btn ${rotated ? 'btn-primary' : ''}`}
          onClick={() => setRotated((r) => !r)}
        >
          ⟳ Okreni 180°
        </button>
      </header>

      <div className="board-area">
        <div className="board">
          {game.cards.map((c, i) => (
            <div key={i} className={`spycard role-${c.role}`}>
              {c.role === 'assassin' && <span className="skull">☠</span>}
              <CardWord text={disp(c.word)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Board view (players) ---------------- */

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

/** Board QR only — no spymaster code, safe to show to players. */
function BoardQrOverlay({ seed, onClose }: { seed: string; onClose: () => void }) {
  const link = boardLink(seed);
  return (
    <div className="share-backdrop" onClick={onClose}>
      <div className="share-card" onClick={(e) => e.stopPropagation()}>
        <h2>Skeniraj da otvoriš tablu</h2>
        <div className="qr-wrap">
          <QRCodeSVG value={link} size={216} level="M" marginSize={1} />
        </div>
        <p className="share-note">
          Otvara istu tablu na svakom telefonu. Špijunski kod je zaseban.
        </p>
        <button className="btn btn-dark" onClick={onClose}>
          Zatvori
        </button>
      </div>
    </div>
  );
}

/** Two copies of the word facing opposite sides of the table, like real
 *  Codenames cards. One side is primary (big, centered), the other secondary
 *  (small, faded, at the top). The spymaster "Okreni 180°" swaps which side is
 *  primary — so the big readable word turns to face the other seat. */
function CardWord({ text }: { text: string }) {
  return (
    <span className="card-text">
      <span className="wlayer up">
        <span className="wtext">{text}</span>
      </span>
      <span className="wlayer down">
        <span className="wtext">{text}</span>
      </span>
    </span>
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
          <CardWord text={word} />
        </div>
        <div className="face face-back">
          {role === 'assassin' && <span className="skull">☠</span>}
          <CardWord text={word} />
        </div>
      </div>
    </button>
  );
}

/* ---------------- Game-over overlay ---------------- */

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
