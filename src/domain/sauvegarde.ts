/** Sauvegarde automatique de l'état (F14), par le même schéma que l'export (F15). */
import type { Etat } from "./etat";
import type { Persistance } from "./persistance";
import { exporter, valider } from "./schema";

export const CLE_ETAT = "roue:etat";

/**
 * `Persistance.ecrire` encode déjà en JSON : on lui passe l'objet décodé de l'export, jamais la
 * chaîne (sinon double encodage). Renvoie `true` si l'écriture a réussi.
 */
export function sauvegarder(persistance: Persistance, etat: Etat): boolean {
  return persistance.ecrire(CLE_ETAT, JSON.parse(exporter(etat)) as unknown);
}

/** Relit l'état sauvegardé ; `null` si absent, corrompu ou d'une version inconnue. Ne lève jamais. */
export function restaurer(persistance: Persistance): Etat | null {
  try {
    const brut = persistance.lire(CLE_ETAT);
    if (brut === null) return null;
    const r = valider(brut);
    return r.ok ? r.etat : null;
  } catch {
    return null;
  }
}
