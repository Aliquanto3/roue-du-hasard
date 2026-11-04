/**
 * Cascade des étages du chat : chaque étage est essayé dans l'ordre, le premier qui rend un
 * résultat l'emporte, et les traces de tous les étages essayés sont rendues avec la décision.
 *
 * Ajouter un étage : une seule ligne dans `ETAGES_ENREGISTRES`, qui est une liste de fabriques
 * `(options: OptionsEtages) => Etage` (les stories 5.3, 5.6 et 5.10 y ajoutent règles, SLM et
 * décision, dans cet ordre de priorité ; le SLM lit client, URL et modèle dans les options).
 * Un étage qui lève une exception passe la main (l'erreur est dans sa trace) ; un signal annulé
 * arrête tout, et une décision rendue après l'annulation est ignorée. Sans résultat : refus
 * `incompris`. La forme des décisions est vérifiée plus loin, par `planifier`.
 */
import { fabriqueRegles } from './regles';
import type { Decision, Etage, EtatChat, FabriqueEtage, OptionsEtages, ResultatCascade, TraceEtage } from './types';

/** Fabriques des étages actifs, par ordre de priorité. Une ligne par étage. */
export const ETAGES_ENREGISTRES: readonly FabriqueEtage[] = [
  fabriqueRegles, // 5.3 : règles (5.10 : décision ; 5.6 : SLM)
];

export const REFUS_INCOMPRIS: Decision = { action: 'refuser', code: 'incompris' };
export const REFUS_ANNULE: Decision = { action: 'refuser', code: 'annule' };

export interface OptionsCascade {
  /** Étages déjà construits (tests) ; sinon `fabriques` reçoit `options`. */
  readonly etages?: readonly Etage[];
  readonly fabriques?: readonly FabriqueEtage[];
  readonly options?: OptionsEtages;
  /** Horloge en ms (injectable en test) ; `performance.now` par défaut. */
  readonly maintenant?: () => number;
}

export async function decider(
  commande: string,
  etat: EtatChat,
  signal: AbortSignal,
  options: OptionsCascade = {},
): Promise<ResultatCascade> {
  const etages = options.etages ?? (options.fabriques ?? ETAGES_ENREGISTRES).map((f) => f(options.options ?? {}));
  const maintenant = options.maintenant ?? (() => performance.now());
  const traces: TraceEtage[] = [];
  for (const etage of etages) {
    if (signal.aborted) return { decision: REFUS_ANNULE, etage: null, traces };
    const debut = maintenant();
    try {
      const resultat = await etage.decider(commande, etat, signal);
      const dureeMs = maintenant() - debut;
      if (signal.aborted) {
        traces.push({ etage: etage.nom, entree: commande, sortie: resultat?.trace.sortie ?? null, dureeMs });
        return { decision: REFUS_ANNULE, etage: null, traces };
      }
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
