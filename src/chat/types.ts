/**
 * Contrat du chat (V1.1), partagé par les étages (règles 5.3, décision 5.10, SLM 5.6), la cascade
 * et les outils. Rien ici n'est importé par `src/main.ts`.
 *
 * Un `Etage` reçoit la commande en texte et l'état vu par le chat, et rend une `Decision`
 * (même forme que `attendu` du corpus `docs/v1.1`) ou `null` pour passer la main à l'étage suivant.
 * Un étage ne désigne jamais le gagnant et n'écrit jamais dans l'état : la décision est ensuite
 * validée et exécutée par `outils.ts`, qui passe par `src/actions.ts`.
 */

/** Une action cible avec ses paramètres (noms de personnes en clair : `outils.ts` les résout en id). */
export interface DecisionAction {
  readonly action: string;
  /** Absent : équivaut à `{}`. */
  readonly params?: Readonly<Record<string, unknown>>;
}

/** Plusieurs étapes, exécutées dans l'ordre. */
export interface DecisionEtapes {
  readonly actions: readonly DecisionAction[];
}

/** Refus avec un code (`incompris`, `indisponible`, `nom-absent`, `parametres-invalides`, …). */
export interface DecisionRefus {
  readonly action: 'refuser';
  readonly code?: string;
}

/** Demande de précision : les noms de la liste qui pourraient être visés. */
export interface DecisionClarifier {
  readonly action: 'clarifier';
  readonly candidats: readonly string[];
}

export type Attendu = DecisionAction | DecisionEtapes | DecisionRefus | DecisionClarifier;

/**
 * Décision d'un étage. `confirmation` est calculé par `outils.ts` (`confirmationRequise`), jamais
 * fourni par un modèle : un étage peut l'omettre, et sa valeur n'est pas crue.
 */
export type Decision = Attendu & { readonly confirmation?: boolean };

// `DecisionAction.action` est une chaîne libre (un modèle peut dire n'importe quoi) : on discrimine par ces gardes.
export const estEtapes = (d: Decision): d is DecisionEtapes & Decision => 'actions' in d;
export const estRefus = (d: Decision): d is DecisionRefus & Decision => !('actions' in d) && d.action === 'refuser';
export const estClarifier = (d: Decision): d is DecisionClarifier & Decision =>
  !('actions' in d) && d.action === 'clarifier';

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const estAppel = (v: unknown): boolean =>
  estObjet(v) && typeof v['action'] === 'string' && (v['params'] === undefined || estObjet(v['params']));

/**
 * Vérifie la forme d'une décision venue d'un étage (la sortie d'un modèle n'est pas fiable) :
 * `planifier` refuse avec le code `forme-invalide` ce qui ne la respecte pas.
 */
export function formeValide(d: unknown): d is Decision {
  if (!estObjet(d)) return false;
  if ('actions' in d) return Array.isArray(d['actions']) && d['actions'].every(estAppel);
  if (!estAppel(d)) return false;
  if (d['action'] === 'clarifier') {
    return Array.isArray(d['candidats']) && d['candidats'].every((c) => typeof c === 'string');
  }
  if (d['action'] === 'refuser') return d['code'] === undefined || typeof d['code'] === 'string';
  return true;
}

/** Réglages communs aux étages, fournis à chaque fabrique (le SLM de la 5.6 y lira client, URL et modèle). */
export interface OptionsEtages {
  readonly urlOllama?: string;
  readonly modele?: string;
  /** Modèle de l'étage décision (5.10) ; vide, l'étage reste inactif. */
  readonly modeleDecision?: string;
  readonly fetch?: typeof fetch;
  /** Réglages du moteur SLM (5.6). */
  readonly think?: boolean;
  readonly temperature?: number;
  /** Délai maximal d'un appel au modèle, en ms. */
  readonly delaiMs?: number;
  /** Modèle de décision (5.10) ; l'étage `decision` est inactif sans lui. */
  readonly modeleDecision?: string;
  /** Serveur du modèle de décision ; à défaut `urlOllama`. */
  readonly urlDecision?: string;
  /** Probabilité minimale pour agir (0,5 par défaut) ; en dessous, l'étage passe la main (`incertain`). */
  readonly seuilDecision?: number;
}

/** Fabrique d'un étage ; c'est elle que l'on enregistre dans la cascade. */
export type FabriqueEtage = (options: OptionsEtages) => Etage;

/** L'état vu par le chat, même forme que `etat` du corpus. */
export interface EtatChat {
  /** Noms dans l'ordre de la liste, doublons possibles. */
  readonly noms: readonly string[];
  readonly cadeaux?: readonly string[];
  /** Vrai pendant une rotation. */
  readonly rotation: boolean;
  /** Prochain cadeau à attribuer, calculé par l’application (`cadeaux[attribues]`) ; absent s'il n'y en a plus. */
  readonly prochainCadeau?: string;
  /** Derniers échanges (du plus ancien au plus récent), fournis par le panneau ; le SLM en garde au plus `MAX_ECHANGES`. */
  readonly historique?: readonly { readonly commande: string; readonly reponse: string }[];
}

export type NomEtage = 'regles' | 'decision' | 'slm';

/** Données de trace fournies par l'étage ; la cascade y ajoute l'étage et la durée. */
export interface DonneesTrace {
  /** Ce que l'étage a reçu (commande, ou invite construite pour le modèle). */
  readonly entree: string;
  /** Sortie brute avant interprétation (texte du modèle, règle appliquée…) ; `null` si aucune. */
  readonly sortie: string | null;
}

/** Trace complète d'un étage essayé (future fenêtre d'inspection). */
export interface TraceEtage extends DonneesTrace {
  readonly etage: NomEtage;
  readonly dureeMs: number;
  /** Code court du passage de main (`indisponible`, `delai`, `json-invalide`, `sans-outil`, …). */
  readonly raison?: string;
  /** Message de l'exception si l'étage a échoué (il passe alors la main). */
  readonly erreur?: string;
}

export interface ResultatEtage {
  readonly decision: Decision;
  /** Entre 0 et 1 si l'étage sait l'estimer. */
  readonly confiance?: number;
  readonly trace: DonneesTrace;
}

/** Passage de main motivé : comme `null`, mais la raison et la trace sont conservées par la cascade. */
export interface PasseMain {
  readonly decision: null;
  readonly raison: string;
  readonly trace: DonneesTrace;
}

export interface Etage {
  readonly nom: NomEtage;
  /** `null` : cet étage ne tranche pas, l'étage suivant est essayé. */
  decider(commande: string, etat: EtatChat, signal: AbortSignal): Promise<ResultatEtage | PasseMain | null>;
}

/** Sortie de la cascade : la décision, l'étage qui l'a rendue (`null` si aucun) et toutes les traces. */
export interface ResultatCascade {
  readonly decision: Decision;
  readonly etage: NomEtage | null;
  readonly confiance?: number;
  readonly traces: readonly TraceEtage[];
}
