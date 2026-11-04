// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { lancerBanc } from '../banc/banc';
import { lireCorpusFichier, main } from '../banc/cli';
import { fabriquesDuMoteur } from '../banc/moteurs';
import { planifier } from './outils';
import { creerEtageSlm } from './slm';
import { creerEtageDecision } from './decision';
import {
  CLE_INSPECTION,
  LIMITE_JETONS,
  MAX_ENTREES,
  MAX_OCTETS,
  calculerTableau,
  construireEntree,
  creerInspection,
  decrirePlan,
  nomFichierInspection,
  tauxJustes,
  versCorpus,
  type DonneesEntree,
  type EntreeInspection,
} from './inspection';
import type { Decision, Etage, EtatChat, ResultatCascade } from './types';

const etat: EtatChat = { noms: ['Ana', 'Bob'], rotation: false };
const domaine = { participants: [], cadeaux: [], attribues: 0, historique: [] } as never;

const base = (extra: Partial<DonneesEntree> = {}): DonneesEntree => ({
  commande: 'ajoute Léo',
  etat,
  decision: { action: 'ajouter', params: { nom: 'Léo' } },
  etage: 'regles',
  confiance: null,
  etages: [],
  plan: { genre: 'etapes', detail: '1 étape(s)', confirmation: false },
  execution: 'execute',
  latenceMs: 1,
  ...extra,
});

/** Stockage réel en mémoire (frontière externe : `localStorage`). */
function stockage(): Storage & { donnees: Map<string, string> } {
  const donnees = new Map<string, string>();
  return {
    donnees,
    getItem: (k: string) => donnees.get(k) ?? null,
    setItem: (k: string, v: string) => void donnees.set(k, v),
    removeItem: (k: string) => void donnees.delete(k),
  } as unknown as Storage & { donnees: Map<string, string> };
}

describe('construireEntree', () => {
  it('étage règles : règle reconnue, latence, plan', () => {
    const decision: Decision = { action: 'ajouter', params: { nom: 'Léo' } };
    const resultat: ResultatCascade = {
      decision,
      etage: 'regles',
      traces: [{ etage: 'regles', entree: 'ajoute Léo', sortie: 'ajouter', dureeMs: 2.5 }],
    };
    const e = construireEntree({
      commande: 'ajoute Léo',
      etat,
      resultat,
      etages: [],
      plan: planifier(decision, domaine),
      execution: 'execute',
      seuilDecision: 0.5,
    });
    expect(e.etage).toBe('regles');
    expect(e.etages).toHaveLength(1);
    expect(e.etages[0]).toMatchObject({
      etage: 'regles',
      regle: 'ajouter',
      raison: null,
      dureeMs: 2.5,
      contexte: null,
      validation: 'règle reconnue',
    });
    expect(e.latenceMs).toBe(2.5);
    expect(e.plan).toEqual({ genre: 'etapes', detail: '1 étape(s)', confirmation: false });
    expect(e.confiance).toBeNull();
  });

  it('SLM : contexte entier, jetons rapportés à la limite, coupes, appel d’outil, validation', async () => {
    const historique = [1, 2, 3, 4, 5].map((i) => ({ commande: `c${String(i)}`, reponse: `r${String(i)}` }));
    const etatLong: EtatChat = { ...etat, cadeaux: ['A', 'B'], historique };
    const reponse = JSON.stringify({
      message: { content: '', tool_calls: [{ function: { name: 'lancer', arguments: {} } }] },
    });
    const f = (() => Promise.resolve(new Response(reponse))) as unknown as typeof fetch;
    const slm = creerEtageSlm({ modele: 'm', fetch: f });
    const r = await slm.decider('lance', etatLong, new AbortController().signal);
    expect(r?.decision).toEqual({ action: 'lancer', params: {} });
    const decision = r?.decision as Decision;
    const e = construireEntree({
      commande: 'lance',
      etat: etatLong,
      resultat: {
        decision,
        etage: 'slm',
        traces: [{ etage: 'slm', ...(r?.trace ?? { entree: '', sortie: null }), dureeMs: 120 }],
      },
      etages: [slm],
      plan: planifier(decision, domaine),
      execution: 'attente-confirmation',
      seuilDecision: 0.5,
    });
    const t = e.etages[0];
    expect(t?.contexte?.limite).toBe(LIMITE_JETONS);
    expect(t?.contexte?.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(t?.contexte?.messages[1]?.content).toContain('Commande : lance');
    expect(t?.contexte?.jetons).toBeGreaterThan(100);
    expect(t?.contexte?.coupes).toEqual([
      'historique : 2 échange(s) ancien(s) retiré(s) (maximum 3)',
      'cadeaux : seul le prochain est transmis',
    ]);
    expect(t?.appelsOutils).toEqual([{ nom: 'lancer', arguments: {} }]);
    expect(t?.sortie).toBe(reponse);
    expect(t?.validation).toBe('schéma de l’outil respecté, forme valide');
    expect(e.execution).toBe('attente-confirmation');
  });

  it('passage de main avec raison : le SLM rejette, le contexte et la raison sont gardés', async () => {
    const reponse = JSON.stringify({ message: { content: 'bonjour' } });
    const f = (() => Promise.resolve(new Response(reponse))) as unknown as typeof fetch;
    const slm = creerEtageSlm({ modele: 'm', fetch: f });
    const r = await slm.decider('x', etat, new AbortController().signal);
    expect(r).toMatchObject({ decision: null, raison: 'sans-outil' });
    const passe = r as { trace: { entree: string; sortie: string | null }; raison: string };
    const e = construireEntree({
      commande: 'x',
      etat,
      resultat: {
        decision: { action: 'refuser', code: 'incompris' },
        etage: null,
        traces: [
          { etage: 'regles', entree: 'x', sortie: null, dureeMs: 1 },
          { etage: 'slm', ...passe.trace, dureeMs: 30, raison: passe.raison },
        ],
      },
      etages: [slm],
      plan: planifier({ action: 'refuser', code: 'incompris' }, domaine),
      execution: 'non-execute',
      seuilDecision: 0.5,
    });
    expect(e.etage).toBeNull();
    expect(e.etages[0]).toMatchObject({ etage: 'regles', validation: 'aucune règle ne correspond', regle: null });
    expect(e.etages[1]).toMatchObject({
      etage: 'slm',
      raison: 'sans-outil',
      validation: 'rejeté : aucun appel d’outil',
    });
    expect(e.etages[1]?.contexte?.messages).toHaveLength(2);
    expect(e.latenceMs).toBe(31);
    expect(e.plan).toEqual({ genre: 'refuser', detail: 'refus : incompris', confirmation: false });
  });

  it('étage décision : probabilités par option, seuil rapporté, historique non transmis', async () => {
    const f = ((_u: string, init: RequestInit) => {
      const corps = JSON.parse(init.body as string) as {
        questions: Record<string, { type: string; criteria?: Record<string, string> }>;
      };
      const answers = Object.fromEntries(
        Object.entries(corps.questions).map(([id, q]) => {
          if (q.type === 'noul') return [id, { type: 'noul', noul: 0.05 }];
          const options = Object.keys(q.criteria ?? {});
          const choisi = id === 'outil' ? 'supprimer' : 'Bob';
          return [
            id,
            {
              type: 'choice',
              choice: choisi,
              probabilities: Object.fromEntries(
                options.map((o) => [o, options.length === 1 ? 1 : o === choisi ? 0.9 : 0.1 / (options.length - 1)]),
              ),
              confidence: 0.5,
            },
          ];
        }),
      );
      return Promise.resolve(new Response(JSON.stringify({ answers })));
    }) as unknown as typeof fetch;
    const etage = creerEtageDecision({ modeleDecision: 'm', fetch: f });
    const etatH: EtatChat = { ...etat, historique: [{ commande: 'a', reponse: 'b' }] };
    const r = await etage.decider('supprime Bob', etatH, new AbortController().signal);
    expect(r?.decision).toEqual({ action: 'supprimer', params: { nom: 'Bob' } });
    const decision = r?.decision as Decision;
    const e = construireEntree({
      commande: 'supprime Bob',
      etat: etatH,
      resultat: {
        decision,
        etage: 'decision',
        confiance: 0.9,
        traces: [{ etage: 'decision', ...(r?.trace ?? { entree: '', sortie: null }), dureeMs: 12 }],
      },
      etages: [etage],
      plan: planifier(decision, domaine),
      execution: 'attente-confirmation',
      seuilDecision: 0.5,
    });
    const d = e.etages[0];
    expect(e.confiance).toBe(0.9);
    expect(d?.probabilites).toMatchObject({ outil: { supprimer: 0.9 }, nom: { Bob: 1 }, ambigu: 0.05 });
    expect(d?.contexte?.coupes).toEqual(['historique : non transmis à ce modèle']);
    expect(d?.contexte?.messages[0]?.role).toBe('system');
    expect(d?.validation).toBe('probabilités valides, seuil 0.5 atteint');
    expect(d?.sortie).toContain('"answers"');
  });

  it('contexte au-delà de la limite : signalé dans les coupes', async () => {
    const gros: EtatChat = { noms: Array.from({ length: 2000 }, (_, i) => `Nom${String(i)}`), rotation: false };
    const f = (() => Promise.resolve(new Response('{}'))) as unknown as typeof fetch;
    const slm = creerEtageSlm({ modele: 'm', fetch: f });
    const r = await slm.decider('x', gros, new AbortController().signal);
    const e = construireEntree({
      commande: 'x',
      etat: gros,
      resultat: {
        decision: { action: 'refuser' },
        etage: null,
        traces: [{ etage: 'slm', ...(r?.trace ?? { entree: '', sortie: null }), dureeMs: 1, raison: 'sans-outil' }],
      },
      etages: [slm],
      plan: decrirePlanFictif(),
      execution: 'non-execute',
      seuilDecision: 0.5,
    });
    expect(e.etages[0]?.contexte?.jetons).toBeGreaterThan(LIMITE_JETONS);
    expect(e.etages[0]?.contexte?.coupes).toContain(`taille estimée au-delà de la limite (${String(LIMITE_JETONS)} jetons)`);
  });

  it('étage en erreur : message gardé, validation en rend compte', () => {
    const e = construireEntree({
      commande: 'x',
      etat,
      resultat: {
        decision: { action: 'refuser', code: 'incompris' },
        etage: null,
        traces: [{ etage: 'regles', entree: 'x', sortie: null, dureeMs: 1, erreur: 'boum' }],
      },
      etages: [] as Etage[],
      plan: decrirePlanFictif(),
      execution: 'non-execute',
      seuilDecision: 0.5,
    });
    expect(e.etages[0]).toMatchObject({ erreur: 'boum', validation: 'erreur : boum' });
  });
});

function decrirePlanFictif() {
  return { genre: 'refuser', code: 'incompris' } as const;
}

describe('decrirePlan', () => {
  it('trois genres', () => {
    expect(decrirePlan({ genre: 'clarifier', candidats: ['A', 'B'] })).toEqual({
      genre: 'clarifier',
      detail: 'clarifier : A, B',
      confirmation: false,
    });
    expect(decrirePlan({ genre: 'etapes', etapes: [], confirmation: true }).confirmation).toBe(true);
  });
});

describe('tableau de bord', () => {
  const avecVerdict = (id: string, etage: EntreeInspection['etage'], decision: Decision, v: EntreeInspection['verdict']): EntreeInspection => ({
    ...base({ etage, decision }),
    id,
    horodatage: 't',
    verdict: v,
    attendu: null,
  });

  it('taux et nombre de verdicts par étage et par action, erreurs à revoir', () => {
    const entrees = [
      avecVerdict('1', 'regles', { action: 'ajouter', params: { nom: 'A' } }, { valeur: 'juste' }),
      avecVerdict('2', 'regles', { action: 'ajouter', params: { nom: 'B' } }, { valeur: 'erreur', cause: 'decision' }),
      avecVerdict('3', 'slm', { action: 'lancer', params: {} }, { valeur: 'juste' }),
      avecVerdict('4', 'slm', { actions: [{ action: 'ajouter' }, { action: 'ajouter' }, { action: 'lancer' }] }, { valeur: 'erreur', cause: 'ecoute' }),
      avecVerdict('5', null, { action: 'refuser', code: 'incompris' }, { valeur: 'juste' }),
      avecVerdict('6', 'decision', { action: 'lancer' }, null),
    ];
    const t = calculerTableau(entrees);
    expect(t.total).toEqual({ justes: 3, erreurs: 2 });
    expect(t.parEtage).toEqual({
      regles: { justes: 1, erreurs: 1 },
      slm: { justes: 1, erreurs: 1 },
      aucun: { justes: 1, erreurs: 0 },
    });
    // Une décision à plusieurs étapes compte une fois par action distincte.
    expect(t.parAction).toEqual({
      ajouter: { justes: 1, erreurs: 2 },
      lancer: { justes: 1, erreurs: 1 },
      refuser: { justes: 1, erreurs: 0 },
    });
    expect(t.aRevoir.map((e) => e.id)).toEqual(['4', '2']);
    expect(tauxJustes(t.parEtage['regles'] ?? { justes: 0, erreurs: 0 })).toBe(0.5);
    expect(tauxJustes(t.total)).toBe(0.6);
    expect(tauxJustes({ justes: 0, erreurs: 0 })).toBeNull();
  });

  it('sans verdict : tableau vide', () => {
    const t = calculerTableau([avecVerdict('1', 'regles', { action: 'lancer' }, null)]);
    expect(t.total).toEqual({ justes: 0, erreurs: 0 });
    expect(t.parEtage).toEqual({});
    expect(t.aRevoir).toEqual([]);
  });
});

describe('store, verdicts, plafond, effacement', () => {
  const horloge = () => new Date('2026-11-04T10:00:00Z');

  it('ajoute, pose un verdict (cause par défaut : décision), le retire, persiste', () => {
    const s = stockage();
    const i = creerInspection({ stockage: () => s, maintenant: horloge });
    const id = i.ajouter(base());
    expect(i.entrees()[0]).toMatchObject({ id, horodatage: '2026-11-04T10:00:00.000Z', verdict: null, attendu: null });
    i.poserVerdict(id, { valeur: 'erreur' }, { action: 'lancer', params: {} });
    expect(i.entrees()[0]?.verdict).toEqual({ valeur: 'erreur', cause: 'decision' });
    expect(i.entrees()[0]?.attendu).toEqual({ action: 'lancer', params: {} });
    i.poserVerdict(id, { valeur: 'erreur', cause: 'ecoute' }, { action: 'lancer', params: {} });
    expect(i.entrees()[0]?.verdict).toEqual({ valeur: 'erreur', cause: 'ecoute' });
    // « juste » efface l'attendu et la cause.
    i.poserVerdict(id, { valeur: 'juste', cause: 'ecoute' });
    expect(i.entrees()[0]?.verdict).toEqual({ valeur: 'juste' });
    expect(i.entrees()[0]?.attendu).toBeNull();
    i.poserVerdict(id, null);
    expect(i.entrees()[0]?.verdict).toBeNull();
    i.mettreAJour(id, 'annule');
    expect(i.entrees()[0]?.execution).toBe('annule');
    // Identifiant inconnu : sans effet.
    i.mettreAJour('inconnu', 'perime');
    expect(i.entrees()).toHaveLength(1);
    // Relu par une nouvelle instance.
    expect(creerInspection({ stockage: () => s }).entrees()).toEqual(i.entrees());
  });

  it('plafond : seuls les derniers messages sont gardés, en mémoire et en stockage', () => {
    expect(MAX_ENTREES).toBe(500);
    const s = stockage();
    const i = creerInspection({ stockage: () => s, plafond: 3, maintenant: horloge });
    for (let n = 1; n <= 5; n++) i.ajouter(base({ commande: `c${String(n)}` }));
    expect(i.entrees().map((e) => e.commande)).toEqual(['c3', 'c4', 'c5']);
    const stocke = JSON.parse(s.donnees.get(CLE_INSPECTION) ?? '[]') as { commande: string }[];
    expect(stocke.map((e) => e.commande)).toEqual(['c3', 'c4', 'c5']);
    // Un stockage plus long que le plafond est tronqué au chargement.
    const j = creerInspection({ stockage: () => s, plafond: 2 });
    expect(j.entrees().map((e) => e.commande)).toEqual(['c4', 'c5']);
  });

  it('effacement : liste et stockage vidés, abonnés prévenus', () => {
    const s = stockage();
    const i = creerInspection({ stockage: () => s });
    let n = 0;
    i.abonner(() => n++);
    i.ajouter(base());
    expect(s.donnees.has(CLE_INSPECTION)).toBe(true);
    i.effacer();
    expect(i.entrees()).toEqual([]);
    expect(s.donnees.has(CLE_INSPECTION)).toBe(false);
    expect(n).toBe(2);
  });

  it('sans stockage : fonctionne en mémoire, signale l’indisponibilité', () => {
    const casse = (): Storage => {
      throw new Error('bloqué');
    };
    const i = creerInspection({ stockage: casse });
    expect(i.stockageDisponible()).toBe(false);
    const id = i.ajouter(base());
    i.poserVerdict(id, { valeur: 'juste' });
    expect(i.entrees()[0]?.verdict).toEqual({ valeur: 'juste' });
    i.effacer();
    expect(i.entrees()).toEqual([]);
    expect(i.stockageDisponible()).toBe(false);
  });

  it('stockage plein : l’écriture échoue, la liste reste en mémoire', () => {
    const plein = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    } as unknown as Storage;
    const i = creerInspection({ stockage: () => plein });
    expect(i.stockageDisponible()).toBe(true);
    i.ajouter(base());
    expect(i.entrees()).toHaveLength(1);
    expect(i.stockageDisponible()).toBe(false);
  });

  it('stockage corrompu ou aux entrées invalides : ignoré sans lever', () => {
    const s = stockage();
    s.setItem(CLE_INSPECTION, '{pas du json');
    expect(creerInspection({ stockage: () => s }).entrees()).toEqual([]);
    s.setItem(CLE_INSPECTION, JSON.stringify([{ id: 1 }, null, 'x']));
    expect(creerInspection({ stockage: () => s }).entrees()).toEqual([]);
  });

  it('nom hostile : gardé tel quel dans les données (rendu en texte par la vue)', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const s = stockage();
    const i = creerInspection({ stockage: () => s });
    i.ajouter(base({ commande: `ajoute ${hostile}`, etat: { noms: [hostile], rotation: false } }));
    const relu = creerInspection({ stockage: () => s }).entrees()[0];
    expect(relu?.commande).toBe(`ajoute ${hostile}`);
    expect(relu?.etat.noms).toEqual([hostile]);
  });
});

describe('export relu par le banc', () => {
  const dossiers: string[] = [];
  afterEach(() => {
    for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const preparer = () => {
    const i = creerInspection({ stockage: () => stockage(), maintenant: () => new Date('2026-11-04T10:00:00Z') });
    const a = i.ajouter(base({ commande: 'ajoute Léo', decision: { action: 'ajouter', params: { nom: 'Léo' } } }));
    i.poserVerdict(a, { valeur: 'juste' });
    const b = i.ajouter(
      base({ commande: 'lance', etat: { noms: ['A', 'B'], rotation: false }, decision: { action: 'refuser', code: 'incompris' } }),
    );
    i.poserVerdict(b, { valeur: 'erreur', cause: 'decision' }, { action: 'lancer', params: {} });
    const c = i.ajouter(base({ commande: 'sans attendu', decision: { action: 'refuser', code: 'incompris' } }));
    i.poserVerdict(c, { valeur: 'erreur', cause: 'ecoute' });
    i.ajouter(base({ commande: 'sans verdict' }));
    return i;
  };

  it('document : format, version, date, lignes avec commande, état, obtenu, verdict, attendu', () => {
    const doc = JSON.parse(preparer().exporter(new Date('2026-11-05T08:00:00Z'))) as {
      format: string;
      version: number;
      exporteLe: string;
      lignes: Record<string, unknown>[];
    };
    expect(doc).toMatchObject({ format: 'roue-inspection', version: 1, exporteLe: '2026-11-05T08:00:00.000Z' });
    expect(doc.lignes).toHaveLength(4);
    expect(doc.lignes[1]).toMatchObject({
      commande: 'lance',
      etat: { noms: ['A', 'B'], rotation: false },
      obtenu: { action: 'refuser', code: 'incompris' },
      verdict: { valeur: 'erreur', cause: 'decision' },
      attendu: { action: 'lancer', params: {} },
    });
    expect(doc.lignes[0]).not.toHaveProperty('attendu');
    expect(nomFichierInspection(new Date(2026, 0, 5))).toBe('roue-inspection-2026-01-05.json');
  });

  it('versCorpus : attendu précisé, sinon la décision jugée juste ; le reste est écarté', () => {
    const lignes = versCorpus(preparer().exporter(), 'dev');
    expect(lignes.map((l) => [l.commande, l.attendu, l.confirmation, l.lot, l.categorie])).toEqual([
      ['ajoute Léo', { action: 'ajouter', params: { nom: 'Léo' } }, false, 'dev', 'inspection'],
      ['lance', { action: 'lancer', params: {} }, false, 'dev', 'inspection'],
    ]);
    expect(versCorpus(preparer().exporter(), 'test').every((l) => l.lot === 'test')).toBe(true);
  });

  it('versCorpus : confirmation calculée pour une action destructive, document invalide refusé', () => {
    const i = creerInspection({ stockage: () => stockage() });
    const id = i.ajouter(base({ commande: 'efface tout', decision: { action: 'refuser' } }));
    i.poserVerdict(id, { valeur: 'erreur' }, { action: 'effacerHistorique', params: {} });
    expect(versCorpus(i.exporter(), 'dev')[0]?.confirmation).toBe(true);
    expect(() => versCorpus('{"format":"autre"}', 'dev')).toThrow('export d’inspection invalide');
    expect(() => versCorpus('pas du json', 'dev')).toThrow();
  });

  it('le banc relit le fichier (--corpus) et note le moteur sur ces lignes', async () => {
    const dossier = mkdtempSync(join(tmpdir(), 'inspection-'));
    dossiers.push(dossier);
    const fichier = join(dossier, 'export.json');
    writeFileSync(fichier, preparer().exporter(), 'utf-8');
    const corpus = lireCorpusFichier(fichier, 'dev');
    expect(corpus).toHaveLength(2);
    const r = await lancerBanc(corpus, 'dev', { moteur: 'regles', fabriques: fabriquesDuMoteur('regles') });
    expect(r.global.total).toBe(2);
    expect(r.lignes.map((l) => l.id)).toEqual(corpus.map((l) => l.id));
    // « ajoute Léo » est compris par les règles ; « lance » avec deux noms aussi.
    expect(r.global.ok).toBe(2);
    // Un fichier JSONL au format du corpus reste accepté.
    const jsonl = join(dossier, 'corpus.jsonl');
    writeFileSync(jsonl, `${JSON.stringify(corpus[0])}\n${JSON.stringify(corpus[1])}\n`, 'utf-8');
    expect(lireCorpusFichier(jsonl, 'dev')).toEqual(corpus);
  });

  it('main : --corpus lu, fichier absent signalé avec le code 2', async () => {
    const erreurs: string[] = [];
    const ancienne = console.error;
    console.error = (m: unknown) => void erreurs.push(String(m));
    try {
      const code = await main(['--moteur', 'regles', '--corpus', join(tmpdir(), 'inexistant-5-7.json')]);
      expect(code).toBe(2);
      expect(erreurs.join('\n')).toContain('corpus illisible');
    } finally {
      console.error = ancienne;
    }
  });
});

describe('robustesse du stockage et plafond en taille', () => {
  const entreeComplete = (): DonneesEntree =>
    base({
      etages: [
        {
          etage: 'slm',
          dureeMs: 3,
          raison: null,
          erreur: null,
          regle: null,
          contexte: { messages: [{ role: 'system', content: 'x' }], jetons: 1, limite: LIMITE_JETONS, coupes: [] },
          sortie: null,
          probabilites: null,
          appelsOutils: [],
          validation: 'ok',
        },
      ],
    });

  it('entrée altérée en profondeur : écartée au chargement, la bonne reste, la fenêtre peut s’ouvrir', () => {
    const s = stockage();
    const i = creerInspection({ stockage: () => s });
    i.ajouter(entreeComplete());
    const bonne = JSON.parse(s.donnees.get(CLE_INSPECTION) ?? '[]') as Record<string, unknown>[];
    const copie = (modif: (e: Record<string, unknown>) => void): Record<string, unknown> => {
      const e = structuredClone(bonne[0]) as Record<string, unknown>;
      modif(e);
      return e;
    };
    const alterees = [
      copie((e) => (e['etages'] = [{ etage: 'slm' }])),
      copie((e) => (e['etages'] = [null])),
      copie((e) => (e['plan'] = { genre: 'x' })),
      copie((e) => (e['decision'] = { action: 5 })),
      copie((e) => (e['etat'] = { noms: 'Ana', rotation: false })),
      copie((e) => (e['execution'] = 'inconnue')),
      copie((e) => (e['latenceMs'] = 'vite')),
      copie((e) => (e['horodatage'] = 3)),
      copie((e) => (e['attendu'] = { action: 7 })),
      copie((e) => (e['transcription'] = { brut: 4, latenceMs: 1 })),
      copie((e) => (e['transcription'] = { brut: 'a', latenceMs: 'vite' })),
    ];
    s.setItem(CLE_INSPECTION, JSON.stringify([...alterees, bonne[0]]));
    const j = creerInspection({ stockage: () => s });
    expect(j.entrees()).toHaveLength(1);
    expect(j.entrees()[0]?.id).toBe(bonne[0]?.['id']);
    expect(() => calculerTableau(j.entrees())).not.toThrow();
    // Effacement toujours possible.
    j.effacer();
    expect(j.entrees()).toEqual([]);
  });

  it('plafond en taille sérialisée : les plus anciennes partent d’abord, la dernière reste', () => {
    expect(MAX_OCTETS).toBe(1_500_000);
    const s = stockage();
    const i = creerInspection({ stockage: () => s, maxOctets: 3000 });
    const gros = 'x'.repeat(900);
    for (let n = 1; n <= 6; n++) i.ajouter(base({ commande: `c${String(n)}-${gros}` }));
    const stocke = s.donnees.get(CLE_INSPECTION) ?? '';
    expect(stocke.length).toBeLessThanOrEqual(3000);
    const commandes = i.entrees().map((e) => e.commande.slice(0, 2));
    expect(commandes.at(-1)).toBe('c6');
    expect(commandes.length).toBeLessThan(6);
    expect(commandes).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].slice(6 - commandes.length));
    expect((JSON.parse(stocke) as unknown[]).length).toBe(commandes.length);
    // Une entrée plus grosse que la limite reste seule (jamais vidée).
    const k = creerInspection({ stockage: () => stockage(), maxOctets: 10 });
    k.ajouter(base());
    k.ajouter(base({ commande: 'dernière' }));
    expect(k.entrees().map((e) => e.commande)).toEqual(['dernière']);
  });

  it('clarification et décision corrigée : relues du stockage', () => {
    const s = stockage();
    const i = creerInspection({ stockage: () => s });
    const id = i.ajouter(base({ decision: { action: 'supprimer', params: { nom: 'Mari' } } }));
    i.corriger(id, { action: 'supprimer', params: { nom: 'Marion' } }, { genre: 'etapes', detail: '1 étape(s)', confirmation: false });
    i.corriger(id, { action: 'supprimer', params: { nom: 'Marie' } }, { genre: 'etapes', detail: '1 étape(s)', confirmation: false });
    const relue = creerInspection({ stockage: () => s }).entrees()[0];
    expect(relue?.decision).toEqual({ action: 'supprimer', params: { nom: 'Marie' } });
    // La clarification initiale n'est écrite qu'une fois.
    expect(relue?.clarification?.decision).toEqual({ action: 'supprimer', params: { nom: 'Mari' } });
  });
});
