/**
 * Table des actions de l'application : seul point d'entrée des modifications de l'état et du
 * lancement. Le panneau, le bouton et le toucher sur la roue passent par `executer` ; un futur chat
 * s'y branchera de la même façon, sur la liste `ACTIONS` (nom, paramètres, refus possibles).
 * Le verrouillage F8 (pas d'édition pendant une rotation) est appliqué ici, pas dans l'interface.
 */
import {
  ajouter,
  coller,
  definirCouleur,
  etatInitial,
  raisonLancementInterdit,
  reinitialiserCouleurs,
  renommer,
  supprimer,
  type Etat,
} from './domain/etat';
import { decouper, normaliserNom } from './domain/normalisation';
import { tirerIndex } from './domain/tirage';

/** Pourquoi une action est refusée. Les messages affichés sont dans `TEXTS.refus`. */
export type CodeRefus =
  | 'rotation-en-cours'
  | 'moins-de-2-noms'
  | 'cadeaux-epuises'
  | 'nom-vide'
  | 'introuvable'
  | 'couleur-invalide';

export type Resultat = { readonly ok: true } | { readonly ok: false; readonly code: CodeRefus };

const OK: Resultat = { ok: true };
const refus = (code: CodeRefus): Resultat => ({ ok: false, code });

// --- Magasin --------------------------------------------------------------

export type Abonne = (etat: Etat, precedent: Etat) => void;

/** État du domaine et abonnement : les abonnés reçoivent le nouvel état et le précédent. */
export interface Magasin {
  lire(): Etat;
  /** Remplace l'état ; sans effet (aucun appel) si la référence est la même. */
  remplacer(etat: Etat): void;
  /** Renvoie la fonction de désabonnement. */
  abonner(abonne: Abonne): () => void;
}

export function creerMagasin(initial: Etat = etatInitial()): Magasin {
  let courant = initial;
  const abonnes = new Set<Abonne>();
  return {
    lire: () => courant,
    remplacer(etat) {
      if (etat === courant) return;
      const precedent = courant;
      courant = etat;
      for (const abonne of [...abonnes]) abonne(courant, precedent);
    },
    abonner(abonne) {
      abonnes.add(abonne);
      return () => abonnes.delete(abonne);
    },
  };
}

// --- Table d'actions ------------------------------------------------------

/** Paramètres de chaque action, par nom. */
export interface ParametresActions {
  ajouter: { readonly nom: string };
  coller: { readonly texte: string };
  renommer: { readonly id: string; readonly nom: string };
  supprimer: { readonly id: string };
  /** `couleur` au format `#RRGGBB`. */
  definirCouleur: { readonly id: string; readonly couleur: string };
  reinitialiserCouleur: { readonly id: string };
  reinitialiserCouleurs: Record<string, never>;
  lancer: Record<string, never>;
}

export type NomAction = keyof ParametresActions;

/** Ce dont une action a besoin hors de l'état : la roue et le hasard (injectables en test). */
export interface Contexte {
  readonly magasin: Magasin;
  /** Vrai pendant une rotation. */
  enRotation(): boolean;
  /** Conduit la roue au gagnant déjà tiré. */
  lancer(index: number): void;
  /** Tire un index dans [0, n) ; `tirerIndex` (crypto) par défaut. */
  tirer?: (n: number) => number;
}

export interface Action<N extends NomAction> {
  readonly nom: N;
  readonly description: string;
  /** Codes de refus possibles, pour la documentation et le futur chat. */
  readonly refusPossibles: readonly CodeRefus[];
  executer(ctx: Contexte, params: ParametresActions[N]): Resultat;
}

/** Applique une opération du domaine ; refuse si l'identifiant est inconnu. */
function surParticipant(ctx: Contexte, id: string, operation: (etat: Etat) => Etat): Resultat {
  const etat = ctx.magasin.lire();
  if (!etat.participants.some((p) => p.id === id)) return refus('introuvable');
  ctx.magasin.remplacer(operation(etat));
  return OK;
}

export const ACTIONS: { readonly [N in NomAction]: Action<N> } = {
  ajouter: {
    nom: 'ajouter',
    description: 'Ajoute un nom à la fin de la liste',
    refusPossibles: ['rotation-en-cours', 'nom-vide'],
    executer(ctx, { nom }) {
      if (normaliserNom(nom) === null) return refus('nom-vide');
      ctx.magasin.remplacer(ajouter(ctx.magasin.lire(), nom));
      return OK;
    },
  },
  coller: {
    nom: 'coller',
    description: 'Ajoute une liste (un nom par ligne, virgules et points-virgules acceptés)',
    refusPossibles: ['rotation-en-cours', 'nom-vide'],
    executer(ctx, { texte }) {
      if (decouper(texte).length === 0) return refus('nom-vide');
      ctx.magasin.remplacer(coller(ctx.magasin.lire(), texte));
      return OK;
    },
  },
  renommer: {
    nom: 'renommer',
    description: 'Renomme un nom de la liste',
    refusPossibles: ['rotation-en-cours', 'nom-vide', 'introuvable'],
    executer(ctx, { id, nom }) {
      if (!ctx.magasin.lire().participants.some((p) => p.id === id)) return refus('introuvable');
      if (normaliserNom(nom) === null) return refus('nom-vide');
      return surParticipant(ctx, id, (etat) => renommer(etat, id, nom));
    },
  },
  supprimer: {
    nom: 'supprimer',
    description: 'Retire un nom de la liste',
    refusPossibles: ['rotation-en-cours', 'introuvable'],
    executer: (ctx, { id }) => surParticipant(ctx, id, (etat) => supprimer(etat, id)),
  },
  definirCouleur: {
    nom: 'definirCouleur',
    description: 'Donne une couleur personnalisée (#RRGGBB) à un nom, sans toucher aux autres',
    refusPossibles: ['rotation-en-cours', 'introuvable', 'couleur-invalide'],
    executer(ctx, { id, couleur }) {
      if (!/^#[0-9a-fA-F]{6}$/.test(couleur)) return refus('couleur-invalide');
      return surParticipant(ctx, id, (etat) => definirCouleur(etat, id, couleur));
    },
  },
  reinitialiserCouleur: {
    nom: 'reinitialiserCouleur',
    description: 'Rend à un nom sa couleur par défaut',
    refusPossibles: ['rotation-en-cours', 'introuvable'],
    executer: (ctx, { id }) => surParticipant(ctx, id, (etat) => definirCouleur(etat, id, null)),
  },
  reinitialiserCouleurs: {
    nom: 'reinitialiserCouleurs',
    description: 'Rend à tous les noms leur couleur par défaut',
    refusPossibles: ['rotation-en-cours'],
    executer(ctx) {
      ctx.magasin.remplacer(reinitialiserCouleurs(ctx.magasin.lire()));
      return OK;
    },
  },
  lancer: {
    nom: 'lancer',
    description: 'Tire un gagnant puis lance la roue',
    refusPossibles: ['rotation-en-cours', 'moins-de-2-noms', 'cadeaux-epuises'],
    executer(ctx) {
      const etat = ctx.magasin.lire();
      const raison = raisonLancementInterdit(etat);
      if (raison !== null) return refus(raison);
      // Le gagnant est décidé ici, avant toute animation ; la roue ne fait que l'atteindre.
      ctx.lancer((ctx.tirer ?? tirerIndex)(etat.participants.length));
      return OK;
    },
  },
};

export interface Actions {
  /** Exécute une action ; refus avec code, jamais d'exception pour un refus attendu. */
  executer<N extends NomAction>(nom: N, params: ParametresActions[N]): Resultat;
  /** Pourquoi `lancer` serait refusé maintenant, `null` s'il est permis. */
  lancementInterdit(): CodeRefus | null;
  readonly magasin: Magasin;
}

export function creerActions(ctx: Contexte): Actions {
  return {
    magasin: ctx.magasin,
    executer<N extends NomAction>(nom: N, params: ParametresActions[N]): Resultat {
      const action: Action<N> = ACTIONS[nom];
      // Verrou F8 : toute action est refusée pendant une rotation, aucune interface ne peut le contourner.
      if (ctx.enRotation()) return refus('rotation-en-cours');
      return action.executer(ctx, params);
    },
    lancementInterdit() {
      if (ctx.enRotation()) return 'rotation-en-cours';
      return raisonLancementInterdit(ctx.magasin.lire());
    },
  };
}
