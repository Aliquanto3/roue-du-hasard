/**
 * Étage 1 du chat : règles (sans modèle ni réseau). Normalise la commande (accents, casse,
 * apostrophes, politesse), la découpe en étapes, reconnaît l'action par ses verbes, résout les noms
 * contre la liste (exact, phonétique, proche) et rend une décision.
 *
 * Prudence d'abord : quand une règle n'est pas sûre, l'étage rend `null` (étage suivant). Il ne rend
 * `refuser` que pour un refus certain : verrouillage (rotation, moins de 2 noms pour lancer), nom
 * absent sans voisin, consigne hostile ou truquage hors d'un nom, hors sujet évident. Un nom à
 * ajouter, renommer ou coller est une donnée : il reste tel que saisi, même s'il ressemble à une
 * consigne. La confirmation n'est jamais posée ici : `planifier` la calcule.
 */
import { formeComparable } from './outils';
import type { Decision, DecisionAction, Etage, EtatChat, FabriqueEtage, ResultatEtage } from './types';

// --- Texte aligné : `o` (original) et `n` (normalisé) ont toujours la même longueur ---------------

interface Texte {
  readonly o: string;
  readonly n: string;
}

const APOSTROPHES = /['’‘`´-]/u;

function carNorm(c: string): string {
  if (/\s/u.test(c) || APOSTROPHES.test(c)) return ' ';
  const d = c.normalize('NFD').charAt(0) || c;
  return d.toLowerCase().charAt(0) || ' ';
}

const creer = (o: string): Texte => ({ o, n: Array.from({ length: o.length }, (_, i) => carNorm(o.charAt(i))).join('') });

/** Normalisation d'une commande : sans accents ni casse, apostrophes et traits d'union en espaces. */
export function normaliser(texte: string): string {
  return compacter(creer(texte)).n;
}

const estBlanc = (c: string): boolean => /\s/u.test(c);

function compacter(t: Texte): Texte {
  let o = '';
  let n = '';
  let espace = true;
  for (let i = 0; i < t.n.length; i++) {
    const co = t.o.charAt(i);
    const cn = t.n.charAt(i);
    if (estBlanc(co)) {
      if (!espace) {
        o += ' ';
        n += ' ';
        espace = true;
      }
    } else {
      o += co;
      n += cn;
      espace = false;
    }
  }
  if (o.endsWith(' ')) {
    o = o.slice(0, -1);
    n = n.slice(0, -1);
  }
  return { o, n };
}

/** Blanchit les correspondances (sans toucher aux apostrophes et traits d'union de bord). */
function effacer(t: Texte, re: RegExp): Texte {
  const oa = t.o.split('');
  const na = t.n.split('');
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  for (const m of t.n.matchAll(g)) {
    let a = m.index;
    let b = m.index + m[0].length;
    const doux = (i: number): boolean => !estBlanc(t.o.charAt(i)) && t.n.charAt(i) === ' ';
    while (a < b && doux(a)) a++;
    while (b > a && doux(b - 1)) b--;
    for (let i = a; i < b; i++) {
      oa[i] = ' ';
      na[i] = ' ';
    }
  }
  return compacter({ o: oa.join(''), n: na.join('') });
}

const sous = (t: Texte, a: number, b: number = t.n.length): Texte =>
  compacter({ o: t.o.slice(a, b), n: t.n.slice(a, b) });

/** Texte après la correspondance d'un motif ancré au début de `n`. */
function apres(t: Texte, re: RegExp): Texte | null {
  const m = re.exec(t.n);
  if (!m) return null;
  let fin = m[0].length;
  // Verbe suivi d'un trait d'union (« ajoute-moi Inès ») : le pronom lié ne fait pas partie du nom.
  if (t.o.charAt(fin) === '-') {
    const pronom = /^-(?:moi|toi|lui|nous|vous|le|la|les|y|en)(?![\p{L}])/iu.exec(t.o.slice(fin));
    fin += pronom ? pronom[0].length : 1;
  }
  return sous(t, fin);
}

// --- Nettoyage : euh, politesse, formules d'ouverture et de fin --------------------------------

const EUH = /\b(?:euh+|heu+|hum+|hmm+|ben|bah)\b/;
const OUVERTURE = new RegExp(
  '^(?:allez|alors|bon|ok|dis|donc|et|puis|s il (?:te|vous) plait|stp|svp|' +
    '(?:est ce qu|est ce que) (?:tu|vous|on|je) peux|peux tu|tu peux|on|je voudrais|j aimerais|j aurais besoin|' +
    'il faudrait|bien|moi|me|que|de|d|pour|tu|vous)\\b[ ,:;]*',
);
/** Politesse de fin (README : « s'il te plaît »). */
const FIN_POLI = /[ ,;:]*(?:s il (?:te|vous) plait|stp|svp)[ ,;:.!?…]*$/;
/** Précision de fin retirée hors des verbes de données seulement : un nom extrait reste littéral. */
const FIN_TEMPS = /[ ,;:]*(?:vite fait)[ ,;:.!?…]*$/;
const PONCTUATION_FINALE = /[ !?…]+$/;

function nettoyer(brut: string): Texte {
  let t = compacter(effacer(creer(brut), EUH));
  for (let i = 0; i < 10; i++) {
    const avant = t.n;
    t = compacter(effacer(t, OUVERTURE));
    if (t.n === avant) break;
  }
  for (let i = 0; i < 6; i++) {
    const avant = t.n;
    t = compacter(effacer(t, FIN_POLI));
    t = compacter(effacer(t, PONCTUATION_FINALE));
    if (t.n === avant) break;
  }
  return t;
}

// --- Phonétique française simple ----------------------------------------------------------------

/** Clé phonétique : deux formes qui se prononcent (presque) pareil donnent la même clé. */
export function cleFrancaise(mot: string, souple = true): string {
  let s = mot.toLowerCase().replace(/ç/gu, 's').replace(/œ/gu, 'e');
  s = s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z]/g, '');
  if (souple) s = s.replace(/^h/, '');
  s = s
    .replace(/eau/g, 'o')
    .replace(/au/g, 'o')
    .replace(/ou/g, 'u')
    .replace(/oi/g, 'oa')
    .replace(/ph/g, 'f')
    .replace(/qu/g, 'k')
    .replace(/ch/g, 'x')
    .replace(/gn/g, 'n')
    .replace(/th/g, 't')
    .replace(/h/g, souple ? '' : 'h')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/g(?=[eiy])/g, 'j')
    .replace(/y/g, souple ? 'i' : 'y')
    .replace(/z/g, 's')
    .replace(/w/g, 'v')
    .replace(/(?:ain|aim|ein)(?![aeioumn])/g, 'I')
    .replace(/(?:in|im|un|um)(?![aeioumn])/g, 'I')
    .replace(/(?:an|am|en|em)(?![aeioumn])/g, 'A')
    .replace(/(?:on|om)(?![aeioumn])/g, 'O')
    .replace(/(?:ai|ei)/g, 'e')
    .replace(/(.)\1+/g, '$1');
  while (s.length > 2 && /[estdxp]$/.test(s)) s = s.slice(0, -1);
  return s;
}

// --- Résolution des noms de la liste --------------------------------------------------------------

/** Forme de comparaison d’un nom : sans accents, casse, apostrophes ni points (réutilisée par `oral.ts`). */
export const cle = (nom: string): string => formeComparable(nom.replace(/['’‘`´.]/gu, '')).replace(/\s+/gu, ' ');

export function distance(a: string, b: string): number {
  let ligne = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const suivante = [i];
    for (let j = 1; j <= b.length; j++) {
      suivante[j] = Math.min(
        (ligne[j] ?? 0) + 1,
        (suivante[j - 1] ?? 0) + 1,
        (ligne[j - 1] ?? 0) + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1),
      );
    }
    ligne = suivante;
  }
  return ligne[b.length] ?? 0;
}

export type Resolution =
  | { readonly t: 'ok'; readonly nom: string }
  | { readonly t: 'clarifier'; readonly candidats: readonly string[] }
  | { readonly t: 'absent' };

const unique = (noms: readonly string[]): string[] => {
  const vus = new Set<string>();
  return noms.filter((n) => (vus.has(cle(n)) ? false : (vus.add(cle(n)), true)));
};

/** Résout une forme saisie contre les noms de la liste (voir `docs/v1.1/README.md`, prénoms déformés). */
export function resoudreNom(brut: string, noms: readonly string[]): Resolution {
  const c = cle(brut.replace(/[.!?]+$/u, (m) => (/(?:^|\s)\p{L}\.$/u.test(brut) ? m : '')));
  if (c === '') return { t: 'absent' };
  const exacts = noms.filter((n) => cle(n) === c);
  if (exacts.length === 1) return { t: 'ok', nom: exacts[0] as string };
  if (exacts.length > 1) return { t: 'clarifier', candidats: exacts };
  const prefixes = noms.filter((n) => cle(n).startsWith(`${c} `) || cle(n).startsWith(`${c}-`));
  if (prefixes.length > 0) return { t: 'clarifier', candidats: prefixes };
  // Correction directe seulement si la clé stricte (h et y gardés) désigne un seul nom : « Anne » et « Hanne »,
  // « Maya » et « Maïa » sont deux prénoms réels qui se prononcent pareil, donc `clarifier`.
  const ks = cleFrancaise(c, false);
  if (ks.length >= 2) {
    const stricts = noms.filter((n) => cleFrancaise(n, false) === ks);
    const du = unique(stricts);
    if (du.length === 1) {
      return stricts.length === 1 ? { t: 'ok', nom: stricts[0] as string } : { t: 'clarifier', candidats: stricts };
    }
    if (du.length > 1) return { t: 'clarifier', candidats: du };
  }
  const k = cleFrancaise(c);
  if (k.length >= 2) {
    const souples = unique(noms.filter((n) => cleFrancaise(n) === k));
    if (souples.length > 0) return { t: 'clarifier', candidats: souples };
  }
  const proches = unique(
    noms.filter((n) => {
      const f = cle(n);
      const contenu = Math.min(f.length, c.length) >= 3 && (f.includes(c) || c.includes(f));
      return contenu || distance(f, c) <= (Math.max(f.length, c.length) > 5 ? 2 : 1);
    }),
  );
  return proches.length > 0 ? { t: 'clarifier', candidats: proches } : { t: 'absent' };
}

// --- Extraction littérale des nouveaux noms ------------------------------------------------------------

const NOM_PLAUSIBLE = /^\p{L}[\p{L}\p{M}'’.-]*(?: \p{L}[\p{L}\p{M}'’.-]*)?$/u;

function nettoyerNom(s: string): string {
  let r = s.trim().replace(/[!?…,]+$/u, '').trim();
  if (r.endsWith('.') && !/(?:^|\s)\p{L}\.$/u.test(r)) r = r.replace(/\.+$/u, '');
  return r.trim();
}

/**
 * Noms à ajouter, tels que saisis : liste à virgules, « et », « & » ou points-virgules si chaque
 * morceau a l'allure d'un nom (un ou deux mots, lettres seulement) ; sinon le texte entier est un seul nom.
 */
export function extraireNoms(texte: string): string[] {
  const entier = nettoyerNom(texte);
  if (entier === '') return [];
  const morceaux = texte
    .split(/\s*[,;&]\s*|\s+et\s+/iu)
    .map(nettoyerNom)
    .filter((m) => m !== '');
  if (morceaux.length > 1 && morceaux.every((m) => NOM_PLAUSIBLE.test(m))) return morceaux;
  return [entier];
}

// --- Détection des actions ---------------------------------------------------------------------------------

type Pas = DecisionAction;
type Res =
  | { readonly t: 'pas'; readonly pas: Pas[]; readonly regle: string }
  | { readonly t: 'refuser'; readonly code: string; readonly regle: string; readonly certain: boolean }
  | { readonly t: 'clarifier'; readonly candidats: readonly string[]; readonly regle: string }
  | null;

const pas = (regle: string, ...p: Pas[]): Res => ({ t: 'pas', pas: p, regle });
const refus = (code: string, regle: string): Res => ({ t: 'refuser', code, regle, certain: true });

const VERROUILLEES: ReadonlySet<string> = new Set([
  'ajouter',
  'coller',
  'renommer',
  'supprimer',
  'definirCouleur',
  'reinitialiserCouleur',
  'reinitialiserCouleurs',
  'lancer',
  'effacerHistorique',
  'annulerDernierTirage',
]);

/** Refus certain par verrouillage (README, « Verrouillage »), sinon `null`. */
function verrou(action: string, etat: EtatChat): Res {
  if (etat.rotation && VERROUILLEES.has(action)) return refus('verrouille', `verrou:${action}`);
  if (action === 'lancer' && etat.noms.length < 2) return refus('indisponible', 'verrou:lancer-moins-de-2');
  return null;
}

const COULEURS: Readonly<Record<string, string>> = {
  rouge: '#D62828',
  bleu: '#1D4ED8',
  vert: '#16A34A',
  orange: '#F97316',
  rose: '#EC4899',
  violet: '#7C3AED',
  noir: '#111111',
  blanc: '#FFFFFF',
};
const COULEUR = '(rouges?|bleue?s?|verte?s?|orange|roses?|violet(?:te)?s?|noire?s?|blanc(?:he)?s?)';
const hexDe = (mot: string): string | null => {
  const base = Object.keys(COULEURS).find((k) => mot.startsWith(k));
  return base ? (COULEURS[base] as string) : null;
};

const SEPARATEUR = /\s*,\s*|\s*;\s*|\s+et\s+|\s*&\s*/;
/** Découpe `t` en morceaux selon des séparateurs de liste. */
function decouper(t: Texte, re: RegExp = SEPARATEUR): Texte[] {
  const g = new RegExp(re.source, 'g');
  const out: Texte[] = [];
  let debut = 0;
  for (const m of t.n.matchAll(g)) {
    if (m[0].length === 0) continue;
    out.push(sous(t, debut, m.index));
    debut = m.index + m[0].length;
  }
  out.push(sous(t, debut));
  return out.filter((x) => x.n !== '');
}

/** Retire les répétitions de mots collés (« zoé zoe » après un « euh »). */
function sansBegaiement(t: Texte): Texte {
  const mots = [...t.n.matchAll(/\S+/g)];
  const oa = t.o.split('');
  const na = t.n.split('');
  for (let i = 1; i < mots.length; i++) {
    const p = mots[i - 1] as RegExpMatchArray;
    const m = mots[i] as RegExpMatchArray;
    const pi = p.index ?? 0;
    const mi = m.index ?? 0;
    if (p[0] === m[0] && cle(t.o.slice(pi, pi + p[0].length)) === cle(t.o.slice(mi, mi + m[0].length))) {
      for (let k = mi; k < mi + m[0].length; k++) {
        oa[k] = ' ';
        na[k] = ' ';
      }
    }
  }
  return compacter({ o: oa.join(''), n: na.join('') });
}

const MOTS_RESERVES = /\b(?:dernier|derniere|premier|premiere|tout|tous|toutes|personne|personnes|liste|historique|couleur|couleurs|cadeau|cadeaux|gagnant|gagnants|son|mode|tirage|roue|rotation)\b/;

type Noms = { t: 'noms'; noms: string[] } | Res;

/** Résout des morceaux de noms ; un seul morceau problématique donne la réponse, plusieurs donnent `null`. */
function resoudreMorceaux(morceaux: readonly Texte[], etat: EtatChat, regle: string): Noms {
  const noms: string[] = [];
  const problemes: Res[] = [];
  for (const m of morceaux) {
    const r = resoudreNom(m.o, etat.noms);
    if (r.t === 'ok') noms.push(r.nom);
    else if (r.t === 'clarifier') problemes.push({ t: 'clarifier', candidats: r.candidats, regle });
    else if (MOTS_RESERVES.test(m.n) || m.n.split(' ').length > 2) problemes.push(null);
    else problemes.push(refus('nom-absent', regle));
  }
  if (problemes.length === 0) return { t: 'noms', noms };
  return morceaux.length === 1 ? (problemes[0] ?? null) : null;
}

const debut = (re: RegExp, t: Texte): Texte | null => apres(t, re);

// Données : ajouter, coller, renommer.
const V_AJOUTER = /^(?:ajout\w*|rajout\w*|inscri\w*|incorpor\w*|integr\w*|add)\b/;
const V_COLLER = /^(?:coll\w*|import\w*|insere\w*|charge\w*)\b/;
const V_RENOMMER = /^(?:renomm\w*|chang\w* (?:le )?(?:nom|prenom)(?: de| d)?)\b/;
const DEBUT_DONNEES = new RegExp(`${V_AJOUTER.source}|${V_COLLER.source}|${V_RENOMMER.source}`);

function ajouter(t: Texte, etat: EtatChat): Res | undefined {
  const reste = debut(V_AJOUTER, t);
  if (!reste) return undefined;
  const cadeau = /^(?:(?:un|le|des|ce|nouveau|le nouveau|un nouveau) )?(cadeaux?)(?: :| -|:)? ?(?:(?:de|d) )?(?=\S)/.exec(reste.n);
  if (cadeau) {
    const objet = sous(reste, cadeau[0].length);
    const noms = cadeau[1] === 'cadeaux' ? extraireNoms(objet.o) : [nettoyerNom(objet.o)];
    if (noms.length === 0 || noms.some((n) => n === '')) return null;
    return pas('ajouterCadeau', ...noms.map((nom) => ({ action: 'ajouterCadeau', params: { nom } })));
  }
  const v = verrou('ajouter', etat);
  if (v) return v;
  let objet = reste;
  objet = apres(objet, /^(?:une? )?(?:personne|participante?|invitee?|prenom|nom)(?: nommee?| appelee?| :)? ?/) ?? objet;
  const fin = /\s(?:a|au|aux|sur) (?:la |le |les )?(?:liste|roue|tirage|participants?|jeu)(?:\s.*)?$/.exec(objet.n);
  if (fin) objet = sous(objet, 0, fin.index);
  const noms = extraireNoms(objet.o);
  if (noms.length === 0) return null;
  return pas('ajouter', ...noms.map((nom) => ({ action: 'ajouter', params: { nom } })));
}

function coller(t: Texte, etat: EtatChat): Res | undefined {
  const reste = debut(V_COLLER, t);
  if (!reste) return undefined;
  const v = verrou('coller', etat);
  if (v) return v;
  const deuxPoints = reste.n.indexOf(':');
  let texte: string;
  if (deuxPoints >= 0) texte = reste.o.slice(deuxPoints + 1).trim();
  else if (/^(?:mes|ma|mon|la|les|ces|une?) /.test(reste.n)) return null;
  else texte = reste.o.trim();
  return texte === '' ? null : pas('coller', { action: 'coller', params: { texte } });
}

function renommer(t: Texte, etat: EtatChat): Res | undefined {
  const reste = debut(V_RENOMMER, t);
  if (!reste) return undefined;
  const v = verrou('renommer', etat);
  if (v) return v;
  const sep = /\s(?:en|par|vers)\s/.exec(reste.n);
  if (!sep) return null;
  const ancien = sous(reste, 0, sep.index);
  const nouveau = nettoyerNom(reste.o.slice(sep.index + sep[0].length));
  if (nouveau === '' || ancien.n === '') return null;
  // « renomme A en B et C en D » : un second renommage caché dans le nouveau nom, ambigu.
  if (/(?:\set\s|[,;]|\spuis\s).*\s(?:en|par|vers)\s/.test(reste.n.slice(sep.index + sep[0].length))) return null;
  const r = resoudreNom(ancien.o, etat.noms);
  if (r.t === 'clarifier') return { t: 'clarifier', candidats: r.candidats, regle: 'renommer' };
  if (r.t === 'absent') return MOTS_RESERVES.test(ancien.n) ? null : refus('nom-absent', 'renommer');
  return pas('renommer', { action: 'renommer', params: { nom: r.nom, nouveau } });
}

// Hostile, truquage, hors sujet.
const HOSTILE = [
  /\b(?:ignor)\w*\s+(?:tes|vos|les|toutes?|ces|mes|ta|toute)\s+(?:les )?(?:instructions?|consignes?|regles?|directives?|ordres?|contraintes?)/,
  /^(?:systeme|system)\s*:/,
  /\b(?:prompt|system prompt|jailbreak|mot de passe|api key|cle api)\b/,
  /\b(?:tes|vos) (?:instructions?|consignes?|regles?)\b/,
  /\btu es (?:maintenant|desormais)\b|\bfais comme si\b|\bjoue le role\b|\bmode (?:developpeur|admin|dan)\b/,
];
const TRUQUAGE = [
  /\b(?:fai\w*|laiss\w*|fait)\s+gagn\w*/,
  /\b(?:truqu|manipul)\w*/,
  /\bfauss\w*\s+(?:le |la )?(?:tirage|roue)/,
  /\b(?:gagnant)\b.*\b(?:doit|devra|devrait|est|soit|va etre|c est)\b/,
  /\b(?:doit|devra|devrait|faut que|pour que|fais que)\b.*\b(?:gagne|gagnent|gagnera|gagner|remporte|tire)\b/,
  /\b(?:arrange|debrouille|assure|veille)\w*(?: toi)?\s+(?:a ce )?(?:pour )?que\b/,
  /\bsans (?:tirer|tirage)\b/,
  /\b(?:double|triple|augment\w*|multipli\w*|favoris\w*|booste\w*)\s+(?:la |les |sa |ses )?part\b/,
  /\bdesign\w*\b.*\bgagn\w*/,
];
const QUESTION =
  /\b(?:quel\w*|traduis|navigateur|mail|bonjour|merci)\b/;

function hostile(t: Texte): Res {
  if (DEBUT_DONNEES.test(t.n)) return null;
  if (HOSTILE.some((re) => re.test(t.n))) return refus('hostile', 'hostile');
  if (TRUQUAGE.some((re) => re.test(t.n))) return refus('truquage', 'truquage');
  return null;
}

// Actions par mots-clés.
function annuler(t: Texte, etat: EtatChat): Res | undefined {
  const n = t.n;
  const ok =
    (/\btirage\b/.test(n) &&
      /\b(?:annul|retir|supprim|suprim|efface|enlev)\w*/.test(n) &&
      /\b(?:dernier|derniere)\b/.test(n)) ||
    /^annul\w* (?:le |ce )?tirage\b/.test(n);
  if (!ok) return undefined;
  return verrou('annulerDernierTirage', etat) ?? pas('annuler', { action: 'annulerDernierTirage', params: {} });
}

function historique(t: Texte, etat: EtatChat): Res | undefined {
  if (!/\bhistorique\b/.test(t.n)) return undefined;
  if (!/\b(?:effa|vid|supprim|suprim|nettoy|purg|reinit|reset|raz|detrui|enlev|retir)\w*|\bremet\w* a zero\b/.test(t.n)) return undefined;
  return verrou('effacerHistorique', etat) ?? pas('historique', { action: 'effacerHistorique', params: {} });
}

function reinitCouleurs(t: Texte, etat: EtatChat): Res | undefined {
  const n = t.n;
  if (!/\bcouleurs?\b/.test(n)) return undefined;
  if (new RegExp(`\\ben (?:couleur )?${COULEUR}\\b`).test(n)) return undefined;
  const reinit =
    /\b(?:reinit|reset|restaur|retabli|defaut|origine|originale?s?|initiale?s?|d depart|de base|standard)\w*/.test(n) ||
    /\b(?:effa|enlev|retir|supprim|ote|annul)\w*\b.*\bcouleurs?\b/.test(n);
  if (!reinit) return undefined;
  if (/\b(?:toutes?|tous|chaque)\b|\bles couleurs\b/.test(n)) {
    return verrou('reinitialiserCouleurs', etat) ?? pas('couleurs', { action: 'reinitialiserCouleurs', params: {} });
  }
  const v = verrou('reinitialiserCouleur', etat);
  if (v) return v;
  const m =
    /^\w+ (.+?) (?:a|en) (?:sa|la|son) couleur\b/d.exec(n) ??
    /\bcouleur (?:de|d) (.+?)(?: (?:par defaut|d origine|a l origine|d depart|initiale|originale|de base))?$/d.exec(n);
  if (!m) return null;
  const idx = m.indices?.[1]?.[0] ?? 0;
  const nom = t.o.slice(idx, idx + (m[1] as string).length);
  const r = resoudreNom(nom, etat.noms);
  if (r.t === 'ok') return pas('couleur', { action: 'reinitialiserCouleur', params: { nom: r.nom } });
  if (r.t === 'clarifier') return { t: 'clarifier', candidats: r.candidats, regle: 'couleur' };
  return MOTS_RESERVES.test(nom) ? null : refus('nom-absent', 'couleur');
}

function cadeauSuivant(t: Texte): Res | undefined {
  return /\bcadeaux? suivant\b/.test(t.n)
    ? pas('cadeau-suivant', { action: 'afficherCadeauSuivant', params: {} })
    : undefined;
}

function gagnants(t: Texte): Res | undefined {
  const n = t.n;
  if (!/\b(?:gagnants?)\b/.test(n)) return undefined;
  // Sens sûr seulement : retirer (sans négation) = vrai ; ne plus retirer ou garder (sans négation) = faux.
  // « ne remets plus les gagnants » (négation et garder ensemble) est ambigu : `null`.
  const retire = /\b(?:retir|sor|enlev|ote|elimin|exclu|supprim)\w*/.test(n);
  const garde = /\b(?:gard|laiss|conserv|reintegr|decoch|desactiv|remet)\w*/.test(n);
  const negation = /\b(?:ne|n|pas|plus|jamais)\b/.test(n);
  if (retire && garde) return null;
  if (garde) return negation ? null : pas('gagnants', { action: 'retirerGagnants', params: { actif: false } });
  if (retire) return pas('gagnants', { action: 'retirerGagnants', params: { actif: !negation } });
  return undefined;
}

function projection(t: Texte): Res | undefined {
  const n = t.n;
  if (!/\bprojection\b/.test(n)) return undefined;
  if (/\b(?:desactiv|sor|ferm|coup|enlev|retir|stop|annul)\w*/.test(n)) {
    return pas('projection', { action: 'modeProjection', params: { actif: false } });
  }
  if (/\b(?:activ|lanc|met|pass|ouvr|entre|demarr|affich|bascul)\w*/.test(n)) {
    return pas('projection', { action: 'modeProjection', params: { actif: true } });
  }
  return null;
}

function son(t: Texte): Res | undefined {
  const n = t.n;
  if (!/\b(?:le|du|ce|mon|notre|sans|plus de|tout le|les) sons?\b|\bsourdine\b|\bmute\b/.test(n)) return undefined;
  if (/\b(?:coup|mute|desactiv|sourdine|silenc|baiss|stop|enlev|retir|supprim|ferm)\w*|\bsans son\b|\bplus de son\b/.test(n)) {
    return pas('son', { action: 'couperSon', params: { coupe: true } });
  }
  if (/\b(?:remet|reactiv|activ|retabli|rallum|allum|ouvr|restaur|reprend|rend|met)\w*/.test(n)) {
    return pas('son', { action: 'couperSon', params: { coupe: false } });
  }
  return null;
}

function rendu(t: Texte): Res | undefined {
  const n = t.n;
  const trois = /\b(?:3 ?d|trois ?d|relief|volume)\b/.test(n);
  const deux = /\b(?:2 ?d|plat\w*)\b/.test(n);
  if (!trois && !deux) return undefined;
  if (!/\b(?:pass|bascul|met|rendu|affichage|mode|activ)\w*/.test(n)) {
    return undefined;
  }
  if (trois && deux) return null;
  return pas('rendu', { action: 'basculerRendu', params: { mode: trois ? '3d' : '2d' } });
}

function exporter(t: Texte): Res | undefined {
  return /\b(?:export|sauvegard)\w*/.test(t.n) ? pas('exporter', { action: 'exporter', params: {} }) : undefined;
}

// Couleur d'une personne.
const V_COULEUR = /^(?:met\w*|pass\w*|chang\w*|donn\w*|defini\w*|appliqu\w*|fais|fait|rend\w*)\b/;

function definirCouleur(t: Texte, etat: EtatChat): Res | undefined {
  let reste = debut(V_COULEUR, t);
  if (!reste) return undefined;
  const fin = /\s+(?:et|mais)\s+(?:laisse\w*|garde\w*|conserve\w*|ne touche\w*|pas|sans toucher)\b.*$/.exec(reste.n);
  if (fin) reste = sous(reste, 0, fin.index);
  const f3 = new RegExp(`^(?:la |une )?couleur ${COULEUR} (?:a|pour) `).exec(reste.n);
  const f4 = new RegExp(`^en ${COULEUR} `).exec(reste.n);
  let items: { nom: Texte; hex: string }[] | null = null;
  const fabrique = (morceaux: Texte[], hex: string): { nom: Texte; hex: string }[] => morceaux.map((nom) => ({ nom, hex }));
  if (f3 || f4) {
    const m = (f3 ?? f4) as RegExpExecArray;
    const hex = hexDe(m[1] as string);
    if (!hex) return undefined;
    items = fabrique(decouper(sous(reste, m[0].length)), hex);
  } else {
    const corps = apres(reste, /^(?:la |sa )?couleur (?:de |d )?/) ?? reste;
    const re = new RegExp(`^(.+?) en (?:couleur )?${COULEUR}$`);
    const morceaux = decouper(corps);
    const sortie: { nom: Texte; hex: string }[] = [];
    let hex: string | null = null;
    for (let i = morceaux.length - 1; i >= 0; i--) {
      const mo = morceaux[i] as Texte;
      const m = re.exec(mo.n);
      if (m) {
        hex = hexDe(m[2] as string);
        if (!hex) return undefined;
        sortie.unshift({ nom: sous(mo, 0, (m[1] as string).length), hex });
      } else if (hex !== null && i < morceaux.length) {
        sortie.unshift({ nom: mo, hex });
      } else {
        return undefined;
      }
    }
    items = sortie;
  }
  if (items.length === 0) return undefined;
  const v = verrou('definirCouleur', etat);
  if (v) return v;
  const r = resoudreMorceaux(items.map((i) => i.nom), etat, 'definirCouleur');
  if (r?.t !== 'noms') return r;
  return pas('couleur', ...r.noms.map((nom, i) => ({ action: 'definirCouleur', params: { nom, couleur: (items as { hex: string }[])[i]?.hex } })));
}

// Suppression.
const V_SUPPRIMER = /^(?:supprim\w*|suprim\w*|retir\w*|enlev\w*|vir\w*|efface\w*|elimin\w*|ote\w*|degag\w*|jett\w*|exclu\w*)\b/;

function supprimer(t: Texte, etat: EtatChat): Res | undefined {
  let reste = debut(V_SUPPRIMER, t);
  if (!reste) return undefined;
  const v = verrou('supprimer', etat);
  if (v) return v;
  const garde = /\s+(?:et|mais)\s+(?:laisse\w*|garde\w*|conserve\w*|ne touche\w*|pas|sauf|sans toucher)\b.*$/.exec(reste.n);
  if (garde) reste = sous(reste, 0, garde.index);
  const lieu = /\s+(?:de|du|des|sur|depuis|hors de)(?: la| le| les| l)? (?:liste|roue|participants?|tirage|jeu|groupe)\b.*$/.exec(reste.n);
  if (lieu) reste = sous(reste, 0, lieu.index);
  const sauf = /^(?:tout le monde|tous les autres|tous|tout|toutes) (?:sauf|excepte|hors|a part|ormis|mis a part)\s+/.exec(reste.n);
  if (sauf) {
    const r = resoudreMorceaux(decouper(sous(reste, sauf[0].length)), etat, 'supprimer');
    if (r?.t !== 'noms') return null;
    const gardes = r.noms.map(cle);
    const aSupprimer = etat.noms.filter((n) => !gardes.includes(cle(n)));
    return aSupprimer.length === 0 ? null : pas('supprimer', ...aSupprimer.map((nom) => ({ action: 'supprimer', params: { nom } })));
  }
  const deux = /^(?:les )?(?:deux|2) /.exec(reste.n);
  if (deux) {
    const c = cle(sous(reste, deux[0].length).o);
    const trouves = etat.noms.filter((n) => cle(n) === c);
    return trouves.length === 2 ? pas('supprimer', ...trouves.map((nom) => ({ action: 'supprimer', params: { nom } }))) : null;
  }
  reste = apres(reste, /^(?:le |la |les |l |un |une |mon |ma |mes |moi |ce )?(?:(?:la personne|le participant|la participante|participante?|personne) )?/) ?? reste;
  reste = sansBegaiement(reste);
  if (reste.n === '') return null;
  const r = resoudreMorceaux(decouper(reste), etat, 'supprimer');
  if (r?.t !== 'noms') return r;
  return pas('supprimer', ...r.noms.map((nom) => ({ action: 'supprimer', params: { nom } })));
}

// Lancement.
const V_LANCER = /^(?:lanc\w*|relanc\w*|tourn\w*|demarr\w*|go|c est parti|on y va|tire au sort|fais tourner|fait tourner|faites tourner)\b/;
const OBJET_LANCER =
  /^(?:(?:la |une |le |ma |notre |un )?(?:roue|tirage|nouveau tirage|partie|loterie|tombola|machine)(?: de la chance)?|ca|cela|tout)?(?: (?:vite|maintenant))*$/;

function lancer(t: Texte, etat: EtatChat): Res | undefined {
  const reste = debut(V_LANCER, t);
  if (!reste) return undefined;
  if (!OBJET_LANCER.test(reste.n)) return null;
  return verrou('lancer', etat) ?? pas('lancer', { action: 'lancer', params: {} });
}

const ANALYSEURS: readonly ((t: Texte, etat: EtatChat) => Res | undefined)[] = [
  ajouter,
  coller,
  renommer,
  annuler,
  historique,
  reinitCouleurs,
  cadeauSuivant,
  gagnants,
  projection,
  son,
  rendu,
  exporter,
  definirCouleur,
  supprimer,
  lancer,
];

function traiterClause(brute: Texte, etat: EtatChat): Res {
  // Hors verbes de données, on retire la précision de fin ; un nom extrait reste littéral.
  const t = DEBUT_DONNEES.test(brute.n) ? brute : compacter(effacer(brute, FIN_TEMPS));
  if (t.n === '') return null;
  const h = hostile(t);
  if (h) return h;
  for (const a of ANALYSEURS) {
    const r = a(t, etat);
    if (r !== undefined) return r;
  }
  if (QUESTION.test(t.n)) return refus('hors-sujet', 'hors-sujet');
  return null;
}

// --- Découpage en étapes ---------------------------------------------------------------------------------

const V_DEBUT =
  /^(?:ajout|rajout|coll|renomm|supprim|suprim|retir|enlev|vir|efface|lanc|relanc|tourn|met|annul|coup|activ|desactiv|remet|export|affich|montr|pass|bascul|reinit|reset|vid)\w*\b/;

/** `null` si un « et » ou une virgule précède un mot qui est à la fois un verbe d'action et un nom de la liste. */
function decoupeClauses(t: Texte, noms: readonly string[]): Texte[] | null {
  const g = /\s*[,;]\s*|\s+(?:puis|et)\s+/g;
  const morceaux: Texte[] = [];
  let a = 0;
  for (const m of t.n.matchAll(g)) {
    const fin = m.index + m[0].length;
    const mot = /puis/.test(m[0]);
    const suite = t.n.slice(fin);
    const c = t.o.charAt(fin);
    const verbe = V_DEBUT.test(suite) && c !== '' && c === c.toLowerCase() && c !== c.toUpperCase();
    if (verbe && !mot) {
      const premier = cle(t.o.slice(fin).split(/[\s,;]/)[0] ?? '');
      if (noms.some((n) => cle(n) === premier || cle(n).split(' ')[0] === premier)) return null;
    }
    if (mot || verbe) {
      morceaux.push(sous(t, a, m.index));
      a = fin;
    }
  }
  morceaux.push(sous(t, a));
  return morceaux.filter((x) => x.n !== '');
}

/** Décision des règles, ou `null` si elles ne sont pas sûres. `regle` décrit ce qui a été appliqué. */
export function decideRegles(commande: string, etat: EtatChat): { decision: Decision; regle: string } | null {
  const t = nettoyer(commande);
  if (t.n === '') {
    return commande.trim() === '' ? null : { decision: { action: 'refuser', code: 'hors-sujet' }, regle: 'hors-sujet' };
  }
  const h = hostile(t) ?? (DEBUT_DONNEES.test(t.n) ? null : hostile(compacter(creer(commande))));
  if (h?.t === 'refuser') return { decision: { action: 'refuser', code: h.code }, regle: h.regle };
  const clauses = decoupeClauses(t, etat.noms);
  if (clauses === null) return null;
  const resultats = clauses.map((c) => traiterClause(c, etat));
  if (clauses.length === 1) {
    const r = resultats[0] ?? null;
    if (!r) return null;
    if (r.t === 'refuser') return { decision: { action: 'refuser', code: r.code }, regle: r.regle };
    if (r.t === 'clarifier') return { decision: { action: 'clarifier', candidats: r.candidats }, regle: r.regle };
    return { decision: unifier(r.pas), regle: r.regle };
  }
  const bloque = resultats.find((r) => r?.t === 'refuser' && (r.code === 'verrouille' || r.code === 'hostile' || r.code === 'truquage'));
  if (bloque?.t === 'refuser') return { decision: { action: 'refuser', code: bloque.code }, regle: bloque.regle };
  const tous: Pas[] = [];
  const regles: string[] = [];
  for (const r of resultats) {
    if (r?.t !== 'pas') return null;
    tous.push(...r.pas);
    regles.push(r.regle);
  }
  return { decision: unifier(tous), regle: regles.join('+') };
}

const unifier = (p: readonly Pas[]): Decision => (p.length === 1 ? (p[0] as Pas) : { actions: [...p] });

export const fabriqueRegles: FabriqueEtage = (): Etage => ({
  nom: 'regles',
  decider(commande, etat): Promise<ResultatEtage | null> {
    const r = decideRegles(commande, etat);
    return Promise.resolve(r === null ? null : { decision: r.decision, trace: { entree: commande, sortie: r.regle } });
  },
});
