/**
 * Contrôleur du panneau de chat (5.5), sans DOM : il enchaîne `cascade.decider`, `planifier` puis
 * `executerPlan`, tient le fil des messages et l'éventuelle attente d'une réponse (clarification ou
 * confirmation). Il n'écrit jamais dans l'état autrement que par `Actions` (via `executerPlan`).
 * Tout texte est une donnée : la vue le rend avec `textContent`.
 */
import type { Actions } from '../actions';
import type { Cascade } from './cascade';
import { executerPlan, planifier, type Etape, type Plan } from './outils';
import { TEXTES_CHAT } from './textes';
import { estClarifier, estEtapes, type Decision, type DecisionAction, type EtatChat, type Etage } from './types';

export type Auteur = 'moi' | 'chat';

export interface Message {
  readonly id: number;
  readonly auteur: Auteur;
  readonly texte: string;
}

export type Attente =
  | { readonly genre: 'clarifier'; readonly candidats: readonly string[] }
  | { readonly genre: 'confirmer'; readonly recapitulatif: readonly string[] };

export interface EtatPanneau {
  readonly messages: readonly Message[];
  /** Vrai pendant la décision : la saisie est désactivée. */
  readonly occupe: boolean;
  readonly attente: Attente | null;
  /** Avis discret sur l'indisponibilité du modèle, affiché une seule fois ; `null` sinon. */
  readonly avis: string | null;
}

export interface DepsControleur {
  readonly cascade: Pick<Cascade, 'etages' | 'decider'>;
  readonly actions: Actions;
  readonly enRotation: () => boolean;
}

export interface Controleur {
  etat(): EtatPanneau;
  abonner(fn: () => void): () => void;
  /** Envoie une commande ; annule celle qui est en cours. Résolu quand la commande est traitée. */
  envoyer(texte: string): Promise<void>;
  /** Réponse à une clarification : le candidat choisi remplace le nom ambigu de la décision. */
  choisir(candidat: string): void;
  confirmer(): void;
  annuler(): void;
  /** Ferme le panneau : annule la commande en cours et l'attente. */
  fermer(): void;
}

/** Nombre d'échanges transmis comme historique (le SLM n'en garde que `MAX_ECHANGES`). */
const ECHANGES_HISTORIQUE = 3;

interface Echange {
  readonly commande: string;
  readonly reponse: string;
}

interface Suite {
  readonly decision: Decision;
  /** Empreinte de l'état au moment de la carte : si elle change, la carte est périmée. */
  readonly empreinte: string;
}

const CLE_ETAGE_DISPONIBILITE = ['slm', 'decision'] as const;

type EtageAvecEtat = Etage & { etat(): string };
const aUnEtat = (e: Etage): e is EtageAvecEtat => typeof (e as { etat?: unknown }).etat === 'function';

/** Vrai si un étage SLM ou décision se déclare `indisponible` (garde de type propre : les autres étages n'ont pas d'`etat`). */
export function modeleIndisponible(etages: readonly Etage[]): boolean {
  return etagesIndisponibles(etages).length > 0;
}

const etagesIndisponibles = (etages: readonly Etage[]): EtageAvecEtat[] =>
  etages.filter(
    (e): e is EtageAvecEtat =>
      (CLE_ETAGE_DISPONIBILITE as readonly string[]).includes(e.nom) && aUnEtat(e) && e.etat() === 'indisponible',
  );

/** Avis adapté à la raison de l'étage (`raisonIndisponible()` de `slm.ts`) : modèle absent, sinon Ollama injoignable ou refusé. */
export function avisIndisponibilite(etages: readonly Etage[]): string | null {
  const [premier] = etagesIndisponibles(etages);
  if (premier === undefined) return null;
  const raison = (premier as { raisonIndisponible?: () => string | null }).raisonIndisponible?.() ?? null;
  const absent = raison === null ? null : /^modèle (.+) non installé/u.exec(raison);
  return absent?.[1] === undefined ? TEXTES_CHAT.avisIndisponible : TEXTES_CHAT.avisModeleAbsent(absent[1]);
}

export function creerControleur(deps: DepsControleur): Controleur {
  let messages: readonly Message[] = [];
  let attente: Attente | null = null;
  let occupe = false;
  let avis: string | null = null;
  let avisDonne = false;
  let prochainId = 1;
  let courant: AbortController | null = null;
  let suite: Suite | null = null;
  /** Décision à corriger quand une clarification est en attente. */
  let aClarifier: Decision | null = null;
  const echanges: Echange[] = [];
  const abonnes = new Set<() => void>();

  const notifier = (): void => {
    for (const fn of [...abonnes]) fn();
  };
  const dire = (auteur: Auteur, texte: string): void => {
    messages = [...messages, { id: prochainId++, auteur, texte }];
  };
  const repondre = (commande: string, texte: string): void => {
    dire('chat', texte);
    echanges.push({ commande, reponse: texte });
  };
  const oublierAttente = (): void => {
    attente = null;
    suite = null;
    aClarifier = null;
  };

  const etatChat = (): EtatChat => {
    const domaine = deps.actions.magasin.lire();
    const prochain = domaine.cadeaux[domaine.attribues];
    return {
      noms: domaine.participants.map((p) => p.nom),
      cadeaux: domaine.cadeaux,
      rotation: deps.enRotation(),
      ...(prochain === undefined ? {} : { prochainCadeau: prochain }),
      historique: echanges.slice(-ECHANGES_HISTORIQUE),
    };
  };

  const empreinte = (): string => {
    const d = deps.actions.magasin.lire();
    return JSON.stringify([
      deps.enRotation(),
      d.participants.map((p) => [p.id, p.nom]),
      d.cadeaux,
      d.attribues,
      d.historique.length,
    ]);
  };

  const executer = (commande: string, etapes: readonly Etape[]): void => {
    const { resultats, refus } = executerPlan(etapes, deps.actions);
    if (refus !== null) {
      repondre(commande, TEXTES_CHAT.refusPlan(refus));
      return;
    }
    const lecture = [...resultats].reverse().find((r) => r.ok && r.cadeauSuivant !== undefined);
    repondre(
      commande,
      lecture?.ok === true && lecture.cadeauSuivant !== undefined
        ? TEXTES_CHAT.cadeauSuivant(lecture.cadeauSuivant)
        : TEXTES_CHAT.fait,
    );
  };

  const appels = (decision: Decision): readonly DecisionAction[] =>
    estEtapes(decision) ? decision.actions : [decision as DecisionAction];

  const suivre = (commande: string, decision: Decision, plan: Plan): void => {
    if (plan.genre === 'refuser') {
      // Les règles refusent « lancer » avec moins de 2 noms par `indisponible` : on donne le message de l'interface.
      const moinsDeDeux =
        plan.code === 'indisponible' &&
        deps.actions.magasin.lire().participants.length < 2 &&
        /\b(?:lanc|tourn)/iu.test(commande);
      repondre(commande, TEXTES_CHAT.refusPlan(moinsDeDeux ? 'moins-de-2-noms' : plan.code));
    } else if (plan.genre === 'clarifier') {
      const candidats = [...new Set(plan.candidats)];
      aClarifier = decision;
      attente = { genre: 'clarifier', candidats };
      repondre(commande, TEXTES_CHAT.clarifier(candidats));
    } else if (plan.confirmation) {
      suite = { decision, empreinte: empreinte() };
      attente = {
        genre: 'confirmer',
        recapitulatif: appels(decision).map((a) => TEXTES_CHAT.etape(a.action, a.params)),
      };
      repondre(commande, TEXTES_CHAT.confirmer);
    } else {
      executer(commande, plan.etapes);
    }
  };

  const verifierAvis = (): void => {
    if (avisDonne) return;
    const texte = avisIndisponibilite(deps.cascade.etages);
    if (texte === null) return;
    avisDonne = true;
    avis = texte;
  };

  /** Commande derrière l'attente en cours (dernier message de l'utilisateur). */
  const derniereCommande = (): string => [...messages].reverse().find((m) => m.auteur === 'moi')?.texte ?? '';

  const controleur: Controleur = {
    etat: () => ({ messages, occupe, attente, avis }),
    abonner(fn) {
      abonnes.add(fn);
      return () => abonnes.delete(fn);
    },
    async envoyer(texte) {
      const commande = texte.trim();
      if (commande === '') return;
      if (attente?.genre === 'confirmer') dire('chat', TEXTES_CHAT.confirmationAbandonnee);
      courant?.abort();
      const controle = new AbortController();
      courant = controle;
      oublierAttente();
      dire('moi', commande);
      occupe = true;
      notifier();
      let decision: Decision;
      try {
        decision = (await deps.cascade.decider(commande, etatChat(), controle.signal)).decision;
      } catch {
        decision = { action: 'refuser', code: 'incompris' };
      }
      // Remplacée par une commande plus récente, ou panneau fermé : le résultat est ignoré.
      if (courant !== controle || controle.signal.aborted) return;
      courant = null;
      occupe = false;
      verifierAvis();
      suivre(commande, decision, planifier(decision, deps.actions.magasin.lire()));
      notifier();
    },
    choisir(candidat) {
      if (attente?.genre !== 'clarifier' || aClarifier === null) return;
      const commande = derniereCommande();
      const decision = aClarifier;
      const attenteCandidats = attente.candidats;
      oublierAttente();
      // Clarification venue d'un étage (aucun paramètre à corriger) : la commande est reprise avec le nom choisi.
      if (estClarifier(decision)) {
        // Un seul nom possible (homonymes identiques) : le reprendre ne lèverait pas l'ambiguïté.
        if (attenteCandidats.length <= 1) {
          repondre(commande, TEXTES_CHAT.ambigu);
          notifier();
          return;
        }
        void controleur.envoyer(`${commande} ${candidat}`);
        return;
      }
      const corrigee = substituer(decision, candidat, deps.actions);
      if (corrigee === null) repondre(commande, TEXTES_CHAT.ambigu);
      else suivre(commande, corrigee.decision, corrigee.plan);
      notifier();
    },
    confirmer() {
      if (attente?.genre !== 'confirmer' || suite === null) return;
      const { decision, empreinte: avant } = suite;
      const commande = derniereCommande();
      oublierAttente();
      // La carte date : on rejoue le plan sur l'état courant, rien n'est exécuté si l'état a changé.
      const plan = planifier(decision, deps.actions.magasin.lire());
      if (empreinte() !== avant || plan.genre !== 'etapes') repondre(commande, TEXTES_CHAT.confirmationPerimee);
      else executer(commande, plan.etapes);
      notifier();
    },
    annuler() {
      if (attente?.genre !== 'confirmer') return;
      const commande = derniereCommande();
      oublierAttente();
      repondre(commande, TEXTES_CHAT.commandeAnnulee);
      notifier();
    },
    fermer() {
      courant?.abort();
      courant = null;
      occupe = false;
      oublierAttente();
      notifier();
    },
  };
  return controleur;
}

/**
 * Remplace un nom de la décision par le candidat choisi : la première valeur texte dont la
 * substitution donne un plan sans nouvelle clarification ni refus. `null` si aucune (homonymes
 * identiques : un nom ne les distingue pas).
 */
function substituer(
  decision: Decision,
  candidat: string,
  actions: Actions,
): { readonly decision: Decision; readonly plan: Plan } | null {
  const etapes = estClarifier(decision) ? [] : estEtapes(decision) ? decision.actions : [decision as DecisionAction];
  for (let i = 0; i < etapes.length; i++) {
    const etape = etapes[i];
    if (etape === undefined) continue;
    for (const [cle, valeur] of Object.entries(etape.params ?? {})) {
      if (typeof valeur !== 'string') continue;
      const nouvelles = etapes.map((e, j) => (j === i ? { ...e, params: { ...e.params, [cle]: candidat } } : e));
      const essai: Decision = estEtapes(decision) ? { actions: nouvelles } : (nouvelles[0] as DecisionAction);
      const plan = planifier(essai, actions.magasin.lire());
      if (plan.genre === 'etapes') return { decision: essai, plan };
    }
  }
  return null;
}
