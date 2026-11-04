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
import { cle, cleFrancaise, distance, normaliser } from './regles';

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

/** Mots de la commande ou de la langue qui ne sont jamais un prénom (verbes, mots-outils, couleurs). */
const MOTS_COMMUNS: ReadonlySet<string> = new Set(
  (
    'euh heu hum ben bah les des mon ton son sur par pas une aux ces mes tes ses nos vos que qui dans avec pour sans vers elle lui eux moi toi nous vous ' +
    'tout tous plus bien alors donc puis mais ' +
    'supprime supprimer retire retirer enleve enlever efface effacer vire virer ajoute ajouter rajoute inscris ' +
    'renomme renommer remplace remplacer change changer mets mettre met passe passer lance lancer tourne tourner ' +
    'montre montrer affiche afficher donne donner tire tirer fais faire peux veux voudrais ' +
    'couleur rouge bleu vert orange rose violet noir blanc jaune gris ' +
    'roue liste noms nom cadeau cadeaux suivant historique trois deux rendu mode premier dernier ' +
    'comme tirage personne personnes participant participants'
  ).split(' '),
);

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

const VERBES_AJOUT = /^(?:ajout|rajout|inscri)/;
const VERBES_RENOMMAGE = /^(?:renomm|rebaptis|appell)/;
const LIENS_NOM_NOUVEAU = new Set(['en', 'par', 'comme']);

/** Indice du premier mot qui est une donnée nouvelle (nom à ajouter ou à donner) ; `mots.length` sinon. */
function debutDonneeNouvelle(mots: readonly Mot[]): number {
  const formes = mots.map((m) => normaliser(m.coeur));
  const ajout = formes.findIndex((f) => VERBES_AJOUT.test(f));
  const renommage = formes.findIndex((f) => VERBES_RENOMMAGE.test(f));
  const lien = renommage < 0 ? -1 : formes.findIndex((f, i) => i > renommage && LIENS_NOM_NOUVEAU.has(f));
  return Math.min(ajout < 0 ? mots.length : ajout + 1, lien < 0 ? mots.length : lien + 1);
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
  if (c.length < LONGUEUR_MIN && !noms.some((n) => cle(n) === c)) return null;
  const ks = cleFrancaise(c, false);
  const k = cleFrancaise(c);
  const candidats: Candidat[] = [];
  for (const nom of noms) {
    const f = cle(nom);
    const longueur = Math.max(f.length, c.length);
    if (f === c) candidats.push({ nom, score: SCORE_EXACT, methode: 'exact' });
    else if (ks.length >= 2 && cleFrancaise(f, false) === ks) candidats.push({ nom, score: SCORE_PHONETIQUE, methode: 'phonetique' });
    else if (k.length >= 2 && cleFrancaise(f) === k) candidats.push({ nom, score: SCORE_PHONETIQUE_SOUPLE, methode: 'phonetique' });
    else {
      const d = distance(f, c);
      if (d <= (longueur > 5 ? 2 : 1)) {
        candidats.push({ nom, score: SCORE_PROCHE_MIN + SCORE_PROCHE_AMPLITUDE * (1 - d / longueur), methode: 'proche' });
      }
    }
  }
  if (candidats.length === 0) return null;
  const maxi = Math.max(...candidats.map((x) => x.score));
  const meilleurs = candidats.filter((x) => x.score === maxi);
  // Deux prénoms différents au même rang (Anne et Hanne) : à la cascade de demander lequel.
  if (new Set(meilleurs.map((x) => cle(x.nom))).size > 1) return null;
  return meilleurs[0] ?? null;
}

/** Rapproche chaque mot ou groupe de mots d'une commande dictée d'un prénom de la liste. */
export function rapprocher(commande: string, noms: readonly string[], seuil: number = SEUIL_CORRECTION): Rapprochement {
  const mots = decouper(commande);
  const limite = debutDonneeNouvelle(mots);
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
        if (candidat !== null) trouve = { candidat, n };
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

/** Vrai si le nom n'est pas dans la liste (comparaison sans accents ni casse). */
export const estNomNouveau = (nom: string, noms: readonly string[]): boolean => !noms.some((n) => cle(n) === cle(nom));
