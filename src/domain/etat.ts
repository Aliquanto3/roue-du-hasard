/** Modèle d'état et opérations immuables (F1 à F3, F11 à F13, F19). Aucune couleur calculée ici. */
import { decouper, normaliserNom } from "./normalisation";

export interface Participant {
  readonly id: string;
  readonly nom: string;
  /** `#RRGGBB` personnalisé ; `null` = couleur par défaut (calculée par palette.ts). */
  readonly couleur: string | null;
}

/** Trace du retrait d'un gagnant (F19). Sa place se déduit de son id : voir `reinserer`. */
export interface Retrait {
  readonly couleur: string | null;
}

export interface Tirage {
  readonly ordre: number;
  readonly participantId: string;
  readonly nom: string;
  readonly cadeau: string | null;
  /** Le cadeau a été supprimé de la liste : annuler ce tirage n'a plus rien à rendre. */
  readonly cadeauSupprime: boolean;
  /** Horodatage ISO 8601. */
  readonly heure: string;
  readonly retrait: Retrait | null;
}

export interface Etat {
  readonly participants: readonly Participant[];
  readonly cadeaux: readonly string[];
  /** Nombre de cadeaux déjà attribués (le prochain est `cadeaux[attribues]`). */
  readonly attribues: number;
  readonly historique: readonly Tirage[];
  readonly retirerGagnants: boolean;
  readonly sonCoupe: boolean;
  /** Rendu en relief (F20) ; plat si faux. */
  readonly relief: boolean;
  readonly prochainId: number;
}

export type RaisonInterdit = "cadeaux-epuises" | "moins-de-2-noms";

export interface LibelleCadeau {
  readonly numero: number;
  readonly total: number;
  readonly nom: string;
}

const COULEUR = /^#[0-9a-fA-F]{6}$/;

export const idParticipant = (n: number): string => `p${String(n)}`;

export function etatInitial(): Etat {
  return {
    participants: [],
    cadeaux: [],
    attribues: 0,
    historique: [],
    retirerGagnants: false,
    sonCoupe: false,
    relief: true,
    prochainId: 1,
  };
}

// --- Participants ---------------------------------------------------------

function ajouterNoms(etat: Etat, noms: readonly string[]): Etat {
  if (noms.length === 0) return etat;
  let id = etat.prochainId;
  const nouveaux = noms.map((nom): Participant => ({ id: idParticipant(id++), nom, couleur: null }));
  return { ...etat, participants: [...etat.participants, ...nouveaux], prochainId: id };
}

/** Ajoute un seul nom (sans découpe) ; ignoré s'il est vide. */
export function ajouter(etat: Etat, brut: string): Etat {
  const nom = normaliserNom(brut);
  return nom === null ? etat : ajouterNoms(etat, [nom]);
}

/** Colle une liste (retours à la ligne, virgules, points-virgules). */
export function coller(etat: Etat, texte: string): Etat {
  return ajouterNoms(etat, decouper(texte));
}

/** Renomme ; un nom vide laisse l'état inchangé. */
export function renommer(etat: Etat, id: string, brut: string): Etat {
  const nom = normaliserNom(brut);
  if (nom === null || !etat.participants.some((p) => p.id === id)) return etat;
  return { ...etat, participants: etat.participants.map((p) => (p.id === id ? { ...p, nom } : p)) };
}

/** Couleur personnalisée `#RRGGBB`, ou `null` pour revenir à la défaut. Format invalide : inchangé. */
export function definirCouleur(etat: Etat, id: string, couleur: string | null): Etat {
  if (couleur !== null && !COULEUR.test(couleur)) return etat;
  const c = couleur === null ? null : couleur.toLowerCase();
  return { ...etat, participants: etat.participants.map((p) => (p.id === id ? { ...p, couleur: c } : p)) };
}

export function reinitialiserCouleurs(etat: Etat): Etat {
  return { ...etat, participants: etat.participants.map((p) => ({ ...p, couleur: null })) };
}

export function supprimer(etat: Etat, id: string): Etat {
  if (!etat.participants.some((p) => p.id === id)) return etat;
  return { ...etat, participants: etat.participants.filter((p) => p.id !== id) };
}

// --- Cadeaux (F11) --------------------------------------------------------

export function ajouterCadeau(etat: Etat, brut: string): Etat {
  const nom = normaliserNom(brut);
  return nom === null ? etat : { ...etat, cadeaux: [...etat.cadeaux, nom] };
}

export function collerCadeaux(etat: Etat, texte: string): Etat {
  const noms = decouper(texte);
  return noms.length === 0 ? etat : { ...etat, cadeaux: [...etat.cadeaux, ...noms] };
}

export function renommerCadeau(etat: Etat, index: number, brut: string): Etat {
  const nom = normaliserNom(brut);
  if (nom === null || index < 0 || index >= etat.cadeaux.length) return etat;
  return { ...etat, cadeaux: etat.cadeaux.map((c, i) => (i === index ? nom : c)) };
}

/**
 * Marque le tirage qui a reçu le cadeau `index`. Les `attribues` premiers cadeaux correspondent,
 * dans l'ordre, aux derniers tirages dont le cadeau existe encore. Après un effacement de
 * l'historique, le tirage peut ne plus exister : rien à marquer.
 */
function marquerCadeauSupprime(etat: Etat, index: number): readonly Tirage[] {
  let rang = etat.attribues - 1 - index;
  for (let i = etat.historique.length - 1; i >= 0; i--) {
    const t = etat.historique[i];
    if (!t || t.cadeau === null || t.cadeauSupprime) continue;
    if (rang === 0) return etat.historique.map((h, j) => (j === i ? { ...h, cadeauSupprime: true } : h));
    rang -= 1;
  }
  return etat.historique;
}

/** Supprime un cadeau ; s'il était déjà attribué, le compteur baisse et son tirage n'a plus à le rendre. */
export function supprimerCadeau(etat: Etat, index: number): Etat {
  if (index < 0 || index >= etat.cadeaux.length) return etat;
  const dejaAttribue = index < etat.attribues;
  return {
    ...etat,
    cadeaux: etat.cadeaux.filter((_, i) => i !== index),
    attribues: dejaAttribue ? etat.attribues - 1 : etat.attribues,
    historique: dejaAttribue ? marquerCadeauSupprime(etat, index) : etat.historique,
  };
}

/** Donnée « Cadeau n° n sur m : nom » du prochain cadeau ; `null` s'il n'y en a plus. */
export function libelleCadeau(etat: Etat): LibelleCadeau | null {
  const nom = etat.cadeaux[etat.attribues];
  if (nom === undefined) return null;
  return { numero: etat.attribues + 1, total: etat.cadeaux.length, nom };
}

export function cadeauxEpuises(etat: Etat): boolean {
  return etat.cadeaux.length > 0 && etat.attribues >= etat.cadeaux.length;
}

// --- Lancement ------------------------------------------------------------

/** Pourquoi le lancement par rotation est interdit (`null` s'il est permis). */
export function raisonLancementInterdit(etat: Etat): RaisonInterdit | null {
  if (cadeauxEpuises(etat)) return "cadeaux-epuises";
  if (etat.participants.length < 2) return "moins-de-2-noms";
  return null;
}

/** F19 : un seul nom et un cadeau restant, attribuables sans rotation. */
export function attributionSansRotationPossible(etat: Etat): boolean {
  return etat.participants.length === 1 && libelleCadeau(etat) !== null;
}

// --- Tirages --------------------------------------------------------------

/**
 * Enregistre le tirage de `participantId` et lui attribue le prochain cadeau.
 * Sans effet si le participant n'existe pas ou si les cadeaux sont épuisés.
 */
export function enregistrerTirage(etat: Etat, participantId: string, heure: Date | string): Etat {
  const gagnant = etat.participants.find((p) => p.id === participantId);
  if (!gagnant || cadeauxEpuises(etat)) return etat;
  const cadeau = etat.cadeaux[etat.attribues] ?? null;
  const dernier = etat.historique[etat.historique.length - 1];
  const tirage: Tirage = {
    ordre: (dernier?.ordre ?? 0) + 1,
    participantId: gagnant.id,
    nom: gagnant.nom,
    cadeau,
    cadeauSupprime: false,
    heure: typeof heure === "string" ? heure : heure.toISOString(),
    retrait: null,
  };
  return {
    ...etat,
    historique: [...etat.historique, tirage],
    attribues: cadeau === null ? etat.attribues : etat.attribues + 1,
  };
}

/**
 * Fermeture de l'annonce (F19) : sort le gagnant du dernier tirage de la roue si
 * `retirerGagnants` est coché. Opération distincte de `enregistrerTirage`.
 */
export function retirerDernierGagnant(etat: Etat): Etat {
  const dernier = etat.historique[etat.historique.length - 1];
  if (!etat.retirerGagnants || !dernier || dernier.retrait) return etat;
  const position = etat.participants.findIndex((p) => p.id === dernier.participantId);
  const gagnant = etat.participants[position];
  if (!gagnant) return etat;
  const trace: Tirage = { ...dernier, retrait: { couleur: gagnant.couleur } };
  return {
    ...etat,
    participants: etat.participants.filter((_, i) => i !== position),
    historique: [...etat.historique.slice(0, -1), trace],
  };
}

/** F19 : attribue le seul nom restant sans rotation, puis le retire si l'option est cochée. */
export function attribuerSansRotation(etat: Etat, heure: Date | string): Etat {
  const seul = etat.participants[0];
  if (!attributionSansRotationPossible(etat) || !seul) return etat;
  return retirerDernierGagnant(enregistrerTirage(etat, seul.id, heure));
}

const numeroParticipant = (id: string): number => Number(id.slice(1));

/**
 * Remet un participant à sa place d'origine. Aucune opération ne réordonne la liste et les ids
 * croissent à chaque ajout : la liste suit l'ordre des ids, quels que soient les ajouts et
 * suppressions intervenus depuis le retrait. Une future fonction de tri devra revoir ce point.
 */
function reinserer(participants: readonly Participant[], remis: Participant): readonly Participant[] {
  const numero = numeroParticipant(remis.id);
  const suivant = participants.findIndex((p) => numeroParticipant(p.id) > numero);
  if (suivant < 0) return [...participants, remis];
  return [...participants.slice(0, suivant), remis, ...participants.slice(suivant)];
}

/** Annule le dernier tirage : rend le cadeau s'il existe encore et remet le gagnant retiré à sa place. */
export function annulerDernierTirage(etat: Etat): Etat {
  const dernier = etat.historique[etat.historique.length - 1];
  if (!dernier) return etat;
  let participants = etat.participants;
  if (dernier.retrait && !participants.some((p) => p.id === dernier.participantId)) {
    const remis: Participant = { id: dernier.participantId, nom: dernier.nom, couleur: dernier.retrait.couleur };
    participants = reinserer(participants, remis);
  }
  const rendCadeau = dernier.cadeau !== null && !dernier.cadeauSupprime && etat.attribues > 0;
  return {
    ...etat,
    participants,
    historique: etat.historique.slice(0, -1),
    attribues: rendCadeau ? etat.attribues - 1 : etat.attribues,
  };
}

export function recommencerAttributions(etat: Etat): Etat {
  return etat.attribues === 0 ? etat : { ...etat, attribues: 0 };
}

export function effacerHistorique(etat: Etat): Etat {
  return etat.historique.length === 0 ? etat : { ...etat, historique: [] };
}

export function definirRetirerGagnants(etat: Etat, valeur: boolean): Etat {
  return { ...etat, retirerGagnants: valeur };
}

export function definirSonCoupe(etat: Etat, valeur: boolean): Etat {
  return { ...etat, sonCoupe: valeur };
}

export function definirRelief(etat: Etat, valeur: boolean): Etat {
  return etat.relief === valeur ? etat : { ...etat, relief: valeur };
}
