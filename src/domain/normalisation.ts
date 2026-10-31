/** Normalisation des saisies (F1, F3, F11). */

export const LONGUEUR_MAX_NOM = 60;

const SEPARATEURS = /[\r\n,;]+/;

/** Tronque à `max` points de code (une paire de surrogates compte pour 1 et n'est jamais coupée). */
export function tronquer(texte: string, max: number = LONGUEUR_MAX_NOM): string {
  let compte = 0;
  let fin = 0;
  for (const point of texte) {
    if (compte === max) break;
    compte += 1;
    fin += point.length;
  }
  return texte.slice(0, fin);
}

/** Longueur en points de code. */
export function longueur(texte: string): number {
  return Array.from(texte).length;
}

/** Un nom saisi seul : trim puis troncature ; `null` s'il est vide. */
export function normaliserNom(brut: string): string | null {
  // La troncature peut laisser un espace final : second trim.
  const nom = tronquer(brut.trim()).trimEnd();
  return nom === "" ? null : nom;
}

/** Découpe un texte collé (retours à la ligne, virgules, points-virgules), sans lignes vides. */
export function decouper(texte: string): string[] {
  const noms: string[] = [];
  for (const morceau of texte.split(SEPARATEURS)) {
    const nom = normaliserNom(morceau);
    if (nom !== null) noms.push(nom);
  }
  return noms;
}

function cle(nom: string): string {
  return nom.normalize("NFC").toLocaleLowerCase("fr");
}

/**
 * Nombre de doublons (F3) : entrées dont le nom (casse et forme Unicode ignorées)
 * apparaît déjà plus tôt. ["Marie", "marie", "Paul", "Marie"] donne 2.
 */
export function compterDoublons(noms: readonly string[]): number {
  const vus = new Set<string>();
  let doublons = 0;
  for (const nom of noms) {
    const k = cle(nom);
    if (vus.has(k)) doublons += 1;
    else vus.add(k);
  }
  return doublons;
}
