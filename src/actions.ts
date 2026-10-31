/**
 * Table des actions de l'application : seul point d'entrée des modifications de l'état et du
 * lancement. Le panneau, le bouton et le toucher sur la roue passent par `executer` ; un futur chat
 * s'y branchera de la même façon, sur la liste `ACTIONS` (nom, paramètres, refus possibles).
 * Le verrouillage F8 (pas d'édition pendant une rotation) est appliqué ici, pas dans l'interface.
 */
import {
  ajouter,
  ajouterCadeau,
  annulerDernierTirage,
  attribuerSansRotation,
  attributionSansRotationPossible,
  coller,
  collerCadeaux,
  definirCouleur,
  definirRelief,
  definirRetirerGagnants,
  definirSonCoupe,
  effacerHistorique,
  enregistrerTirage,
  etatInitial,
  raisonLancementInterdit,
  recommencerAttributions,
  reinitialiserCouleurs,
  renommer,
  renommerCadeau,
  retirerDernierGagnant,
  supprimer,
  supprimerCadeau,
  type Etat,
} from './domain/etat';
import { decouper, normaliserNom } from './domain/normalisation';
import { couleursParDefaut } from './domain/palette';
import { tirerIndex } from './domain/tirage';

/** Pourquoi une action est refusée. Les messages affichés sont dans `TEXTS.refus`. */
export type CodeRefus =
  | 'rotation-en-cours'
  | 'moins-de-2-noms'
  | 'cadeaux-epuises'
  | 'nom-vide'
  | 'introuvable'
  | 'couleur-invalide'
  | 'annonce-fermee'
  | 'annonce-ouverte'
  | 'historique-vide'
  | 'attribution-impossible'
  | 'rendu-invalide';

/** Ce que montre l'annonce d'un tirage (F9). */
export interface InfoAnnonce {
  readonly ordre: number;
  readonly nom: string;
  /** `#RRGGBB` du secteur gagnant. */
  readonly couleur: string;
  readonly cadeau: string | null;
  /** Vrai si le gagnant sortira de la roue à la fermeture (F19). */
  readonly retraitPrevu: boolean;
}

/** L'annonce vue par la table d'actions (implémentée par `ui/annonce.ts`). */
export interface ControleAnnonce {
  ouverte(): boolean;
  ouvrir(info: InfoAnnonce): void;
  /** `restaurerFocus: false` quand un lancement suit aussitôt. */
  fermer(options?: { restaurerFocus?: boolean }): void;
}

const annonceAbsente: ControleAnnonce = { ouverte: () => false, ouvrir: () => undefined, fermer: () => undefined };

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
  /** Appelée par l'interface à la fin de la rotation, avec l'`index` de l'événement `fin` de la roue. */
  enregistrerTirage: { readonly index: number };
  fermerAnnonce: Record<string, never>;
  /** Ferme l'annonce (le gagnant sort si F19) puis relance la roue. */
  relancer: Record<string, never>;
  ajouterCadeau: { readonly nom: string };
  collerCadeaux: { readonly texte: string };
  renommerCadeau: { readonly index: number; readonly nom: string };
  supprimerCadeau: { readonly index: number };
  recommencerAttributions: Record<string, never>;
  effacerHistorique: Record<string, never>;
  annulerDernierTirage: Record<string, never>;
  definirRetirerGagnants: { readonly valeur: boolean };
  attribuerSansRotation: Record<string, never>;
  /** Relief (`3d`, par défaut) ou rendu plat (`2d`) de la roue (F20). */
  basculerRendu: { readonly mode: "2d" | "3d" };
  /** Coupe ou rétablit le son (F16) ; le choix est mémorisé. */
  couperSon: { readonly coupe: boolean };
  /** Télécharge l'état en fichier JSON (F15). */
  exporter: Record<string, never>;
  /** Remplace tout l'état par un état déjà lu et validé (`lireFichierImport`) ; la confirmation est demandée par l'interface. */
  importer: { readonly etat: Etat };
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
  /** Annonce du résultat ; absente (jamais ouverte) en test. */
  annonce?: ControleAnnonce;
  /** Déclenche le téléchargement de l'export ; absent en test. */
  telecharger?: (etat: Etat) => void;
  /** Horloge des tirages ; `new Date()` par défaut. */
  maintenant?: () => Date;
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
      // Une annonce ouverte se ferme (ou se relance) : sinon le gagnant précédent ne sortirait jamais (F19).
      if (annonceDe(ctx).ouverte()) return refus('annonce-ouverte');
      return demarrer(ctx, ctx.magasin.lire());
    },
  },
  enregistrerTirage: {
    nom: 'enregistrerTirage',
    description: 'Enregistre le tirage terminé (nom, cadeau, heure) et ouvre l’annonce',
    refusPossibles: ['rotation-en-cours', 'introuvable', 'cadeaux-epuises'],
    executer(ctx, { index }) {
      const avant = ctx.magasin.lire();
      const gagnant = avant.participants[index];
      if (!gagnant) return refus('introuvable');
      if (raisonLancementInterdit(avant) === 'cadeaux-epuises') return refus('cadeaux-epuises');
      const apres = enregistrerTirage(avant, gagnant.id, (ctx.maintenant ?? maintenant)());
      ctx.magasin.remplacer(apres);
      const info = infoTirage(avant, apres, avant.retirerGagnants);
      if (info) annonceDe(ctx).ouvrir(info);
      return OK;
    },
  },
  fermerAnnonce: {
    nom: 'fermerAnnonce',
    description: 'Ferme l’annonce ; le gagnant sort de la roue si l’option est cochée',
    refusPossibles: ['rotation-en-cours', 'annonce-fermee'],
    executer(ctx) {
      const annonce = annonceDe(ctx);
      if (!annonce.ouverte()) return refus('annonce-fermee');
      ctx.magasin.remplacer(retirerDernierGagnant(ctx.magasin.lire()));
      annonce.fermer();
      return OK;
    },
  },
  relancer: {
    nom: 'relancer',
    description: 'Ferme l’annonce (le gagnant sort si l’option est cochée) puis relance la roue',
    refusPossibles: ['rotation-en-cours', 'annonce-fermee', 'moins-de-2-noms', 'cadeaux-epuises'],
    executer(ctx) {
      const annonce = annonceDe(ctx);
      if (!annonce.ouverte()) return refus('annonce-fermee');
      // Le gagnant sort avant la nouvelle rotation ; si elle est impossible ensuite, rien n'est modifié.
      const apresRetrait = retirerDernierGagnant(ctx.magasin.lire());
      const raison = raisonLancementInterdit(apresRetrait);
      if (raison !== null) return refus(raison);
      ctx.magasin.remplacer(apresRetrait);
      annonce.fermer({ restaurerFocus: false });
      return demarrer(ctx, apresRetrait);
    },
  },
  ajouterCadeau: {
    nom: 'ajouterCadeau',
    description: 'Ajoute un cadeau à la fin de la liste ordonnée',
    refusPossibles: ['rotation-en-cours', 'nom-vide'],
    executer(ctx, { nom }) {
      if (normaliserNom(nom) === null) return refus('nom-vide');
      ctx.magasin.remplacer(ajouterCadeau(ctx.magasin.lire(), nom));
      return OK;
    },
  },
  collerCadeaux: {
    nom: 'collerCadeaux',
    description: 'Ajoute une liste de cadeaux (un par ligne, virgules et points-virgules acceptés)',
    refusPossibles: ['rotation-en-cours', 'nom-vide'],
    executer(ctx, { texte }) {
      if (decouper(texte).length === 0) return refus('nom-vide');
      ctx.magasin.remplacer(collerCadeaux(ctx.magasin.lire(), texte));
      return OK;
    },
  },
  renommerCadeau: {
    nom: 'renommerCadeau',
    description: 'Renomme le cadeau de rang `index` (à partir de 0)',
    refusPossibles: ['rotation-en-cours', 'nom-vide', 'introuvable'],
    executer(ctx, { index, nom }) {
      if (!cadeauExiste(ctx.magasin.lire(), index)) return refus('introuvable');
      if (normaliserNom(nom) === null) return refus('nom-vide');
      ctx.magasin.remplacer(renommerCadeau(ctx.magasin.lire(), index, nom));
      return OK;
    },
  },
  supprimerCadeau: {
    nom: 'supprimerCadeau',
    description: 'Retire le cadeau de rang `index` (à partir de 0)',
    refusPossibles: ['rotation-en-cours', 'introuvable'],
    executer(ctx, { index }) {
      if (!cadeauExiste(ctx.magasin.lire(), index)) return refus('introuvable');
      ctx.magasin.remplacer(supprimerCadeau(ctx.magasin.lire(), index));
      return OK;
    },
  },
  recommencerAttributions: {
    nom: 'recommencerAttributions',
    description: 'Rend tous les cadeaux disponibles ; l’historique est conservé',
    refusPossibles: ['rotation-en-cours'],
    executer(ctx) {
      ctx.magasin.remplacer(recommencerAttributions(ctx.magasin.lire()));
      return OK;
    },
  },
  effacerHistorique: {
    nom: 'effacerHistorique',
    description: 'Efface l’historique des tirages (la confirmation est demandée par l’interface)',
    refusPossibles: ['rotation-en-cours'],
    executer(ctx) {
      ctx.magasin.remplacer(effacerHistorique(ctx.magasin.lire()));
      return OK;
    },
  },
  annulerDernierTirage: {
    nom: 'annulerDernierTirage',
    description: 'Retire la dernière ligne de l’historique, rend son cadeau et remet le gagnant retiré',
    refusPossibles: ['rotation-en-cours', 'historique-vide'],
    executer(ctx) {
      if (ctx.magasin.lire().historique.length === 0) return refus('historique-vide');
      // L'annonce du tirage annulé se ferme d'abord, sans retirer son gagnant : il n'y a plus rien à retirer.
      annonceDe(ctx).fermer();
      ctx.magasin.remplacer(annulerDernierTirage(ctx.magasin.lire()));
      return OK;
    },
  },
  definirRetirerGagnants: {
    nom: 'definirRetirerGagnants',
    description: 'Coche ou décoche « Retirer les gagnants de la roue » (F19)',
    refusPossibles: ['rotation-en-cours'],
    executer(ctx, { valeur }) {
      const etat = ctx.magasin.lire();
      if (etat.retirerGagnants !== valeur) ctx.magasin.remplacer(definirRetirerGagnants(etat, valeur));
      return OK;
    },
  },
  attribuerSansRotation: {
    nom: 'attribuerSansRotation',
    description: 'Avec un seul nom et un cadeau disponible, attribue le cadeau sans faire tourner la roue',
    refusPossibles: ['rotation-en-cours', 'annonce-ouverte', 'attribution-impossible'],
    executer(ctx) {
      const annonce = annonceDe(ctx);
      if (annonce.ouverte()) return refus('annonce-ouverte');
      const avant = ctx.magasin.lire();
      if (!attributionSansRotationPossible(avant)) return refus('attribution-impossible');
      const apres = attribuerSansRotation(avant, (ctx.maintenant ?? maintenant)());
      ctx.magasin.remplacer(apres);
      // Le retrait éventuel est déjà fait : l'annonce n'a plus rien à retirer à la fermeture.
      const info = infoTirage(avant, apres, false);
      if (info) annonce.ouvrir(info);
      return OK;
    },
  },
  basculerRendu: {
    nom: 'basculerRendu',
    description: 'Choisit le rendu de la roue : relief (3d, par défaut) ou plat (2d)',
    refusPossibles: ['rendu-invalide'],
    executer(ctx, { mode }) {
      if (mode !== '2d' && mode !== '3d') return refus('rendu-invalide');
      ctx.magasin.remplacer(definirRelief(ctx.magasin.lire(), mode === '3d'));
      return OK;
    },
  },
  couperSon: {
    nom: 'couperSon',
    description: 'Coupe ou rétablit le son (cliquetis et fanfare)',
    refusPossibles: [],
    executer(ctx, { coupe }) {
      const etat = ctx.magasin.lire();
      if (etat.sonCoupe !== coupe) ctx.magasin.remplacer(definirSonCoupe(etat, coupe));
      return OK;
    },
  },
  exporter: {
    nom: 'exporter',
    description: 'Télécharge la liste, les cadeaux, l’historique et les options dans un fichier JSON',
    refusPossibles: ['rotation-en-cours'],
    executer(ctx) {
      ctx.telecharger?.(ctx.magasin.lire());
      return OK;
    },
  },
  importer: {
    nom: 'importer',
    description: 'Remplace tout l’état par celui d’un fichier déjà validé',
    refusPossibles: ['rotation-en-cours'],
    executer(ctx, { etat }) {
      ctx.magasin.remplacer(etat);
      return OK;
    },
  },
};

const maintenant = (): Date => new Date();
const annonceDe = (ctx: Contexte): ControleAnnonce => ctx.annonce ?? annonceAbsente;
const cadeauExiste = (etat: Etat, index: number): boolean =>
  Number.isInteger(index) && index >= 0 && index < etat.cadeaux.length;

/** Vérifie l'état puis tire le gagnant, avant toute animation ; la roue ne fait que l'atteindre. */
function demarrer(ctx: Contexte, etat: Etat): Resultat {
  const raison = raisonLancementInterdit(etat);
  if (raison !== null) return refus(raison);
  ctx.lancer((ctx.tirer ?? tirerIndex)(etat.participants.length));
  return OK;
}

/** Contenu de l'annonce du dernier tirage de `apres`, la couleur étant lue dans `avant` (gagnant encore présent). */
function infoTirage(avant: Etat, apres: Etat, retraitPrevu: boolean): InfoAnnonce | null {
  const tirage = apres.historique[apres.historique.length - 1];
  if (!tirage) return null;
  const rang = avant.participants.findIndex((p) => p.id === tirage.participantId);
  const gagnant = avant.participants[rang];
  if (!gagnant) return null;
  const couleur = gagnant.couleur ?? couleursParDefaut(avant.participants.length)[rang] ?? '#888888';
  return { ordre: tirage.ordre, nom: tirage.nom, couleur, cadeau: tirage.cadeau, retraitPrevu };
}

/** Réglages d'affichage et de son : permis pendant une rotation (couper le son à ce moment est utile). */
const SANS_VERROU: ReadonlySet<NomAction> = new Set<NomAction>(['basculerRendu', 'couperSon']);

export interface Actions {
  /** Exécute une action ; refus avec code, jamais d'exception pour un refus attendu. */
  executer<N extends NomAction>(nom: N, params: ParametresActions[N]): Resultat;
  /** Pourquoi `lancer` serait refusé maintenant, `null` s'il est permis. */
  lancementInterdit(): CodeRefus | null;
  /** Pourquoi « Relancer » serait refusé maintenant (après le retrait éventuel du gagnant), `null` s'il est permis. */
  relancementInterdit(): CodeRefus | null;
  readonly magasin: Magasin;
}

export function creerActions(ctx: Contexte): Actions {
  return {
    magasin: ctx.magasin,
    executer<N extends NomAction>(nom: N, params: ParametresActions[N]): Resultat {
      const action: Action<N> = ACTIONS[nom];
      // Verrou F8 : toute action (sauf les réglages `SANS_VERROU`) est refusée pendant une rotation, aucune interface ne peut le contourner.
      if (ctx.enRotation() && !SANS_VERROU.has(nom)) return refus('rotation-en-cours');
      return action.executer(ctx, params);
    },
    lancementInterdit() {
      if (ctx.enRotation()) return 'rotation-en-cours';
      return raisonLancementInterdit(ctx.magasin.lire());
    },
    relancementInterdit() {
      if (ctx.enRotation()) return 'rotation-en-cours';
      if (!annonceDe(ctx).ouverte()) return 'annonce-fermee';
      return raisonLancementInterdit(retirerDernierGagnant(ctx.magasin.lire()));
    },
  };
}
