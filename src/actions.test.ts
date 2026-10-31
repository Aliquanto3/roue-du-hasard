// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ACTIONS, creerActions, creerMagasin, type Actions, type NomAction } from './actions';
import { etatInitial, type Etat } from './domain/etat';

interface Banc {
  actions: Actions;
  rotation: { active: boolean };
  lances: number[];
  noms(): string[];
}

function banc(initial: Etat = etatInitial(), tirage = 1): Banc {
  const magasin = creerMagasin(initial);
  const rotation = { active: false };
  const lances: number[] = [];
  const actions = creerActions({
    magasin,
    enRotation: () => rotation.active,
    lancer: (i) => lances.push(i),
    tirer: () => tirage,
  });
  return { actions, rotation, lances, noms: () => magasin.lire().participants.map((p) => p.nom) };
}

describe('magasin', () => {
  it('prévient les abonnés avec le nouvel état et le précédent, pas pour une même référence', () => {
    const a = etatInitial();
    const m = creerMagasin(a);
    const vus: [Etat, Etat][] = [];
    const stop = m.abonner((e, p) => vus.push([e, p]));
    m.remplacer(a);
    expect(vus).toHaveLength(0);
    const b = { ...a, sonCoupe: true };
    m.remplacer(b);
    expect(vus).toEqual([[b, a]]);
    expect(m.lire()).toBe(b);
    stop();
    m.remplacer(a);
    expect(vus).toHaveLength(1);
  });
});

describe('édition', () => {
  it('ajoute un nom normalisé et refuse un nom vide', () => {
    const b = banc();
    expect(b.actions.executer('ajouter', { nom: '  Marie  ' })).toEqual({ ok: true });
    expect(b.actions.executer('ajouter', { nom: '   ' })).toEqual({ ok: false, code: 'nom-vide' });
    expect(b.noms()).toEqual(['Marie']);
  });

  it('colle une liste (lignes, virgules, points-virgules) et refuse un collage sans nom', () => {
    const b = banc();
    expect(b.actions.executer('coller', { texte: 'Ana\nBob, Chloé;Dan\n\n' })).toEqual({ ok: true });
    expect(b.noms()).toEqual(['Ana', 'Bob', 'Chloé', 'Dan']);
    expect(b.actions.executer('coller', { texte: ' \n ,; ' })).toEqual({ ok: false, code: 'nom-vide' });
    expect(b.noms()).toHaveLength(4);
  });

  it('renomme et supprime, avec refus pour un identifiant inconnu ou un nom vide', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob' });
    expect(b.actions.executer('renommer', { id: 'p1', nom: 'Anna' })).toEqual({ ok: true });
    expect(b.actions.executer('renommer', { id: 'p1', nom: ' ' })).toEqual({ ok: false, code: 'nom-vide' });
    expect(b.actions.executer('renommer', { id: 'zz', nom: 'X' })).toEqual({ ok: false, code: 'introuvable' });
    expect(b.actions.executer('supprimer', { id: 'zz' })).toEqual({ ok: false, code: 'introuvable' });
    expect(b.actions.executer('supprimer', { id: 'p2' })).toEqual({ ok: true });
    expect(b.noms()).toEqual(['Anna']);
  });

  it('un nom hostile reste du texte inerte, tronqué à 60 caractères', () => {
    const b = banc();
    const hostile = `<img src=x onerror=alert(1)>${'x'.repeat(80)}`;
    b.actions.executer('ajouter', { nom: hostile });
    expect(b.noms()[0]).toBe(hostile.slice(0, 60));
  });
});

describe('couleurs', () => {
  it('ne modifie que le nom visé, refuse un format invalide, puis revient au défaut', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob,Chloé' });
    const lire = (): (string | null)[] => b.actions.magasin.lire().participants.map((p) => p.couleur);
    expect(b.actions.executer('definirCouleur', { id: 'p2', couleur: '#AABBCC' })).toEqual({ ok: true });
    expect(lire()).toEqual([null, '#aabbcc', null]);
    expect(b.actions.executer('definirCouleur', { id: 'p2', couleur: 'rouge' })).toEqual({
      ok: false,
      code: 'couleur-invalide',
    });
    expect(b.actions.executer('definirCouleur', { id: 'zz', couleur: '#000000' })).toEqual({
      ok: false,
      code: 'introuvable',
    });
    b.actions.executer('definirCouleur', { id: 'p1', couleur: '#010203' });
    expect(b.actions.executer('reinitialiserCouleur', { id: 'p2' })).toEqual({ ok: true });
    expect(lire()).toEqual(['#010203', null, null]);
    expect(b.actions.executer('reinitialiserCouleur', { id: 'zz' })).toEqual({ ok: false, code: 'introuvable' });
    expect(b.actions.executer('reinitialiserCouleurs', {})).toEqual({ ok: true });
    expect(lire()).toEqual([null, null, null]);
  });
});

describe('lancement', () => {
  it('est refusé à 0 et 1 nom, sans lancer la roue', () => {
    const b = banc();
    expect(b.actions.executer('lancer', {})).toEqual({ ok: false, code: 'moins-de-2-noms' });
    b.actions.executer('ajouter', { nom: 'Ana' });
    expect(b.actions.executer('lancer', {})).toEqual({ ok: false, code: 'moins-de-2-noms' });
    expect(b.actions.lancementInterdit()).toBe('moins-de-2-noms');
    expect(b.lances).toEqual([]);
  });

  it('tire avant de lancer et passe l’index tiré à la roue', () => {
    const b = banc(etatInitial(), 2);
    b.actions.executer('coller', { texte: 'A,B,C' });
    expect(b.actions.lancementInterdit()).toBeNull();
    expect(b.actions.executer('lancer', {})).toEqual({ ok: true });
    expect(b.lances).toEqual([2]);
  });

  it('tire par tirerIndex (dans [0, n)) quand aucune source n’est injectée', () => {
    const magasin = creerMagasin();
    const lances: number[] = [];
    const actions = creerActions({ magasin, enRotation: () => false, lancer: (i) => lances.push(i) });
    actions.executer('coller', { texte: 'A,B,C,D' });
    for (let i = 0; i < 50; i++) actions.executer('lancer', {});
    expect(lances).toHaveLength(50);
    expect(lances.every((i) => Number.isInteger(i) && i >= 0 && i < 4)).toBe(true);
  });
});

describe('verrou F8 : toute action est refusée pendant une rotation', () => {
  const params: { [N in NomAction]: Parameters<(typeof ACTIONS)[N]['executer']>[1] } = {
    ajouter: { nom: 'X' },
    coller: { texte: 'X,Y' },
    renommer: { id: 'p1', nom: 'Z' },
    supprimer: { id: 'p1' },
    definirCouleur: { id: 'p1', couleur: '#123456' },
    reinitialiserCouleur: { id: 'p1' },
    reinitialiserCouleurs: {},
    lancer: {},
  };

  for (const nom of Object.keys(params) as NomAction[]) {
    it(`${nom} renvoie rotation-en-cours et ne change rien`, () => {
      const b = banc();
      b.actions.executer('coller', { texte: 'Ana,Bob' });
      const avant = b.actions.magasin.lire();
      b.rotation.active = true;
      expect(b.actions.executer(nom, params[nom])).toEqual({ ok: false, code: 'rotation-en-cours' });
      expect(b.actions.magasin.lire()).toBe(avant);
      expect(b.lances).toEqual([]);
      expect(b.actions.lancementInterdit()).toBe('rotation-en-cours');
      b.rotation.active = false;
      expect(b.actions.executer('ajouter', { nom: 'Après' })).toEqual({ ok: true });
    });
  }

  it('la table décrit chaque action avec ses refus possibles', () => {
    for (const [cle, action] of Object.entries(ACTIONS)) {
      expect(action.nom).toBe(cle);
      expect(action.description).not.toBe('');
      expect(action.refusPossibles).toContain('rotation-en-cours');
    }
  });
});
