/** Calculs purs de la roue : tailles, corps des libellés, séparateurs, troncature. */

/** Sous ce corps, en px CSS, les libellés ne sont plus dessinés (F10). */
export const CORPS_MIN = 11;
/** Plafond de la taille du canvas, en pixels physiques : assez pour une roue plein écran en 3840 px. */
export const TAILLE_MAX_PX = 2400;

const ELLIPSE = '…';
/** Part de la largeur du secteur que le texte peut occuper. */
const REMPLISSAGE = 0.85;
/** Rayon de référence du corps, en fraction du rayon : le texte est ancré vers l'extérieur. */
const RAYON_REFERENCE = 0.75;
const RAYON_MOYEU = 0.08;
const CONTOUR_POINTEUR = 1.5;

export interface Geometrie {
  /** Côté du canvas, en px CSS. */
  taille: number;
  centre: number;
  rayon: number;
  /** Ordonnée de la pointe, en px CSS. */
  pointeY: number;
  demiBasePointeur: number;
  contourPointeur: number;
  /** Ordonnée d'un point de la roue juste sous la pointe, jamais couvert par un libellé. */
  sondeY: number;
  /** Rayon extérieur où s'arrêtent les libellés. */
  rayonLibelle: number;
  rayonMoyeu: number;
}

export function geometrie(taille: number): Geometrie {
  const marge = Math.max(12, taille * 0.04);
  const rayon = Math.max(1, taille / 2 - marge);
  const pointeY = marge + Math.max(6, taille * 0.015);
  const sondeY = pointeY + CONTOUR_POINTEUR + 2;
  return {
    taille,
    centre: taille / 2,
    rayon,
    pointeY,
    demiBasePointeur: Math.max(8, taille * 0.025),
    contourPointeur: CONTOUR_POINTEUR,
    sondeY,
    rayonLibelle: Math.max(0, taille / 2 - sondeY - 4),
    rayonMoyeu: rayon * RAYON_MOYEU,
  };
}

/** Côté du canvas en pixels physiques : net selon le DPR, plafonné, jamais nul. */
export function taillePixels(tailleCss: number, dpr: number): number {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.max(1, Math.min(TAILLE_MAX_PX, Math.round(tailleCss * ratio)));
}

function demiAngle(n: number): number {
  return Math.min(Math.PI / n, Math.PI / 2);
}

/** Corps des libellés en px CSS, d'après la largeur du secteur au rayon de référence. */
export function corpsLibelle(rayon: number, n: number): number {
  if (n < 1) return 0;
  const place = REMPLISSAGE * 2 * rayon * RAYON_REFERENCE * Math.sin(demiAngle(n));
  return Math.min(Math.max(14, rayon * 0.1), place);
}

/** F10 : les libellés restent-ils lisibles ? */
export function libellesLisibles(rayon: number, n: number): boolean {
  return corpsLibelle(rayon, n) >= CORPS_MIN;
}

/** Rayon intérieur où le secteur est juste assez large pour un texte de ce corps. */
export function rayonInterieurLibelle(corps: number, rayon: number, n: number): number {
  return Math.max(rayon * 0.12, corps / (REMPLISSAGE * 2 * Math.sin(demiAngle(n))));
}

export interface Separateurs {
  /** Épaisseur en px CSS ; 0 si le trait est omis. */
  epaisseur: number;
  /** Rayon à partir duquel tracer le trait, pour ne pas noircir le centre. */
  rayonDebut: number;
}

/** Sous cette largeur de secteur au bord, en px CSS, le trait masquerait les couleurs. */
export const ARC_MIN_SEPARATEUR = 5;

/**
 * Épaisseur adaptée : au plus 15 % du secteur au bord, donc moins que la marge d'arrêt de chaque
 * côté (10 %, MARGE_SECTEUR) ; omis sur les secteurs trop fins, où les voisines restent distinctes.
 */
export function separateurs(rayon: number, n: number): Separateurs {
  if (n < 2) return { epaisseur: 0, rayonDebut: 0 };
  const arc = (2 * Math.PI * rayon) / n;
  if (arc < ARC_MIN_SEPARATEUR) return { epaisseur: 0, rayonDebut: 0 };
  const epaisseur = Math.min(arc * 0.15, Math.max(1.5, rayon * 0.006));
  // Le trait démarre là où le secteur vaut au moins quatre fois son épaisseur.
  const rayonDebut = Math.min(rayon, (4 * epaisseur * n) / (2 * Math.PI));
  return { epaisseur, rayonDebut: Math.max(rayonDebut, rayon * RAYON_MOYEU) };
}

/** Découpe en graphèmes ; repli par points de code, qui ne coupe pas non plus de surrogates. */
export function graphemes(
  texte: string,
  Segmenteur: typeof Intl.Segmenter | null = Intl.Segmenter ?? null,
): string[] {
  if (!Segmenteur) return Array.from(texte);
  return Array.from(new Segmenteur(undefined, { granularity: 'grapheme' }).segment(texte), (s) => s.segment);
}

/** Plus long préfixe de `nom` tenant dans `largeur` avec « … », sans couper de graphème. */
export function tronquer(nom: string, largeur: number, mesure: (texte: string) => number): string {
  if (mesure(nom) <= largeur) return nom;
  if (mesure(ELLIPSE) > largeur) return '';
  const morceaux = graphemes(nom);
  let bas = 0;
  let haut = morceaux.length - 1;
  while (bas < haut) {
    const milieu = Math.ceil((bas + haut) / 2);
    if (mesure(morceaux.slice(0, milieu).join('').trimEnd() + ELLIPSE) <= largeur) bas = milieu;
    else haut = milieu - 1;
  }
  return morceaux.slice(0, bas).join('').trimEnd() + ELLIPSE;
}

/** Le point (en px CSS du canvas) est-il sur le disque de la roue ? */
export function estSurRoue(x: number, y: number, g: Geometrie): boolean {
  return Math.hypot(x - g.centre, y - g.centre) <= g.rayon;
}
