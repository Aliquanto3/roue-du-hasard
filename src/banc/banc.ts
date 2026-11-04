/**
 * Banc d'essai du corpus `docs/v1.1` : passe chaque ligne d'un lot à la cascade d'un moteur et
 * compare à `attendu` (`comparateur.ts`). Lecture des scores : voir `docs/v1.1/README.md`.
 */
import { decider } from '../chat/cascade';
import { estRefus, formeValide, type Decision, type FabriqueEtage, type OptionsEtages, type TraceEtage } from '../chat/types';
import { actionsAttendues, comparer, decisionEffective, type LigneCorpus } from './comparateur';

export interface DetailLigne {
  readonly id: string;
  readonly categorie: string;
  readonly commande: string;
  readonly ok: boolean;
  readonly raison: string;
  readonly attendu: Decision;
  /** Décision brute de la cascade. */
  readonly obtenu: Decision;
  /** Ce que l'utilisateur vivrait : la décision après `planifier`. */
  readonly effectif: Decision;
  /** Verdict sur la décision brute (indicateur secondaire). */
  readonly okBrut: boolean;
  readonly etage: string | null;
  readonly dureeMs: number;
  readonly traces: readonly TraceEtage[];
}

export interface Score {
  readonly ok: number;
  readonly total: number;
}

/**
 * Score d'une action : rappel (`ok`/`total`, lignes qui l'attendent) et précision
 * (`emis` : lignes où le moteur l'émet ; `aTort` : parmi elles, celles qui ne l'attendent pas ;
 * précision = (emis - aTort) / emis).
 */
export interface ScoreAction extends Score {
  readonly emis: number;
  readonly aTort: number;
}

export interface RapportBanc {
  readonly moteur: string;
  readonly lot: 'dev' | 'test';
  /** Score sur la décision après `planifier` (ce que vit l'utilisateur). */
  readonly global: Score;
  /** Score sur la décision brute de la cascade, indicateur secondaire. */
  readonly globalBrut: Score;
  /** Par action (une ligne à plusieurs étapes compte pour chaque action distincte), sur la décision effective. */
  readonly parAction: Readonly<Record<string, ScoreAction>>;
  readonly parCategorie: Readonly<Record<string, Score>>;
  /** Part de lignes attendues en `refuser` : le score d'un moteur qui refuse tout. */
  readonly plancher: Score;
  readonly latenceMedianeMs: number;
  readonly latenceP95Ms: number;
  readonly lignes: readonly DetailLigne[];
}

/** Quantile par rang le plus proche (p entre 0 et 1) ; 0 si la liste est vide. */
export function quantile(valeurs: readonly number[], p: number): number {
  if (valeurs.length === 0) return 0;
  const tri = [...valeurs].sort((a, b) => a - b);
  const rang = Math.max(1, Math.ceil(p * tri.length));
  return tri[rang - 1] as number;
}

export function plancherDuLot(lignes: readonly LigneCorpus[]): Score {
  return { ok: lignes.filter((l) => estRefus(l.attendu)).length, total: lignes.length };
}

function ajouter(table: Record<string, Score>, cle: string, ok: boolean): void {
  const s = table[cle] ?? { ok: 0, total: 0 };
  table[cle] = { ok: s.ok + (ok ? 1 : 0), total: s.total + 1 };
}

function ajouterAction(table: Record<string, ScoreAction>, cle: string, delta: Partial<ScoreAction>): void {
  const s = table[cle] ?? { ok: 0, total: 0, emis: 0, aTort: 0 };
  table[cle] = {
    ok: s.ok + (delta.ok ?? 0),
    total: s.total + (delta.total ?? 0),
    emis: s.emis + (delta.emis ?? 0),
    aTort: s.aTort + (delta.aTort ?? 0),
  };
}

export interface OptionsBanc {
  readonly moteur: string;
  readonly fabriques: readonly FabriqueEtage[];
  readonly options?: OptionsEtages;
  /** Horloge en ms (injectable en test). */
  readonly maintenant?: () => number;
}

export async function lancerBanc(
  corpus: readonly LigneCorpus[],
  lot: 'dev' | 'test',
  cfg: OptionsBanc,
): Promise<RapportBanc> {
  const maintenant = cfg.maintenant ?? (() => performance.now());
  const lignesLot = corpus.filter((l) => l.lot === lot);
  const parAction: Record<string, ScoreAction> = {};
  const parCategorie: Record<string, Score> = {};
  const detail: DetailLigne[] = [];
  let ok = 0;
  let okBrutTotal = 0;
  for (const ligne of lignesLot) {
    const debut = maintenant();
    const r = await decider(ligne.commande, ligne.etat, new AbortController().signal, {
      fabriques: cfg.fabriques,
      options: cfg.options ?? {},
    });
    const dureeMs = maintenant() - debut;
    const effectif = decisionEffective(r.decision, ligne.etat);
    const v = comparer(ligne, effectif);
    const brut = comparer(ligne, r.decision);
    if (v.ok) ok++;
    if (brut.ok) okBrutTotal++;
    ajouter(parCategorie, ligne.categorie, v.ok);
    const attendues = actionsAttendues(ligne.attendu);
    for (const a of attendues) ajouterAction(parAction, a, { ok: v.ok ? 1 : 0, total: 1 });
    // Actions émises : celles de la décision effective (une forme invalide donne `refuser` via planifier).
    if (formeValide(effectif)) {
      for (const a of actionsAttendues(effectif)) {
        ajouterAction(parAction, a, { emis: 1, aTort: attendues.includes(a) ? 0 : 1 });
      }
    }
    detail.push({
      id: ligne.id,
      categorie: ligne.categorie,
      commande: ligne.commande,
      ok: v.ok,
      raison: v.raison,
      attendu: ligne.attendu,
      obtenu: r.decision,
      effectif,
      okBrut: brut.ok,
      etage: r.etage,
      dureeMs,
      traces: r.traces,
    });
  }
  const durees = detail.map((d) => d.dureeMs);
  return {
    moteur: cfg.moteur,
    lot,
    global: { ok, total: lignesLot.length },
    globalBrut: { ok: okBrutTotal, total: lignesLot.length },
    parAction,
    parCategorie,
    plancher: plancherDuLot(lignesLot),
    latenceMedianeMs: quantile(durees, 0.5),
    latenceP95Ms: quantile(durees, 0.95),
    lignes: detail,
  };
}
