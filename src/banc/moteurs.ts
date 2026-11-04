/**
 * Registre des moteurs du banc : nom vers liste de fabriques d'étages (même forme que
 * `ETAGES_ENREGISTRES` de la cascade). Aucun appel réseau par défaut : seul un étage qui lit
 * `urlOllama` en fait (le SLM, 5.6).
 *
 * Ajouter un moteur : une entrée dans `MOTEURS` quand sa story livre l'étage, et le retirer de
 * `MOTEURS_A_VENIR`.
 * - `regles` (5.3) : `[fabriqueRegles]`
 * - `slm` (5.6, branché en 5.7) : `[creerEtageSlm]` (lit `urlOllama` et `modele`) ; inactif sans `--modele`, donc aucun appel réseau par défaut
 * - `decision` (5.10) : `[fabriqueDecision]`
 */
import { fabriqueRegles } from '../chat/regles';
import { creerEtageDecision } from '../chat/decision';
import { creerEtageSlm } from '../chat/slm';
import type { Etage, FabriqueEtage } from '../chat/types';

/** Moteur factice : refuse toujours. Son score est le plancher de référence du corpus. */
export const fabriqueRefuseTout: FabriqueEtage = (): Etage => ({
  // `NomEtage` ne prévoit pas de nom pour un moteur factice : il emprunte celui des règles.
  nom: 'regles',
  decider: (commande) =>
    Promise.resolve({
      decision: { action: 'refuser', code: 'refuse-tout' },
      trace: { entree: commande, sortie: 'refuser' },
    }),
});

/** Moteur `decision` (5.10) : `--modele` du banc désigne le modèle de décision ; `--url`, son serveur. */
export const fabriqueDecisionBanc: FabriqueEtage = (options) =>
  creerEtageDecision({ ...options, modeleDecision: options.modeleDecision ?? options.modele });

export const MOTEURS: Readonly<Record<string, readonly FabriqueEtage[]>> = {
  'refuse-tout': [fabriqueRefuseTout],
  regles: [fabriqueRegles],
  slm: [creerEtageSlm],
  decision: [fabriqueDecisionBanc],
};

/** Moteurs prévus, pas encore livrés, avec la story qui les apporte. */
export const MOTEURS_A_VENIR: Readonly<Record<string, string>> = {};

export function moteursDisponibles(): string[] {
  return Object.keys(MOTEURS);
}

export function fabriquesDuMoteur(nom: string): readonly FabriqueEtage[] {
  const f = Object.hasOwn(MOTEURS, nom) ? MOTEURS[nom] : undefined;
  if (f) return f;
  const story = Object.hasOwn(MOTEURS_A_VENIR, nom) ? MOTEURS_A_VENIR[nom] : undefined;
  const suite = story ? `pas encore disponible (story ${story})` : 'inconnu';
  throw new Error(`moteur « ${nom} » ${suite} ; moteurs disponibles : ${moteursDisponibles().join(', ')}`);
}
