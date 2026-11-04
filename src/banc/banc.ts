/**
 * Banc d'essai du corpus `docs/v1.1` : passe chaque ligne d'un lot à la cascade d'un moteur et
 * compare à `attendu` (`comparateur.ts`). Lecture des scores : voir `docs/v1.1/README.md`.
 */
import { decider } from '../chat/cascade';
import { estRefus, type Decision, type FabriqueEtage, type OptionsEtages, type TraceEtage } from '../chat/types';
import { actionsAttendues, comparer, type LigneCorpus } from './comparateur';

export interface DetailLigne {
  readonly id: string;
  readonly categorie: string;
  readonly commande: string;
  readonly ok: boolean;
  readonly raison: string;
  readonly attendu: Decision;
  readonly obtenu: Decision;
  readonly etage: string | null;
  readonly dureeMs: number;
  readonly traces: readonly TraceEtage[];
}

export interface Score {
  readonly ok: number;
  readonly total: number;
}

export interface RapportBanc {
  readonly moteur: string;
  readonly lot: 'dev' | 'test';
  readonly global: Score;
  /** Par action attendue (une ligne à plusieurs étapes compte pour chaque action distincte). */
  readonly parAction: Readonly<Record<string, Score>>;
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
  const parAction: Record<string, Score> = {};
  const parCategorie: Record<string, Score> = {};
  const detail: DetailLigne[] = [];
  let ok = 0;
  for (const ligne of lignesLot) {
    const debut = maintenant();
    const r = await decider(ligne.commande, ligne.etat, new AbortController().signal, {
      fabriques: cfg.fabriques,
      options: cfg.options ?? {},
    });
    const dureeMs = maintenant() - debut;
    const v = comparer(ligne, r.decision);
    if (v.ok) ok++;
    ajouter(parCategorie, ligne.categorie, v.ok);
    for (const a of actionsAttendues(ligne.attendu)) ajouter(parAction, a, v.ok);
    detail.push({
      id: ligne.id,
      categorie: ligne.categorie,
      commande: ligne.commande,
      ok: v.ok,
      raison: v.raison,
      attendu: ligne.attendu,
      obtenu: r.decision,
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
    parAction,
    parCategorie,
    plancher: plancherDuLot(lignesLot),
    latenceMedianeMs: quantile(durees, 0.5),
    latenceP95Ms: quantile(durees, 0.95),
    lignes: detail,
  };
}
