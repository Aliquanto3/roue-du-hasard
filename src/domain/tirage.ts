/**
 * Tirage (F5, F6).
 *
 * Convention d'angle : angles en degrés, pointeur fixe en HAUT, secteur 0 commençant à
 * l'angle 0 (le haut) et les secteurs suivants en sens horaire. `angleArret` renvoie l'angle,
 * mesuré dans le repère de la roue, du point qui doit se trouver sous le pointeur à l'arrêt :
 * la rotation finale à appliquer à la roue (horaire) est donc `rotationFinale(angle)`.
 *
 * Deux repères à ne pas confondre : `indexSousPointeur` prend un angle de la roue, et
 * `indexApresRotation` la rotation appliquée à la roue (celle de `rotationFinale`, tours compris).
 */

/** Source d'entiers uniformes sur [0, 2^32). */
export type Source = () => number;

const DEUX_32 = 2 ** 32;

/** Marge, en fraction de la largeur du secteur, entre l'angle d'arrêt et chaque frontière. */
export const MARGE_SECTEUR = 0.1;

export const sourceCrypto: Source = () => {
  const tampon = new Uint32Array(1);
  globalThis.crypto.getRandomValues(tampon);
  return tampon[0] as number;
};

/** Entier uniforme dans [0, n) par rejet d'échantillonnage (aucun biais de modulo). */
export function tirerIndex(n: number, source: Source = sourceCrypto): number {
  if (!Number.isInteger(n) || n < 1 || n > DEUX_32) {
    throw new RangeError(`n doit être un entier entre 1 et 2^32 (reçu ${String(n)})`);
  }
  // Plus grand multiple de n tenant dans 2^32 : les valeurs au-delà sont rejetées.
  const limite = DEUX_32 - (DEUX_32 % n);
  for (;;) {
    const v = source();
    if (v < limite) return v % n;
  }
}

/** Angle d'arrêt dans le secteur `index` (sur `n`), à une position aléatoire à ≥ MARGE_SECTEUR des bords. */
export function angleArret(index: number, n: number, source: Source = sourceCrypto): number {
  if (!Number.isInteger(n) || n < 1 || !Number.isInteger(index) || index < 0 || index >= n) {
    throw new RangeError("index ou n invalide");
  }
  const largeur = 360 / n;
  const fraction = MARGE_SECTEUR + (1 - 2 * MARGE_SECTEUR) * (source() / DEUX_32);
  return (index + fraction) * largeur;
}

/** Réciproque : secteur situé sous le pointeur pour un angle de la roue (modulo 360). */
export function indexSousPointeur(angle: number, n: number): number {
  const a = ((angle % 360) + 360) % 360;
  return Math.min(n - 1, Math.floor(a / (360 / n)));
}

/** Secteur sous le pointeur quand la roue a tourné de `rotation` degrés en sens horaire. */
export function indexApresRotation(rotation: number, n: number): number {
  return indexSousPointeur(-rotation, n);
}

/** Rotation horaire de la roue amenant `angle` sous le pointeur. */
export function rotationFinale(angle: number): number {
  return (360 - (((angle % 360) + 360) % 360)) % 360;
}
