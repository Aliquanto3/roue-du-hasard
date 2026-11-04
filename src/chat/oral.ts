/**
 * Prénoms à l'oral (6.3), sans DOM ni réseau. Le STT écorche les prénoms (« Thibaut » pour
 * « Thibault », « mari » pour « Marie ») : sur une commande dictée, chaque mot ou groupe de mots qui
 * ressemble à un prénom de la liste est rapproché de lui, par la clé phonétique et la proximité de
 * `regles.ts` (réutilisées, pas dupliquées). Chaque correction porte un score :
 * exact = 1, phonétique stricte = 0,9, phonétique souple = 0,75, proche = de 0,6 à 0,8 (selon la distance).
 *
 * Sous `SEUIL_CORRECTION`, la correction n'est pas appliquée en silence : le contrôleur montre la
 * commande corrigée avec une demande de confirmation. Le modèle n'intervient jamais ici, et rien
 * n'est décidé : le texte corrigé repart dans la cascade puis `planifier`.
 *
 * Les noms à ajouter ou à donner (`ajoute …`, `renomme X en …`) sont des données nouvelles : ils ne
 * sont pas rapprochés (un nom nouveau ressemble souvent à un nom existant sans l'être), mais le
 * contrôleur les fait toujours confirmer (`estNomNouveau`).
 */
import { cle, distance, normaliser, paliersNoms, V_AJOUTER, V_COLLER, V_COULEUR, V_LANCER, V_RENOMMER, V_SUPPRIMER } from './regles';

/**
 * Seuil de correction silencieuse, réglé sur le lot `dev` (catégorie « transcription orale ») :
 * les prénoms mal entendus de façon régulière (« mari », « pol » : même clé phonétique stricte, 0,9)
 * sont corrigés sans question ; les variantes d'orthographe (« Thibaut » : 0,8 au mieux) et les
 * rapprochements phonétiques souples (0,75) sont toujours confirmés, parce que deux prénoms réels
 * peuvent s'en approcher (Anne et Hanne, Maya et Maïa).
 */
export const SEUIL_CORRECTION = 0.85;

export const SCORE_EXACT = 1;
export const SCORE_PHONETIQUE = 0.9;
export const SCORE_PHONETIQUE_SOUPLE = 0.75;
const SCORE_PROCHE_MIN = 0.6;
const SCORE_PROCHE_AMPLITUDE = 0.2;
/** Mots plus courts : jamais rapprochés (articles, « en », « et »). */
const LONGUEUR_MIN = 3;
/** Un prénom dicté s'étend au plus sur trois mots (« Jean Pierre Louis »). */
const MOTS_MAX = 3;

export type MethodeCorrection = 'exact' | 'phonetique' | 'proche';

export interface Correction {
  /** Texte entendu. */
  readonly avant: string;
  /** Prénom de la liste. */
  readonly apres: string;
  readonly score: number;
  readonly methode: MethodeCorrection;
  /** Vrai si le score atteint le seuil : appliquée sans demander. */
  readonly appliquee: boolean;
}

export interface Rapprochement {
  /** Commande avec toutes les corrections faites (c'est elle qui part dans la cascade). */
  readonly texte: string;
  readonly corrections: readonly Correction[];
  /** Vrai si une correction n'atteint pas le seuil : confirmation obligatoire. */
  readonly aConfirmer: boolean;
}

/**
 * Mots de la langue ou de la commande qui ne sont jamais un prénom (mots-outils, couleurs, objets de la
 * roue). Les verbes viennent de `regles.ts` (`estVerbe`), pas d'une liste copiée ici.
 */
const MOTS_COMMUNS: ReadonlySet<string> = new Set(
  (
    'euh heu hum ben bah les des mon ton son sur par pas une aux ces mes tes ses nos vos que qui dans avec pour sans vers elle lui eux moi toi nous vous ' +
    'tout tous plus bien alors donc puis mais annule annuler vide vider efface ' +
    'couleur rouge bleu vert orange rose violet noir blanc jaune gris ' +
    'roue liste noms nom cadeau cadeaux suivant historique trois deux rendu mode premier dernier ' +
    'comme tirage personne personnes participant participants'
  ).split(' '),
);

const VERBES: readonly RegExp[] = [V_AJOUTER, V_COLLER, V_RENOMMER, V_SUPPRIMER, V_LANCER, V_COULEUR];
/** Vrai si le texte normalisé commence par un verbe de commande reconnu par les règles. */
const estVerbe = (formeNormalisee: string): boolean => VERBES.some((v) => v.test(formeNormalisee));

interface Mot {
  readonly debut: string;
  readonly coeur: string;
  readonly fin: string;
}

const MOT = /^([^\p{L}\p{M}]*)(.*?)([^\p{L}\p{M}]*)$/su;

const decouper = (texte: string): Mot[] =>
  texte
    .split(/\s+/u)
    .filter((m) => m !== '')
    .map((m) => {
      const r = MOT.exec(m);
      return { debut: r?.[1] ?? '', coeur: r?.[2] ?? m, fin: r?.[3] ?? '' };
    });

const LIENS_NOM_NOUVEAU = new Set(['en', 'par', 'comme']);

/** Indice du premier mot dont le texte (normalisé, jusqu'à la fin) commence par un verbe `verbe`, sinon -1. */
const premierVerbe = (formes: readonly string[], verbe: RegExp): number =>
  formes.findIndex((_, i) => verbe.test(formes.slice(i).join(' ')));

/**
 * Indice du premier mot qui est une donnée nouvelle (nom à ajouter, coller ou donner) ; `mots.length`
 * sinon. Les verbes sont ceux de `regles.ts` (ajouter, coller, renommer, y compris « change le nom de »).
 */
function debutDonneeNouvelle(mots: readonly Mot[]): number {
  const formes = mots.map((m) => normaliser(m.coeur));
  const ajout = Math.min(...[V_AJOUTER, V_COLLER].map((v) => premierVerbe(formes, v)).map((i) => (i < 0 ? mots.length : i + 1)));
  const renommage = premierVerbe(formes, V_RENOMMER);
  const lien = renommage < 0 ? -1 : formes.findIndex((f, i) => i > renommage && LIENS_NOM_NOUVEAU.has(f));
  return Math.min(ajout, lien < 0 ? mots.length : lien + 1);
}

interface Candidat {
  readonly nom: string;
  readonly score: number;
  readonly methode: MethodeCorrection;
}

/** Meilleur prénom de la liste pour une forme dictée ; `null` si rien, ou si deux prénoms se valent. */
function meilleur(forme: string, noms: readonly string[]): Candidat | null {
  const c = cle(forme);
  // Plusieurs mots : seulement un nom composé de même écriture (la clé phonétique avale les mots courts).
  if (forme.includes(' ')) {
    const mots = (s: string): string => s.replace(/[\s-]+/gu, ' ');
    const exact = noms.find((n) => mots(cle(n)) === mots(c));
    return exact === undefined ? null : { nom: exact, score: SCORE_EXACT, methode: 'exact' };
  }
  // Paliers de `resoudreNom` (exact, préfixe, clé stricte, clé souple, proche) : un seul fil de règles.
  const trouve = paliersNoms(c, noms);
  if (trouve === null || trouve.palier === 'prefixe') return null;
  if (trouve.palier !== 'exact' && c.length < LONGUEUR_MIN) return null;
  const distincts = new Set(trouve.noms.map((n) => cle(n)));
  // Deux prénoms différents au même palier (Marie et Mari) : à la cascade de demander lequel.
  const nom = trouve.noms[0] as string;
  if (distincts.size > 1) return null;
  switch (trouve.palier) {
    case 'exact':
      return { nom, score: SCORE_EXACT, methode: 'exact' };
    case 'strict':
      return { nom, score: SCORE_PHONETIQUE, methode: 'phonetique' };
    case 'souple':
      return { nom, score: SCORE_PHONETIQUE_SOUPLE, methode: 'phonetique' };
    default: {
      const f = cle(nom);
      const longueur = Math.max(f.length, c.length);
      const d = distance(f, c);
      if (d > (longueur > 5 ? 2 : 1)) return null;
      return { nom, score: SCORE_PROCHE_MIN + SCORE_PROCHE_AMPLITUDE * (1 - d / longueur), methode: 'proche' };
    }
  }
}

/** Rapproche chaque mot ou groupe de mots d'une commande dictée d'un prénom de la liste. */
export function rapprocher(commande: string, noms: readonly string[], seuil: number = SEUIL_CORRECTION): Rapprochement {
  const mots = decouper(commande);
  const limite = debutDonneeNouvelle(mots);
  const formes = mots.map((m) => normaliser(m.coeur));
  const sortie: string[] = [];
  const corrections: Correction[] = [];
  let i = 0;
  while (i < mots.length) {
    const mot = mots[i] as Mot;
    let trouve: { candidat: Candidat; n: number } | null = null;
    if (i < limite) {
      for (let n = Math.min(MOTS_MAX, limite - i); n >= 1 && trouve === null; n--) {
        const groupe = mots.slice(i, i + n);
        // Une ponctuation interne coupe le groupe ; un mot ordinaire n'est pas un prénom.
        if (groupe.some((m, j) => (j < n - 1 && m.fin !== '') || (j > 0 && m.debut !== ''))) continue;
        if (n === 1 && MOTS_COMMUNS.has(normaliser(mot.coeur))) continue;
        const candidat = meilleur(groupe.map((m) => m.coeur).join(' '), noms);
        // Un verbe de commande n'est jamais rapproché d'un prénom, sauf s'il en est déjà un (exact).
        const verbe = n === 1 && estVerbe(formes.slice(i).join(' '));
        if (candidat !== null && !(verbe && candidat.methode !== 'exact')) trouve = { candidat, n };
      }
    }
    if (trouve === null) {
      sortie.push(`${mot.debut}${mot.coeur}${mot.fin}`);
      i++;
      continue;
    }
    const groupe = mots.slice(i, i + trouve.n);
    const avant = groupe.map((m) => m.coeur).join(' ');
    const { nom, score, methode } = trouve.candidat;
    if (avant !== nom) corrections.push({ avant, apres: nom, score, methode, appliquee: score >= seuil });
    sortie.push(`${(groupe[0] as Mot).debut}${nom}${(groupe[groupe.length - 1] as Mot).fin}`);
    i += trouve.n;
  }
  return { texte: sortie.join(' '), corrections, aConfirmer: corrections.some((c) => !c.appliquee) };
}

/** Actions qui détruisent ou changent une donnée : une correction orale non exacte y est toujours confirmée. */
export const ACTIONS_DESTRUCTIVES: ReadonlySet<string> = new Set([
  'supprimer',
  'renommer',
  'effacerHistorique',
  'reinitialiserCouleurs',
  'retirerGagnants',
  'annulerDernierTirage',
]);

/**
 * Corrections à faire confirmer : celles sous le seuil et, pour une action destructive, toute correction
 * non exacte quel que soit son score (« supprime Mari » ne supprime pas Marie sans question).
 */
export function correctionsAConfirmer(r: Rapprochement, actions: readonly string[]): Correction[] {
  const destructive = actions.some((a) => ACTIONS_DESTRUCTIVES.has(a));
  return r.corrections.filter((c) => c.methode !== 'exact' && (!c.appliquee || destructive));
}

/**
 * Noms visés par la décision qui ne figurent pas tels quels dans la commande corrigée : la cascade
 * (règles ou modèle) les a rapprochés elle-même, sans score (« supprime Virgini » : « virgini »
 * ressemble au verbe « virer », `rapprocher` le laisse, et `resoudreNom` en fait Virginie).
 */
export function nomsNonEntendus(texte: string, vises: readonly string[]): string[] {
  const t = ` ${cle(texte).replace(/[^\p{L}\p{M}\p{N}-]+/gu, ' ')} `;
  return [...new Set(vises.filter((n) => cle(n) !== '' && !t.includes(` ${cle(n)} `)))];
}

/** Vrai si le nom n'est pas dans la liste (comparaison sans accents ni casse). */
export const estNomNouveau = (nom: string, noms: readonly string[]): boolean => !noms.some((n) => cle(n) === cle(nom));
