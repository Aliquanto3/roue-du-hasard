/** Reconnaissance d'un toucher ou d'un clic sans glisser (F7), sans DOM. */

/** Déplacement maximal, en px CSS, au-delà duquel le geste n'est plus un toucher. */
export const SEUIL_DEPLACEMENT = 10;

export interface Geste {
  debut(id: number, x: number, y: number): void;
  deplacement(id: number, x: number, y: number): void;
  /** Vrai si le geste `id` s'achève ici comme un toucher valable. */
  fin(id: number, x: number, y: number): boolean;
  annuler(id: number): void;
}

export function creerGeste(seuil: number = SEUIL_DEPLACEMENT): Geste {
  let actif: { id: number; x: number; y: number; glisse: boolean } | null = null;
  const noter = (x: number, y: number): void => {
    if (actif && Math.hypot(x - actif.x, y - actif.y) > seuil) actif.glisse = true;
  };
  return {
    debut(id, x, y) {
      // Un appui resté sans fin (changement d'application) ne doit pas bloquer les suivants ;
      // l'appelant ne transmet que le pointeur principal, un second doigt n'arrive donc pas ici.
      actif = { id, x, y, glisse: false };
    },
    deplacement(id, x, y) {
      if (actif?.id === id) noter(x, y);
    },
    fin(id, x, y) {
      if (actif?.id !== id) return false;
      noter(x, y);
      const valable = !actif.glisse;
      actif = null;
      return valable;
    },
    annuler(id) {
      if (actif?.id === id) actif = null;
    },
  };
}
