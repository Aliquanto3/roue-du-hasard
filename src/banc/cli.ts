/**
 * Ligne de commande du banc : `npm run banc:chat -- --moteur <nom> [--lot dev|test|test2] [--modele m] [--url u] [--corpus f]`.
 * `--corpus <fichier>` remplace le corpus du dépôt par un export de la fenêtre d'inspection (5.7) ou un fichier JSONL.
 * Les lots `test` et `test2` exigent `--lot test` ou `--lot test2` explicite (ils ne servent pas au réglage
 * des règles) ; `test2` est lu dans `docs/v1.1/corpus-test2.jsonl`. Détail ligne par
 * ligne dans `.banc/<moteur>-<lot>.json`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { lancerBanc, type RapportBanc, type Score, type ScoreAction } from './banc';
import { versCorpus } from '../chat/inspection';
import type { LigneCorpus, LotCorpus } from './comparateur';
import { fabriquesDuMoteur } from './moteurs';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CHEMIN_CORPUS = resolve(RACINE, 'docs', 'v1.1', 'corpus-commandes.jsonl');

export const CHEMIN_CORPUS_TEST2 = resolve(RACINE, 'docs', 'v1.1', 'corpus-test2.jsonl');

/** Corpus du dépôt qui porte le lot demandé : `test2` vit dans son propre fichier. */
export function lireCorpusDuLot(lot: LotCorpus): LigneCorpus[] {
  return lireCorpus(lot === 'test2' ? CHEMIN_CORPUS_TEST2 : CHEMIN_CORPUS);
}

export function lireCorpus(chemin: string = CHEMIN_CORPUS): LigneCorpus[] {
  return readFileSync(chemin, 'utf-8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as LigneCorpus);
}

/**
 * Corpus d'un fichier choisi : un export de la fenêtre d'inspection (document JSON, toutes ses lignes
 * versées au lot demandé) ou un fichier JSONL au format du corpus du dépôt.
 */
export function lireCorpusFichier(chemin: string, lot: LotCorpus): LigneCorpus[] {
  const texte = readFileSync(chemin, 'utf-8');
  let document: unknown;
  try {
    document = JSON.parse(texte);
  } catch {
    document = null;
  }
  const estExport = typeof document === 'object' && document !== null && 'format' in document;
  return estExport ? versCorpus(texte, lot) : lireCorpus(chemin);
}

export interface Arguments {
  readonly moteur: string;
  readonly lot: LotCorpus;
  readonly modele?: string;
  readonly url?: string;
  /** Fichier de corpus à la place de celui du dépôt. */
  readonly corpus?: string;
}

/** Analyse les arguments ; lève une erreur au message lisible si invalides. Lot `dev` par défaut. */
export function analyserArguments(argv: readonly string[]): Arguments {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      moteur: { type: 'string' },
      lot: { type: 'string' },
      modele: { type: 'string' },
      url: { type: 'string' },
      corpus: { type: 'string' },
    },
    strict: true,
  });
  if (!values.moteur) throw new Error('--moteur <nom> est obligatoire');
  const lot = values.lot ?? 'dev';
  if (lot !== 'dev' && lot !== 'test' && lot !== 'test2') throw new Error(`--lot doit valoir dev, test ou test2 (reçu « ${lot} »)`);
  return {
    moteur: values.moteur,
    lot,
    ...(values.modele === undefined ? {} : { modele: values.modele }),
    ...(values.url === undefined ? {} : { url: values.url }),
    ...(values.corpus === undefined ? {} : { corpus: values.corpus }),
  };
}

const pct = (s: Score): string => (s.total === 0 ? '-' : `${((100 * s.ok) / s.total).toFixed(1)} %`);
const ligneScore = (nom: string, s: Score): string =>
  `  ${nom.padEnd(26)} ${String(s.ok).padStart(3)}/${String(s.total).padEnd(3)} ${pct(s)}`;

const precision = (s: ScoreAction): string =>
  s.emis === 0 ? 'précision -' : `précision ${((100 * (s.emis - s.aTort)) / s.emis).toFixed(1)} %`;
const ligneAction = (nom: string, s: ScoreAction): string =>
  `${ligneScore(nom, s)}  émis ${String(s.emis)}, à tort ${String(s.aTort)}, ${precision(s)}`;

export function formaterRapport(r: RapportBanc): string {
  return [
    `Banc ${r.moteur}, lot ${r.lot} : ${r.global.ok}/${r.global.total} = ${pct(r.global)}`,
    `Décision brute (avant planifier) : ${r.globalBrut.ok}/${r.globalBrut.total} = ${pct(r.globalBrut)}`,
    `Plancher « refuse tout » : ${r.plancher.ok}/${r.plancher.total} = ${pct(r.plancher)}`,
    `Latence : médiane ${r.latenceMedianeMs.toFixed(1)} ms, p95 ${r.latenceP95Ms.toFixed(1)} ms`,
    '',
    `Par action (${r.lot} ; rappel, puis émissions) :`,
    ...Object.keys(r.parAction)
      .sort()
      .map((k) => ligneAction(k, r.parAction[k] as ScoreAction)),
    '',
    `Par catégorie (${r.lot}) :`,
    ...Object.keys(r.parCategorie)
      .sort()
      .map((k) => ligneScore(k, r.parCategorie[k] as Score)),
  ].join('\n');
}

export async function main(argv: readonly string[]): Promise<number> {
  const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
  let args: Arguments;
  try {
    args = analyserArguments(argv);
  } catch (e) {
    console.error(`banc:chat : ${message(e)}`);
    console.error('Usage : npm run banc:chat -- --moteur <nom> [--lot dev|test|test2] [--modele <m>] [--url <u>] [--corpus <fichier>]');
    return 2;
  }
  let fabriques;
  try {
    fabriques = fabriquesDuMoteur(args.moteur);
  } catch (e) {
    console.error(`banc:chat : ${message(e)}`);
    return 2;
  }
  const options = {
    ...(args.url === undefined ? {} : { urlOllama: args.url }),
    ...(args.modele === undefined ? {} : { modele: args.modele }),
  };
  let corpus: LigneCorpus[];
  try {
    corpus = args.corpus === undefined ? lireCorpusDuLot(args.lot) : lireCorpusFichier(args.corpus, args.lot);
  } catch (e) {
    console.error(`banc:chat : corpus illisible : ${message(e)}`);
    return 2;
  }
  const rapport = await lancerBanc(corpus, args.lot, { moteur: args.moteur, fabriques, options });
  const dossier = resolve(RACINE, '.banc');
  mkdirSync(dossier, { recursive: true });
  const fichier = resolve(dossier, `${args.moteur}${args.corpus === undefined ? '' : '-corpus'}-${args.lot}.json`);
  writeFileSync(fichier, JSON.stringify(rapport, null, 2), 'utf-8');
  console.log(formaterRapport(rapport));
  console.log(`\nDétail : ${fichier}`);
  return 0;
}
