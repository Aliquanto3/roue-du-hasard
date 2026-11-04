/**
 * Cascade des étages du chat : chaque étage est essayé dans l'ordre, le premier qui rend un
 * résultat l'emporte, et les traces de tous les étages essayés sont rendues avec la décision.
 *
 * Ajouter un étage : une seule ligne dans `ETAGES_ENREGISTRES` (les stories 5.3, 5.6 et 5.10
 * y ajoutent règles, SLM et décision, dans cet ordre de priorité). Un étage qui lève une
 * exception passe la main (l'erreur est dans sa trace) ; un signal annulé arrête tout.
 * Sans résultat : refus `incompris`.
 */
import type { Decision, Etage, EtatChat, ResultatCascade, TraceEtage } from './types';

/** Étages actifs, par ordre de priorité. Une ligne par étage. */
export const ETAGES_ENREGISTRES: readonly Etage[] = [
  // 5.3 : règles ; 5.10 : décision ; 5.6 : SLM
];

export const REFUS_INCOMPRIS: Decision = { action: 'refuser', code: 'incompris' };
export const REFUS_ANNULE: Decision = { action: 'refuser', code: 'annule' };

export interface OptionsCascade {
  readonly etages?: readonly Etage[];
  /** Horloge en ms (injectable en test) ; `performance.now` par défaut. */
  readonly maintenant?: () => number;
}

export async function decider(
  commande: string,
  etat: EtatChat,
  signal: AbortSignal,
  options: OptionsCascade = {},
): Promise<ResultatCascade> {
  const etages = options.etages ?? ETAGES_ENREGISTRES;
  const maintenant = options.maintenant ?? (() => performance.now());
  const traces: TraceEtage[] = [];
  for (const etage of etages) {
    if (signal.aborted) return { decision: REFUS_ANNULE, etage: null, traces };
    const debut = maintenant();
    try {
      const resultat = await etage.decider(commande, etat, signal);
      const dureeMs = maintenant() - debut;
      if (resultat === null) {
        traces.push({ etage: etage.nom, entree: commande, sortie: null, dureeMs });
        continue;
      }
      traces.push({ etage: etage.nom, ...resultat.trace, dureeMs });
      return {
        decision: resultat.decision,
        etage: etage.nom,
        ...(resultat.confiance === undefined ? {} : { confiance: resultat.confiance }),
        traces,
      };
    } catch (erreur) {
      const dureeMs = maintenant() - debut;
      const message = erreur instanceof Error ? erreur.message : String(erreur);
      traces.push({ etage: etage.nom, entree: commande, sortie: null, dureeMs, erreur: message });
      if (signal.aborted) return { decision: REFUS_ANNULE, etage: null, traces };
    }
  }
  return { decision: REFUS_INCOMPRIS, etage: null, traces };
}
