import { WORDS } from './data/words';

export type Team = 'red' | 'blue';
export type Role = Team | 'neutral' | 'assassin';

export interface Card {
  word: string;
  role: Role;
}

export interface Game {
  seedLabel: string;
  seed: number;
  startingTeam: Team;
  cards: Card[];
}

/* ---------- Seeded PRNG (mulberry32) ---------- */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turn any seed string into a uint32. Pure digits are used as-is. */
export function seedToNumber(label: string): number {
  if (/^\d+$/.test(label)) return Number(label) >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- Board generation ---------- */

export function buildGame(label: string): Game {
  const seed = seedToNumber(label);
  const rng = mulberry32(seed);

  const words = shuffle(WORDS, rng).slice(0, 25);
  const startingTeam: Team = rng() < 0.5 ? 'red' : 'blue';
  const other: Team = startingTeam === 'red' ? 'blue' : 'red';

  const roles: Role[] = [
    ...Array<Role>(9).fill(startingTeam),
    ...Array<Role>(8).fill(other),
    ...Array<Role>(7).fill('neutral'),
    'assassin',
  ];
  const shuffledRoles = shuffle(roles, rng);

  const cards: Card[] = words.map((word, i) => ({ word, role: shuffledRoles[i] }));
  return { seedLabel: label, seed, startingTeam, cards };
}

/* ---------- Latin -> Cyrillic transliteration ---------- */

const DIGRAPHS: Record<string, string> = {
  LJ: 'Љ',
  NJ: 'Њ',
  'DŽ': 'Џ',
  DJ: 'Ђ',
};

const SINGLE: Record<string, string> = {
  A: 'А', B: 'Б', V: 'В', G: 'Г', D: 'Д', 'Đ': 'Ђ', E: 'Е', 'Ž': 'Ж', Z: 'З',
  I: 'И', J: 'Ј', K: 'К', L: 'Л', M: 'М', N: 'Н', O: 'О', P: 'П', R: 'Р',
  S: 'С', T: 'Т', 'Ć': 'Ћ', U: 'У', F: 'Ф', H: 'Х', C: 'Ц', 'Č': 'Ч', 'Š': 'Ш',
};

/**
 * Transliterate a (Latin) Serbian word to Cyrillic. Digraphs LJ NJ DŽ (and DJ)
 * are matched before single letters. Output is uppercase Cyrillic.
 */
export function toCyrillic(input: string): string {
  const s = input.toUpperCase();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const pair = s.slice(i, i + 2);
    if (DIGRAPHS[pair]) {
      out += DIGRAPHS[pair];
      i++;
      continue;
    }
    const ch = s[i];
    out += SINGLE[ch] ?? ch;
  }
  return out;
}
