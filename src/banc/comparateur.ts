/**
 * Comparateur du banc d'essai : confronte la décision d'un moteur à `attendu` d'une ligne du corpus
 * `docs/v1.1` (voir son README, « Règles d'attendu » et « Usage prévu »).
 *
 * Une ligne est réussie si : même action, mêmes paramètres, même besoin de confirmation.
 * - Les noms sont comparés tels quels (le nom est celui de la liste : « Zoé », pas « zoe » ; un nom
 *   ajouté ou renommé reste tel que saisi). Seule la couleur ignore la casse (`#d62828` = `#D62828`).
 *   Un paramètre absent équivaut à `{}`, un paramètre en trop est une erreur.
 * - Plusieurs étapes : comparées dans l'ordre, même nombre d'étapes.
 * - `refuser` : le code n'est pas comparé.
 * - `clarifier` : règle des candidats du README : au moins 1 des candidats attendus (2 dans
 *   `homonymes`) parmi ceux obtenus ; les candidats en trop sont tolérés.
 * - Confirmation : `confirmationRequise` appliquée à la décision obtenue, comparée à `confirmation`.
 */
import type { Etat } from '../domain/etat';
import { confirmationRequise, planifier } from '../chat/outils';
import {
  estClarifier,
  estEtapes,
  estRefus,
  formeValide,
  type Decision,
  type DecisionAction,
  type EtatChat,
} from '../chat/types';

export interface LigneCorpus {
  readonly id: string;
  readonly lot: 'dev' | 'test';
  readonly categorie: string;
  readonly commande: string;
  readonly etat: EtatChat;
  readonly attendu: Decision;
  readonly confirmation: boolean;
}

export interface Verdict {
  readonly ok: boolean;
  /** Raison de l'échec (vide si réussi), pour le détail JSON. */
  readonly raison: string;
}

const REUSSI: Verdict = { ok: true, raison: '' };
const echec = (raison: string): Verdict => ({ ok: false, raison });

/** Étapes d'une décision d'action ou de plan (vide pour refuser et clarifier). */
export function etapesDe(d: Decision): readonly DecisionAction[] {
  if (estEtapes(d)) return d.actions;
  if (estRefus(d) || estClarifier(d)) return [];
  return [d as DecisionAction];
}

/** Actions distinctes attendues par une ligne (pour le score par action). */
export function actionsAttendues(d: Decision): string[] {
  if (estRefus(d)) return ['refuser'];
  if (estClarifier(d)) return ['clarifier'];
  return [...new Set(etapesDe(d).map((e) => e.action))];
}

function memeParametre(cle: string, a: unknown, b: unknown): boolean {
  if (cle === 'couleur' && typeof a === 'string' && typeof b === 'string') return a.toUpperCase() === b.toUpperCase();
  return a === b;
}

function compareEtape(attendue: DecisionAction, obtenue: DecisionAction): string {
  if (attendue.action !== obtenue.action) return `action ${obtenue.action} au lieu de ${attendue.action}`;
  const pa = attendue.params ?? {};
  const po = obtenue.params ?? {};
  const cles = new Set([...Object.keys(pa), ...Object.keys(po)]);
  for (const cle of cles) {
    if (!(cle in po)) return `${attendue.action} : paramètre ${cle} absent`;
    if (!(cle in pa)) return `${attendue.action} : paramètre ${cle} en trop`;
    if (!memeParametre(cle, pa[cle], po[cle])) {
      return `${attendue.action}.${cle} : ${JSON.stringify(po[cle])} au lieu de ${JSON.stringify(pa[cle])}`;
    }
  }
  return '';
}

function compareClarifier(ligne: LigneCorpus, obtenue: Decision): string {
  if (!estClarifier(obtenue)) return `${estRefus(obtenue) ? 'refuser' : 'une action'} au lieu de clarifier`;
  const mini = ligne.categorie === 'homonymes' ? 2 : 1;
  const attendus = estClarifier(ligne.attendu) ? ligne.attendu.candidats : [];
  // Candidats attendus retrouvés parmi ceux obtenus (doublons comptés) ; les candidats en trop sont tolérés.
  const reste = [...obtenue.candidats];
  let trouves = 0;
  for (const a of attendus) {
    const i = reste.indexOf(a);
    if (i >= 0) {
      reste.splice(i, 1);
      trouves++;
    }
  }
  if (trouves < mini) return `${trouves} candidat(s) attendu(s) retrouvé(s), ${mini} au moins`;
  return '';
}

/** Compare la décision obtenue à la ligne du corpus. */
export function comparer(ligne: LigneCorpus, obtenue: Decision): Verdict {
  if (!formeValide(obtenue)) return echec('forme de décision invalide');
  const attendu = ligne.attendu;
  if (estRefus(attendu)) {
    return estRefus(obtenue) ? REUSSI : echec('une action au lieu de refuser');
  }
  if (estClarifier(attendu)) {
    const raison = compareClarifier(ligne, obtenue);
    return raison === '' ? REUSSI : echec(raison);
  }
  if (estRefus(obtenue)) return echec("refuser au lieu de l'action attendue");
  if (estClarifier(obtenue)) return echec("clarifier au lieu de l'action attendue");
  const ea = etapesDe(attendu);
  const eo = etapesDe(obtenue);
  if (ea.length !== eo.length) return echec(`${eo.length} étape(s) au lieu de ${ea.length}`);
  for (let i = 0; i < ea.length; i++) {
    const raison = compareEtape(ea[i] as DecisionAction, eo[i] as DecisionAction);
    if (raison !== '') return echec(ea.length > 1 ? `étape ${i + 1} : ${raison}` : raison);
  }
  if (confirmationRequise(obtenue) !== ligne.confirmation) {
    return echec(`confirmation ${String(!ligne.confirmation)} au lieu de ${String(ligne.confirmation)}`);
  }
  return REUSSI;
}

/** `Etat` du domaine construit depuis l'`etat` du corpus (ids `p1`, `p2`…, ordre conservé). */
export function etatDomaine(etat: EtatChat): Etat {
  return {
    participants: etat.noms.map((nom, i) => ({ id: `p${String(i + 1)}`, nom, couleur: null })),
    cadeaux: etat.cadeaux ?? [],
    attribues: 0,
    historique: [],
    retirerGagnants: false,
    sonCoupe: false,
    relief: true,
    prochainId: etat.noms.length + 1,
  };
}

/**
 * Décision telle que la vit l'utilisateur : ce que `planifier` en fait. Refus et demande de précision
 * remplacent la décision (un `supprimer Marie` avec deux Marie devient `clarifier`) ; un plan
 * d'étapes garde la décision, dont les actions et paramètres sont ceux qui seront exécutés.
 */
export function decisionEffective(decision: Decision, etat: EtatChat): Decision {
  const plan = planifier(decision, etatDomaine(etat));
  if (plan.genre === 'refuser') return { action: 'refuser', code: plan.code };
  if (plan.genre === 'clarifier') return { action: 'clarifier', candidats: plan.candidats };
  return decision;
}
