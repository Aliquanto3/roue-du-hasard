/**
 * Données de la fenêtre d'inspection (5.7), sans DOM : construction d'une entrée par message à partir
 * des traces de la cascade, verdict manuel, tableau de bord, export relu par le banc 5.2, stockage
 * plafonné en `localStorage`. Tout est une donnée : la vue la rend avec `textContent`.
 */
import { confirmationRequise, type Plan } from './outils';
import { MAX_ECHANGES, estimerJetons, type MessageOllama, type TraceSlm } from './slm';
import type { TraceDecision } from './decision';
import {
  estEtapes,
  formeValide,
  type Decision,
  type DecisionAction,
  type Etage,
  type EtatChat,
  type NomEtage,
  type ResultatCascade,
} from './types';

/** Fenêtre de contexte visée pour les modèles locaux (4K, voir `docs/v1.1-chat-slm.md`), en jetons estimés. */
export const LIMITE_JETONS = 4096;
/** Nombre maximal de messages gardés : au-delà, les plus anciens sont oubliés. */
export const MAX_ENTREES = 500;
/** Taille sérialisée maximale gardée en `localStorage` (caractères, ~1,5 Mo) : au-delà, les plus anciennes entrées sont retirées. */
export const MAX_OCTETS = 1_500_000;
export const CLE_INSPECTION = 'roue-du-hasard:chat:inspection';
export const FORMAT_EXPORT = 'roue-inspection';
export const VERSION_EXPORT = 1;

export type CauseErreur = 'ecoute' | 'decision';
export interface Verdict {
  readonly valeur: 'juste' | 'erreur';
  /** Seulement pour une erreur : mal entendu (voix, 6.3) ou mal décidé. */
  readonly cause?: CauseErreur;
}

export type Execution =
  | 'execute'
  | 'attente-confirmation'
  | 'attente-precision'
  | 'non-execute'
  | 'annule'
  | 'perime';

export interface ContexteInspecte {
  readonly messages: readonly MessageOllama[];
  readonly jetons: number;
  readonly limite: number;
  /** Ce qui n'a pas été transmis au modèle, en clair. */
  readonly coupes: readonly string[];
}

export interface AppelOutilInspecte {
  readonly nom: string;
  readonly arguments: unknown;
}

export interface EtageInspecte {
  readonly etage: NomEtage;
  readonly dureeMs: number;
  /** Code de passage de main ; `null` si l'étage a décidé. */
  readonly raison: string | null;
  readonly erreur: string | null;
  /** Règle reconnue (étage règles) ; `null` sinon. */
  readonly regle: string | null;
  readonly contexte: ContexteInspecte | null;
  /** Sortie brute : texte du modèle, ou réponses de l'étage décision. */
  readonly sortie: string | null;
  /** Probabilités par question puis par option (étage décision) ; `null` sinon. */
  readonly probabilites: Readonly<Record<string, Readonly<Record<string, number>> | number>> | null;
  readonly appelsOutils: readonly AppelOutilInspecte[];
  /** Validation en une ligne : schéma, seuil, code de refus. */
  readonly validation: string;
}

export interface PlanInspecte {
  readonly genre: Plan['genre'];
  readonly detail: string;
  readonly confirmation: boolean;
}

export interface DonneesEntree {
  readonly commande: string;
  readonly etat: EtatChat;
  readonly decision: Decision;
  readonly etage: NomEtage | null;
  readonly confiance: number | null;
  readonly etages: readonly EtageInspecte[];
  readonly plan: PlanInspecte;
  readonly execution: Execution;
  readonly latenceMs: number;
}

export interface EntreeInspection extends DonneesEntree {
  readonly id: string;
  readonly horodatage: string;
  readonly verdict: Verdict | null;
  /** Décision attendue, précisée par l'utilisateur (facultatif). */
  readonly attendu: Decision | null;
  /** Décision et plan de la clarification, quand la décision ci-dessus est celle corrigée par le choix de l'utilisateur. */
  readonly clarification?: { readonly decision: Decision; readonly plan: PlanInspecte };
}

// --- Construction ----------------------------------------------------------------

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

type EtageTracable = Etage & { derniereTrace(): unknown };
const aUneTrace = (e: Etage): e is EtageTracable => typeof (e as { derniereTrace?: unknown }).derniereTrace === 'function';

/** Actions d'une décision : une par étape, ou `refuser` / `clarifier`. */
export function actionsDeDecision(d: Decision): string[] {
  if (estEtapes(d)) return [...new Set(d.actions.map((a) => a.action))];
  return [(d as DecisionAction).action];
}


export function decrirePlan(plan: Plan): PlanInspecte {
  if (plan.genre === 'refuser') return { genre: 'refuser', detail: `refus : ${plan.code}`, confirmation: false };
  if (plan.genre === 'clarifier') {
    return { genre: 'clarifier', detail: `clarifier : ${plan.candidats.join(', ')}`, confirmation: false };
  }
  return {
    genre: 'etapes',
    detail: `${String(plan.etapes.length)} étape(s)`,
    confirmation: plan.confirmation,
  };
}

function coupesSlm(etat: EtatChat): string[] {
  const coupes: string[] = [];
  const retires = (etat.historique?.length ?? 0) - MAX_ECHANGES;
  if (retires > 0) coupes.push(`historique : ${String(retires)} échange(s) ancien(s) retiré(s) (maximum ${String(MAX_ECHANGES)})`);
  if ((etat.cadeaux?.length ?? 0) > 1) coupes.push('cadeaux : seul le prochain est transmis');
  return coupes;
}

function coupesDecision(etat: EtatChat): string[] {
  const coupes: string[] = [];
  if ((etat.historique?.length ?? 0) > 0) coupes.push('historique : non transmis à ce modèle');
  if ((etat.cadeaux?.length ?? 0) > 0) coupes.push('cadeaux : non transmis à ce modèle');
  return coupes;
}

const contexte = (messages: readonly MessageOllama[], coupes: string[]): ContexteInspecte => {
  const jetons = estimerJetons(messages);
  const tout = jetons > LIMITE_JETONS ? [...coupes, `taille estimée au-delà de la limite (${String(LIMITE_JETONS)} jetons)`] : coupes;
  return { messages, jetons, limite: LIMITE_JETONS, coupes: tout };
};

export interface ParametresEntree {
  readonly commande: string;
  readonly etat: EtatChat;
  readonly resultat: ResultatCascade;
  /** Étages de la cascade : leur dernière trace détaillée (SLM, décision) est lue après la décision. */
  readonly etages: readonly Etage[];
  readonly plan: Plan;
  readonly execution: Execution;
  readonly seuilDecision: number;
}

/** Construit l'entrée d'un message depuis le résultat de la cascade et les traces détaillées des étages. */
export function construireEntree(p: ParametresEntree): DonneesEntree {
  const { resultat, etat } = p;
  const etages: EtageInspecte[] = resultat.traces.map((t) => {
    const decide = resultat.etage === t.etage && t.raison === undefined && t.erreur === undefined;
    const base = {
      etage: t.etage,
      dureeMs: t.dureeMs,
      raison: t.raison ?? null,
      erreur: t.erreur ?? null,
      regle: null as string | null,
      contexte: null as ContexteInspecte | null,
      sortie: t.sortie,
      probabilites: null as EtageInspecte['probabilites'],
      appelsOutils: [] as AppelOutilInspecte[],
    };
    const source = p.etages.find((e) => e.nom === t.etage);
    const brute = source !== undefined && aUneTrace(source) ? source.derniereTrace() : null;
    if (t.erreur !== undefined) return { ...base, validation: `erreur : ${t.erreur}` };
    if (t.etage === 'regles') {
      const regle = decide ? t.sortie : null;
      return { ...base, regle, validation: decide ? 'règle reconnue' : 'aucune règle ne correspond' };
    }
    if (t.etage === 'slm' && estObjet(brute)) {
      const trace = brute as unknown as TraceSlm;
      const rejet = trace.rejet;
      return {
        ...base,
        contexte: contexte(trace.messages, coupesSlm(etat)),
        sortie: trace.reponseBrute ?? t.sortie,
        appelsOutils: trace.appelsOutils.map((a) => ({ nom: a.nom, arguments: a.arguments })),
        validation: rejet === null ? 'schéma de l’outil respecté, forme valide' : `rejeté : ${rejet}`,
      };
    }
    if (t.etage === 'decision' && estObjet(brute)) {
      const trace = brute as unknown as TraceDecision;
      const rejet = trace.rejet;
      const sorties = trace.appels.map((a) => a.reponseBrute).filter((s): s is string => s !== null);
      return {
        ...base,
        contexte: contexte(trace.messages, coupesDecision(etat)),
        sortie: sorties.length > 0 ? sorties.join('\n') : t.sortie,
        probabilites: trace.probabilites,
        validation:
          rejet === null
            ? `probabilités valides, seuil ${String(p.seuilDecision)} atteint`
            : `passe la main (seuil ${String(p.seuilDecision)}) : ${rejet}`,
      };
    }
    const validation =
      t.erreur !== undefined ? `erreur : ${t.erreur}` : t.raison !== undefined ? `passe la main : ${t.raison}` : 'étage inactif ou sans résultat';
    return { ...base, validation };
  });
  return {
    commande: p.commande,
    etat,
    decision: resultat.decision,
    etage: resultat.etage,
    confiance: resultat.confiance ?? null,
    etages,
    plan: decrirePlan(p.plan),
    execution: p.execution,
    latenceMs: resultat.traces.reduce((n, t) => n + t.dureeMs, 0),
  };
}

// --- Tableau de bord ---------------------------------------------------------------

export interface Taux {
  readonly justes: number;
  readonly erreurs: number;
}

export interface Tableau {
  readonly total: Taux;
  readonly parEtage: Readonly<Record<string, Taux>>;
  readonly parAction: Readonly<Record<string, Taux>>;
  /** Messages notés « erreur », du plus récent au plus ancien. */
  readonly aRevoir: readonly EntreeInspection[];
}

/** Taux de commandes justes (justes / verdicts) ; `null` sans verdict. */
export const tauxJustes = (t: Taux): number | null => (t.justes + t.erreurs === 0 ? null : t.justes / (t.justes + t.erreurs));

const ajouterVerdict = (table: Record<string, Taux>, cle: string, juste: boolean): void => {
  const t = table[cle] ?? { justes: 0, erreurs: 0 };
  table[cle] = { justes: t.justes + (juste ? 1 : 0), erreurs: t.erreurs + (juste ? 0 : 1) };
};

export const ETAGE_AUCUN = 'aucun';

export function calculerTableau(entrees: readonly EntreeInspection[]): Tableau {
  const parEtage: Record<string, Taux> = {};
  const parAction: Record<string, Taux> = {};
  let justes = 0;
  let erreurs = 0;
  for (const e of entrees) {
    if (e.verdict === null) continue;
    const juste = e.verdict.valeur === 'juste';
    if (juste) justes++;
    else erreurs++;
    ajouterVerdict(parEtage, e.etage ?? ETAGE_AUCUN, juste);
    for (const a of actionsDeDecision(e.decision)) ajouterVerdict(parAction, a, juste);
  }
  return {
    total: { justes, erreurs },
    parEtage,
    parAction,
    aRevoir: entrees.filter((e) => e.verdict?.valeur === 'erreur').reverse(),
  };
}

// --- Export et relecture par le banc -------------------------------------------------

/** Ligne exportée : la forme d'une ligne du corpus du banc (`commande`, `etat`), plus la décision obtenue et le verdict. */
export interface LigneExport {
  readonly id: string;
  readonly commande: string;
  readonly etat: EtatChat;
  readonly obtenu: Decision;
  readonly etage: NomEtage | null;
  readonly verdict: Verdict | null;
  readonly attendu?: Decision;
}

export interface DocumentExport {
  readonly format: typeof FORMAT_EXPORT;
  readonly version: typeof VERSION_EXPORT;
  readonly exporteLe: string;
  readonly lignes: readonly LigneExport[];
}

export function creerExport(entrees: readonly EntreeInspection[], maintenant: Date): DocumentExport {
  return {
    format: FORMAT_EXPORT,
    version: VERSION_EXPORT,
    exporteLe: maintenant.toISOString(),
    lignes: entrees.map((e) => ({
      id: e.id,
      commande: e.commande,
      etat: e.etat,
      obtenu: e.decision,
      etage: e.etage,
      verdict: e.verdict,
      ...(e.attendu === null ? {} : { attendu: e.attendu }),
    })),
  };
}

export const nomFichierInspection = (d: Date): string => {
  const deux = (n: number): string => String(n).padStart(2, '0');
  return `roue-inspection-${String(d.getFullYear())}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}.json`;
};

/** Ligne de corpus du banc (même forme que `LigneCorpus` de `src/banc/comparateur.ts`). */
export interface LigneCorpusInspection {
  readonly id: string;
  readonly lot: 'dev' | 'test' | 'test2';
  readonly categorie: string;
  readonly commande: string;
  readonly etat: EtatChat;
  readonly attendu: Decision;
  readonly confirmation: boolean;
}

export const CATEGORIE_INSPECTION = 'inspection';

/**
 * Lignes d'essai tirées d'un export : l'`attendu` est celui que l'utilisateur a précisé ; à défaut,
 * la décision obtenue si le verdict est « juste ». Une erreur sans `attendu`, ou un message sans
 * verdict, n'a pas de réponse connue : la ligne est écartée. Lève une erreur si le document est invalide.
 */
export function versCorpus(texte: string, lot: 'dev' | 'test' | 'test2'): LigneCorpusInspection[] {
  const doc: unknown = JSON.parse(texte);
  if (!estObjet(doc) || doc['format'] !== FORMAT_EXPORT || !Array.isArray(doc['lignes'])) {
    throw new Error(`export d’inspection invalide (format « ${FORMAT_EXPORT} » attendu)`);
  }
  const lignes: LigneCorpusInspection[] = [];
  for (const brute of doc['lignes'] as unknown[]) {
    if (!estObjet(brute) || typeof brute['commande'] !== 'string' || !estObjet(brute['etat'])) continue;
    const verdict = estObjet(brute['verdict']) ? brute['verdict']['valeur'] : null;
    const attendu = formeValide(brute['attendu']) ? brute['attendu'] : verdict === 'juste' && formeValide(brute['obtenu']) ? brute['obtenu'] : null;
    if (attendu === null) continue;
    lignes.push({
      id: typeof brute['id'] === 'string' ? brute['id'] : `inspection-${String(lignes.length + 1)}`,
      lot,
      categorie: CATEGORIE_INSPECTION,
      commande: brute['commande'],
      etat: brute['etat'] as unknown as EtatChat,
      attendu,
      confirmation: confirmationRequise(attendu),
    });
  }
  return lignes;
}

// --- Stockage plafonné ----------------------------------------------------------------

type Stockage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const verdictValide = (v: unknown): v is Verdict =>
  estObjet(v) && (v['valeur'] === 'juste' || v['valeur'] === 'erreur') && (v['cause'] === undefined || v['cause'] === 'ecoute' || v['cause'] === 'decision');

const EXECUTIONS: readonly string[] = ['execute', 'attente-confirmation', 'attente-precision', 'non-execute', 'annule', 'perime'];
const ETAGES: readonly string[] = ['regles', 'decision', 'slm'];
const estTexte = (v: unknown): v is string => typeof v === 'string';
const estNombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const tableauDe = (v: unknown, test: (x: unknown) => boolean): boolean => Array.isArray(v) && (v as unknown[]).every(test);

const planValide = (p: unknown): boolean =>
  estObjet(p) && ['etapes', 'clarifier', 'refuser'].includes(p['genre'] as string) && estTexte(p['detail']) && typeof p['confirmation'] === 'boolean';

const contexteValide = (c: unknown): boolean =>
  c === null ||
  (estObjet(c) &&
    estNombre(c['jetons']) &&
    estNombre(c['limite']) &&
    tableauDe(c['coupes'], estTexte) &&
    tableauDe(c['messages'], (m) => estObjet(m) && estTexte(m['role']) && estTexte(m['content'])));

const etageValide = (x: unknown): boolean =>
  estObjet(x) &&
  ETAGES.includes(x['etage'] as string) &&
  estNombre(x['dureeMs']) &&
  (x['raison'] === null || estTexte(x['raison'])) &&
  (x['erreur'] === null || estTexte(x['erreur'])) &&
  (x['regle'] === null || estTexte(x['regle'])) &&
  (x['sortie'] === null || estTexte(x['sortie'])) &&
  (x['probabilites'] === null || estObjet(x['probabilites'])) &&
  tableauDe(x['appelsOutils'], (a) => estObjet(a) && estTexte(a['nom'])) &&
  estTexte(x['validation']) &&
  contexteValide(x['contexte']);

/** Validation en profondeur : une entrée altérée dans le stockage est écartée, jamais rendue. */
const entreeValide = (v: unknown): v is EntreeInspection =>
  estObjet(v) &&
  estTexte(v['id']) &&
  estTexte(v['horodatage']) &&
  estTexte(v['commande']) &&
  estObjet(v['etat']) &&
  tableauDe(v['etat']['noms'], estTexte) &&
  typeof v['etat']['rotation'] === 'boolean' &&
  formeValide(v['decision']) &&
  (v['etage'] === null || ETAGES.includes(v['etage'] as string)) &&
  (v['confiance'] === null || estNombre(v['confiance'])) &&
  tableauDe(v['etages'], etageValide) &&
  planValide(v['plan']) &&
  EXECUTIONS.includes(v['execution'] as string) &&
  estNombre(v['latenceMs']) &&
  (v['verdict'] === null || verdictValide(v['verdict'])) &&
  (v['attendu'] === null || formeValide(v['attendu'])) &&
  (v['clarification'] === undefined ||
    (estObjet(v['clarification']) && formeValide(v['clarification']['decision']) && planValide(v['clarification']['plan'])));

export interface Inspection {
  /** Du plus ancien au plus récent. */
  entrees(): readonly EntreeInspection[];
  ajouter(donnees: DonneesEntree): string;
  mettreAJour(id: string, execution: Execution): void;
  /** Remplace la décision et le plan par ceux réellement exécutés après une clarification ; garde les premiers dans `clarification`. */
  corriger(id: string, decision: Decision, plan: PlanInspecte): void;
  /** `null` retire le verdict. */
  poserVerdict(id: string, verdict: Verdict | null, attendu?: Decision | null): void;
  effacer(): void;
  /** Faux si le stockage est inaccessible ou plein : l'historique ne survit pas au rechargement. */
  stockageDisponible(): boolean;
  exporter(maintenant?: Date): string;
  abonner(fn: () => void): () => void;
}

export interface OptionsInspection {
  readonly stockage: () => Stockage;
  readonly maintenant?: () => Date;
  readonly plafond?: number;
  /** Taille sérialisée maximale (tests). */
  readonly maxOctets?: number;
}

export function creerInspection(options: OptionsInspection): Inspection {
  const plafond = options.plafond ?? MAX_ENTREES;
  const maxOctets = options.maxOctets ?? MAX_OCTETS;
  const maintenant = options.maintenant ?? (() => new Date());
  let liste: EntreeInspection[] = [];
  let disponible = true;
  let prochain = 1;
  const abonnes = new Set<() => void>();

  try {
    const brut = options.stockage().getItem(CLE_INSPECTION);
    if (brut !== null) {
      const v: unknown = JSON.parse(brut);
      if (Array.isArray(v)) liste = (v as unknown[]).filter(entreeValide).slice(-plafond);
    }
  } catch {
    disponible = false;
  }

  const ecrire = (): void => {
    try {
      let texte = JSON.stringify(liste);
      // Plafond en taille (quota du stockage) : les entrées les plus anciennes partent d'abord, la dernière reste.
      while (texte.length > maxOctets && liste.length > 1) {
        liste = liste.slice(1);
        texte = JSON.stringify(liste);
      }
      options.stockage().setItem(CLE_INSPECTION, texte);
      disponible = true;
    } catch {
      disponible = false;
    }
  };
  const changer = (nouvelle: EntreeInspection[]): void => {
    liste = nouvelle;
    ecrire();
    for (const fn of [...abonnes]) fn();
  };
  const remplacer = (id: string, f: (e: EntreeInspection) => EntreeInspection): void => {
    if (!liste.some((e) => e.id === id)) return;
    changer(liste.map((e) => (e.id === id ? f(e) : e)));
  };

  return {
    entrees: () => liste,
    ajouter(donnees) {
      const date = maintenant();
      // L'identifiant ne dépend pas des entrées déjà chargées : horodatage et compteur de session.
      const id = `${date.getTime().toString(36)}-${String(prochain++)}`;
      const entree: EntreeInspection = { ...donnees, id, horodatage: date.toISOString(), verdict: null, attendu: null };
      changer([...liste, entree].slice(-plafond));
      return id;
    },
    mettreAJour: (id, execution) => remplacer(id, (e) => ({ ...e, execution })),
    corriger: (id, decision, plan) =>
      remplacer(id, (e) => ({
        ...e,
        decision,
        plan,
        clarification: e.clarification ?? { decision: e.decision, plan: e.plan },
      })),
    poserVerdict: (id, verdict, attendu = null) =>
      remplacer(id, (e) => ({
        ...e,
        verdict: verdict === null ? null : verdict.valeur === 'erreur' ? { valeur: 'erreur', cause: verdict.cause ?? 'decision' } : { valeur: 'juste' },
        attendu: verdict?.valeur === 'erreur' ? attendu : null,
      })),
    effacer() {
      liste = [];
      try {
        options.stockage().removeItem(CLE_INSPECTION);
        disponible = true;
      } catch {
        disponible = false;
      }
      for (const fn of [...abonnes]) fn();
    },
    stockageDisponible: () => disponible,
    exporter: (date = maintenant()) => JSON.stringify(creerExport(liste, date), null, 2),
    abonner(fn) {
      abonnes.add(fn);
      return () => abonnes.delete(fn);
    },
  };
}
