import { describe, expect, it } from 'vitest';
import type { Etage, FabriqueEtage } from '../chat/types';
import { lancerBanc, quantile } from './banc';
import { analyserArguments, lireCorpus, lireCorpusDuLot } from './cli';
import { comparer, type LigneCorpus } from './comparateur';
import { MOTEURS, MOTEURS_A_VENIR, fabriquesDuMoteur } from './moteurs';

const corpus = lireCorpus();

describe('plancher « refuse tout »', () => {
  // Valeurs affichées par `docs/v1.1/verifier_corpus.py` (dev 26/96, test 32/126).
  it.each([
    ['dev', 26, 96],
    ['test', 32, 126],
  ] as const)('le moteur refuse-tout donne exactement le plancher du lot %s', async (lot, ok, total) => {
    const r = await lancerBanc(corpus, lot, { moteur: 'refuse-tout', fabriques: MOTEURS['refuse-tout'] ?? [] });
    expect(r.global).toEqual({ ok, total });
    expect(r.plancher).toEqual({ ok, total });
    // Indépendant du comparateur : nombre de lignes dont l'attendu est refuser.
    const refus = corpus.filter((l) => l.lot === lot && 'action' in l.attendu && l.attendu.action === 'refuser').length;
    expect(refus).toBe(ok);
    expect(r.parAction['refuser']).toEqual({ ok, total: ok, emis: total, aTort: total - ok });
    expect(r.parAction['ajouter']).toMatchObject({ ok: 0, emis: 0, aTort: 0 });
    expect(r.globalBrut).toEqual({ ok, total });
    expect(r.lignes).toHaveLength(total);
    expect(r.lignes[0]?.traces).toHaveLength(1);
  });
});

describe('lot test2', () => {
  it('lu dans son fichier : le moteur refuse-tout donne le plancher du vérificateur (25/91)', async () => {
    const test2 = lireCorpusDuLot('test2');
    expect(test2).toHaveLength(91);
    expect(test2.every((l) => l.lot === 'test2')).toBe(true);
    const r = await lancerBanc(test2, 'test2', { moteur: 'refuse-tout', fabriques: MOTEURS['refuse-tout'] ?? [] });
    expect(r.lot).toBe('test2');
    expect(r.global).toEqual({ ok: 25, total: 91 });
    expect(r.plancher).toEqual({ ok: 25, total: 91 });
  });

  it('le corpus principal ne contient aucune ligne test2', () => {
    expect(corpus.some((l) => l.lot === 'test2')).toBe(false);
  });
});

describe('lancerBanc', () => {
  it('compte par action et par catégorie, mesure la latence avec la trace de cascade', async () => {
    const mini: LigneCorpus[] = [
      { id: 'a', lot: 'dev', categorie: 'c1', commande: 'ajoute X', etat: { noms: ['A'], rotation: false }, attendu: { action: 'ajouter', params: { nom: 'X' } }, confirmation: false },
      { id: 'b', lot: 'dev', categorie: 'c2', commande: 'lance', etat: { noms: ['A', 'B'], rotation: false }, attendu: { action: 'lancer', params: {} }, confirmation: false },
      { id: 'c', lot: 'test', categorie: 'c2', commande: 'lance', etat: { noms: ['A', 'B'], rotation: false }, attendu: { action: 'lancer', params: {} }, confirmation: false },
    ];
    const fabrique: FabriqueEtage = (): Etage => ({
      nom: 'regles',
      decider: (commande) =>
        Promise.resolve({
          decision: commande === 'lance' ? { action: 'lancer', params: {} } : { action: 'refuser' },
          trace: { entree: commande, sortie: 'x' },
        }),
    });
    let t = 0;
    const r = await lancerBanc(mini, 'dev', { moteur: 'm', fabriques: [fabrique], maintenant: () => (t += 5) });
    expect(r.global).toEqual({ ok: 1, total: 2 });
    expect(r.parAction).toEqual({
      ajouter: { ok: 0, total: 1, emis: 0, aTort: 0 },
      lancer: { ok: 1, total: 1, emis: 1, aTort: 0 },
      refuser: { ok: 0, total: 0, emis: 1, aTort: 1 },
    });
    expect(r.parCategorie).toEqual({ c1: { ok: 0, total: 1 }, c2: { ok: 1, total: 1 } });
    expect(r.lignes[0]?.raison).toBe('refuser au lieu de l\'action attendue');
    expect(r.lignes[0]?.etage).toBe('regles');
    // La cascade prend deux lectures d'horloge par étage, le banc deux par ligne.
    expect(r.latenceMedianeMs).toBeGreaterThan(0);
  });

  it('un moteur qui émet lancer partout : rappel 100 % mais précision basse', async () => {
    const partout: FabriqueEtage = (): Etage => ({
      nom: 'regles',
      decider: (commande) =>
        Promise.resolve({ decision: { action: 'lancer', params: {} }, trace: { entree: commande, sortie: null } }),
    });
    const l = (id: string, attendu: LigneCorpus['attendu']): LigneCorpus => ({
      id, lot: 'dev', categorie: 'c', commande: id, etat: { noms: ['A', 'B'], rotation: false }, attendu, confirmation: false,
    });
    const r = await lancerBanc(
      [l('a', { action: 'lancer', params: {} }), l('b', { action: 'refuser' }), l('c', { action: 'ajouter', params: { nom: 'Z' } })],
      'dev',
      { moteur: 'm', fabriques: [partout] },
    );
    expect(r.parAction['lancer']).toEqual({ ok: 1, total: 1, emis: 3, aTort: 2 });
  });

  it('juge la décision après planifier : supprimer un homonyme devient clarifier', async () => {
    const supprime: FabriqueEtage = (): Etage => ({
      nom: 'regles',
      decider: (commande) =>
        Promise.resolve({
          decision: { action: 'supprimer', params: { nom: 'Marie' } },
          trace: { entree: commande, sortie: null },
        }),
    });
    const ligne: LigneCorpus = {
      id: 'h', lot: 'dev', categorie: 'homonymes', commande: 'supprime Marie',
      etat: { noms: ['Marie', 'Paul', 'Marie'], rotation: false },
      attendu: { action: 'clarifier', candidats: ['Marie', 'Marie'] }, confirmation: false,
    };
    const r = await lancerBanc([ligne], 'dev', { moteur: 'm', fabriques: [supprime] });
    expect(r.global).toEqual({ ok: 1, total: 1 });
    expect(r.globalBrut).toEqual({ ok: 0, total: 1 });
    expect(r.lignes[0]?.effectif).toEqual({ action: 'clarifier', candidats: ['Marie', 'Marie'] });
    expect(r.lignes[0]?.okBrut).toBe(false);
  });

  it('quantile : rang le plus proche', () => {
    expect(quantile([], 0.5)).toBe(0);
    expect(quantile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
  });
});

describe('arguments et moteurs', () => {
  it('lot dev par défaut, test seulement sur demande explicite', () => {
    expect(analyserArguments(['--moteur', 'refuse-tout']).lot).toBe('dev');
    expect(analyserArguments(['--moteur', 'refuse-tout', '--lot', 'test']).lot).toBe('test');
    expect(analyserArguments(['--moteur', 'refuse-tout', '--lot', 'test2']).lot).toBe('test2');
    expect(() => analyserArguments(['--moteur', 'x', '--lot', 'tous'])).toThrow('--lot doit valoir dev, test ou test2');
  });

  it('moteur obligatoire, options transmises', () => {
    expect(() => analyserArguments([])).toThrow('--moteur');
    expect(analyserArguments(['--moteur', 'slm', '--modele', 'm1', '--url', 'http://h:1'])).toEqual({
      moteur: 'slm',
      lot: 'dev',
      modele: 'm1',
      url: 'http://h:1',
    });
  });

  it('moteur inconnu : message clair, avec les moteurs disponibles', () => {
    expect(() => fabriquesDuMoteur('toString')).toThrow('inconnu');
    expect(() => fabriquesDuMoteur('absent')).toThrow('moteurs disponibles : refuse-tout, regles, slm, decision');
    expect(MOTEURS_A_VENIR).toEqual({});
    expect(fabriquesDuMoteur('refuse-tout')).toHaveLength(1);
  });

  it('moteur slm : inactif sans --modele (aucun appel réseau), --modele et --url transmis au client', async () => {
    const [fabrique] = fabriquesDuMoteur('slm');
    expect(fabriquesDuMoteur('slm')).toHaveLength(1);
    const signal = new AbortController().signal;
    const etat = { noms: ['Ana'], rotation: false };
    const appels: string[] = [];
    const f = ((u: string, init: RequestInit) => {
      appels.push(u);
      void init;
      return Promise.resolve(new Response(JSON.stringify({ message: { content: '' } })));
    }) as unknown as typeof fetch;
    expect(await fabrique?.({ fetch: f }).decider('lance', etat, signal)).toBeNull();
    expect(appels).toEqual([]);
    const r = await fabrique?.({ modele: 'm1', urlOllama: 'http://h:1', fetch: f }).decider('lance', etat, signal);
    expect(appels).toEqual(['http://h:1/api/chat']);
    expect(r).toMatchObject({ decision: null, raison: 'sans-outil' });
  });

  it('moteur decision : --modele devient le modèle de décision ; inactif sans modèle', async () => {
    const [fabrique] = fabriquesDuMoteur('decision');
    const signal = new AbortController().signal;
    const etat = { noms: ['Ana'], rotation: false };
    expect(await fabrique?.({}).decider('lance', etat, signal)).toBeNull();
    let corps = '';
    const f = ((_u: string, init: RequestInit) => {
      corps = init.body as string;
      return Promise.resolve(new Response('{}'));
    }) as unknown as typeof fetch;
    const r = await fabrique?.({ modele: 'm1', fetch: f }).decider('lance', etat, signal);
    expect((JSON.parse(corps) as { model: string }).model).toBe('m1');
    expect(r).toMatchObject({ decision: null, raison: 'reponse-invalide' });
  });
});

const ligne = (attendu: LigneCorpus['attendu'], extra: Partial<LigneCorpus> = {}): LigneCorpus => ({
  id: 't',
  lot: 'dev',
  categorie: 'formes_directes',
  commande: 'x',
  etat: { noms: ['Marie', 'Paul', 'Marie'], rotation: false },
  attendu,
  confirmation: false,
  ...extra,
});

describe('comparer : paramètres', () => {
  const att = { action: 'renommer', params: { nom: 'Paul', nouveau: 'Paulo' } };
  it('même action et mêmes paramètres', () => {
    expect(comparer(ligne(att), { action: 'renommer', params: { nom: 'Paul', nouveau: 'Paulo' } })).toEqual({ ok: true, raison: '' });
  });
  it('un nom différent (accent ou casse compris) échoue', () => {
    expect(comparer(ligne(att), { action: 'renommer', params: { nom: 'paul', nouveau: 'Paulo' } }).raison).toBe(
      'renommer.nom : "paul" au lieu de "Paul"',
    );
  });
  it('paramètre manquant, en trop, ou autre action', () => {
    expect(comparer(ligne(att), { action: 'renommer', params: { nom: 'Paul' } }).raison).toBe('renommer : paramètre nouveau absent');
    expect(comparer(ligne(att), { action: 'renommer', params: { nom: 'Paul', nouveau: 'Paulo', z: 1 } }).raison).toBe(
      'renommer : paramètre z en trop',
    );
    expect(comparer(ligne(att), { action: 'supprimer', params: { nom: 'Paul' } }).raison).toBe('action supprimer au lieu de renommer');
  });
  it('params absent équivaut à {} ; couleur sans égard à la casse', () => {
    expect(comparer(ligne({ action: 'lancer', params: {} }), { action: 'lancer' }).ok).toBe(true);
    const c = ligne({ action: 'definirCouleur', params: { nom: 'Paul', couleur: '#D62828' } });
    expect(comparer(c, { action: 'definirCouleur', params: { nom: 'Paul', couleur: '#d62828' } }).ok).toBe(true);
    expect(comparer(c, { action: 'definirCouleur', params: { nom: 'Paul', couleur: '#1D4ED8' } }).ok).toBe(false);
  });
  it('forme invalide', () => {
    expect(comparer(ligne(att), { action: 3 } as never).raison).toBe('forme de décision invalide');
  });
});

describe('comparer : plusieurs étapes', () => {
  const att = {
    actions: [
      { action: 'ajouter', params: { nom: 'Zoé' } },
      { action: 'supprimer', params: { nom: 'Paul' } },
    ],
  };
  it('dans l\'ordre', () => {
    expect(comparer(ligne(att), { actions: [...att.actions] }).ok).toBe(true);
  });
  it('ordre inversé, étape en moins ou paramètre faux échouent', () => {
    const [a, s] = att.actions as [(typeof att.actions)[0], (typeof att.actions)[1]];
    expect(comparer(ligne(att), { actions: [s, a] }).raison).toBe('étape 1 : action supprimer au lieu de ajouter');
    expect(comparer(ligne(att), a).raison).toBe('1 étape(s) au lieu de 2');
    expect(comparer(ligne(att), { actions: [a, { action: 'supprimer', params: { nom: 'Marie' } }] }).raison).toBe(
      'étape 2 : supprimer.nom : "Marie" au lieu de "Paul"',
    );
  });
});

describe('comparer : clarifier et refuser', () => {
  const att = { action: 'clarifier', candidats: ['Marie', 'Marie'] } as const;
  it('au moins 1 candidat, présent dans la liste', () => {
    const l = ligne({ action: 'clarifier', candidats: ['Paul'] });
    expect(comparer(l, { action: 'clarifier', candidats: ['Paul'] }).ok).toBe(true);
    expect(comparer(l, { action: 'clarifier', candidats: ['Marie', 'Paul'] }).ok).toBe(true);
    expect(comparer(l, { action: 'clarifier', candidats: [] }).raison).toBe('0 candidat(s) attendu(s) retrouvé(s), 1 au moins');
    // Un nom de la liste qui n'est pas le candidat attendu ne suffit pas (cas abs-05).
    expect(comparer(l, { action: 'clarifier', candidats: ['Marie'] }).raison).toBe('0 candidat(s) attendu(s) retrouvé(s), 1 au moins');
  });
  it('au moins 2 candidats dans homonymes, en respectant les doublons de la liste', () => {
    const l = ligne(att, { categorie: 'homonymes' });
    expect(comparer(l, { action: 'clarifier', candidats: ['Marie'] }).raison).toBe('1 candidat(s) attendu(s) retrouvé(s), 2 au moins');
    expect(comparer(l, { action: 'clarifier', candidats: ['Marie', 'Marie'] }).ok).toBe(true);
    expect(comparer(l, { action: 'clarifier', candidats: ['Marie', 'Marie', 'Paul'] }).ok).toBe(true);
    expect(comparer(l, { action: 'clarifier', candidats: ['Paul', 'Paul'] }).raison).toBe('0 candidat(s) attendu(s) retrouvé(s), 2 au moins');
  });
  it('clarifier attendu, refuser ou action obtenu : échec', () => {
    expect(comparer(ligne(att), { action: 'refuser' }).raison).toBe('refuser au lieu de clarifier');
    expect(comparer(ligne(att), { action: 'lancer' }).raison).toBe('une action au lieu de clarifier');
  });
  it('refuser attendu : tout refus passe, quel que soit le code ; une action échoue', () => {
    const l = ligne({ action: 'refuser' });
    expect(comparer(l, { action: 'refuser', code: 'autre' }).ok).toBe(true);
    expect(comparer(l, { action: 'lancer' }).raison).toBe('une action au lieu de refuser');
    expect(comparer(l, { action: 'clarifier', candidats: ['Paul'] }).ok).toBe(false);
  });
});

describe('comparer : confirmation', () => {
  it('la confirmation calculée doit égaler celle de la ligne', () => {
    const eff = ligne({ action: 'effacerHistorique', params: {} }, { confirmation: true });
    expect(comparer(eff, { action: 'effacerHistorique', params: {} }).ok).toBe(true);
    // Ligne mal annotée : la décision exige une confirmation que la ligne n'attend pas.
    const faux = ligne({ action: 'effacerHistorique', params: {} }, { confirmation: false });
    expect(comparer(faux, { action: 'effacerHistorique', params: {} }).raison).toBe('confirmation true au lieu de false');
  });
  it('deux suppressions demandent confirmation, une seule non', () => {
    const deux = {
      actions: [
        { action: 'supprimer', params: { nom: 'Marie' } },
        { action: 'supprimer', params: { nom: 'Marie' } },
      ],
    };
    expect(comparer(ligne(deux, { confirmation: true }), { actions: [...deux.actions] }).ok).toBe(true);
    expect(comparer(ligne(deux, { confirmation: false }), { actions: [...deux.actions] }).raison).toBe(
      'confirmation true au lieu de false',
    );
  });
});
