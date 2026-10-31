/** Palette par défaut (spec §5) : Okabe-Ito sans le noir, et choix du texte. */

export interface CouleurPalette {
  readonly nom: string;
  readonly hex: string;
  /** Texte lisible sur cette couleur (colonne « Texte » du §5). */
  readonly texte: string;
}

export const NOIR = "#111111";
export const BLANC = "#FFFFFF";
/** Trait sombre entre les secteurs ; contraste d'au moins 3,4:1 sur chaque couleur. */
export const SEPARATEUR = "#14162B";
/** ΔE2000 minimal, pire cas des quatre visions, entre deux secteurs voisins. Valeur mesurée du cycle : 17,96, soit 18,0 à la décimale de la spec §5. */
export const SEUIL_DELTA_E = 17.95;

export const PALETTE: readonly CouleurPalette[] = [
  { nom: "orange", hex: "#E69F00", texte: NOIR },
  { nom: "ciel", hex: "#56B4E9", texte: NOIR },
  { nom: "jaune", hex: "#F0E442", texte: NOIR },
  { nom: "rose", hex: "#CC79A7", texte: NOIR },
  { nom: "vert", hex: "#009E73", texte: NOIR },
  { nom: "vermillon", hex: "#D55E00", texte: NOIR },
  { nom: "bleu", hex: "#0072B2", texte: BLANC },
];

/**
 * Paires de couleurs (indices dans PALETTE) dont le ΔE2000 CVD au pire cas est
 * au moins SEUIL_DELTA_E. Dérivé de la mesure `scripts/mesure-palette.py`
 * (fixture `palette-matrice.json`, vérifiée par les tests).
 */
export const VOISINES_ADMISES: readonly (readonly number[])[] = [
  [1, 6], // orange
  [0, 2, 5, 6], // ciel
  [1, 3, 4, 5, 6], // jaune
  [2, 4], // rose
  [2, 3, 5], // vert
  [1, 2, 4, 6], // vermillon
  [0, 1, 2, 5], // bleu
];

/** Cycle du tableau, répété. Chaque paire voisine mesure au moins 17,96 (rose-vert, le minimum). */
const MOTIF: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

function admise(a: number, b: number): boolean {
  return a !== b && (VOISINES_ADMISES[a]?.includes(b) ?? false);
}

/** Complète `seq` par `restant` couleurs de sorte que la dernière touche `seq[0]`. */
function completer(seq: number[], restant: number): boolean {
  const dernier = seq[seq.length - 1] as number;
  if (restant === 0) return admise(dernier, seq[0] as number);
  const suivant = (dernier + 1) % MOTIF.length;
  const candidats = [...(VOISINES_ADMISES[dernier] ?? [])].sort((x, y) => +(y === suivant) - +(x === suivant));
  for (const c of candidats) {
    seq.push(c);
    if (completer(seq, restant - 1)) return true;
    seq.pop();
  }
  return false;
}

/**
 * Indices de palette de n secteurs consécutifs. Le motif est suivi le plus
 * longtemps possible ; seule la fin (quelques secteurs) est ajustée pour que
 * le dernier et le premier respectent aussi le seuil. O(n).
 */
export function indicesParDefaut(n: number): number[] {
  if (!Number.isInteger(n) || n <= 0) return [];
  if (n === 1) return [0];
  const base: number[] = [];
  for (let i = 0; i < n; i++) base.push(MOTIF[i % MOTIF.length] as number);
  for (let queue = 0; queue <= Math.min(n - 1, 12); queue++) {
    const seq = base.slice(0, n - queue);
    if (completer(seq, queue)) return seq;
  }
  throw new Error(`Aucune attribution de couleurs possible pour ${n} secteurs`);
}

/** Couleurs `#RRGGBB` par défaut de n secteurs, voisins (bouclage compris) distincts au sens CVD. */
export function couleursParDefaut(n: number): string[] {
  return indicesParDefaut(n).map((i) => (PALETTE[i] as CouleurPalette).hex);
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Couleur invalide : ${hex}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => {
    const c = parseInt(h as string, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG entre deux couleurs `#RRGGBB`. */
export function contraste(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Noir `#111111` ou blanc, selon le meilleur contraste ; jamais de refus. */
export function couleurTexte(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return NOIR;
  return contraste(hex, NOIR) >= contraste(hex, BLANC) ? NOIR : BLANC;
}
