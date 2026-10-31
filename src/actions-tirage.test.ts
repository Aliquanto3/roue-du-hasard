// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { creerActions, creerMagasin, type Actions, type ControleAnnonce, type InfoAnnonce } from './actions';
import { etatInitial } from './domain/etat';

const HEURE = new Date('2026-10-31T14:03:09.000Z');

interface Banc {
  actions: Actions;
  rotation: { active: boolean };
  lances: number[];
  /** Annonces ouvertes, et fermetures (avec l'option `restaurerFocus`). */
  ouvertures: InfoAnnonce[];
  fermetures: (boolean | undefined)[];
  annonce: { ouverte: boolean };
  noms(): string[];
  etat(): ReturnType<Actions['magasin']['lire']>;
}

function banc(tirage = 0): Banc {
  const magasin = creerMagasin(etatInitial());
  const rotation = { active: false };
  const lances: number[] = [];
  const ouvertures: InfoAnnonce[] = [];
  const fermetures: (boolean | undefined)[] = [];
  const etatAnnonce = { ouverte: false };
  const annonce: ControleAnnonce = {
    ouverte: () => etatAnnonce.ouverte,
    ouvrir: (info) => {
      etatAnnonce.ouverte = true;
      ouvertures.push(info);
    },
    fermer: (options) => {
      etatAnnonce.ouverte = false;
      fermetures.push(options?.restaurerFocus);
    },
  };
  const actions = creerActions({
    magasin,
    enRotation: () => rotation.active,
    lancer: (i) => lances.push(i),
    tirer: () => tirage,
    annonce,
    maintenant: () => HEURE,
  });
  return {
    actions,
    rotation,
    lances,
    ouvertures,
    fermetures,
    annonce: etatAnnonce,
    noms: () => magasin.lire().participants.map((p) => p.nom),
    etat: () => magasin.lire(),
  };
}

describe('enregistrerTirage', () => {
  it('enregistre le gagnant de l’index, lui donne le prochain cadeau et ouvre l’annonce', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob,Chloé' });
    const bob = b.etat().participants[1];
    b.actions.executer('definirCouleur', { id: bob?.id ?? '', couleur: '#112233' });
    b.actions.executer('collerCadeaux', { texte: 'bougie\nlivre' });
    expect(b.actions.executer('enregistrerTirage', { index: 1 })).toEqual({ ok: true });
    expect(b.etat().historique).toEqual([
      {
        ordre: 1,
        participantId: bob?.id,
        nom: 'Bob',
        cadeau: 'bougie',
        cadeauSupprime: false,
        heure: HEURE.toISOString(),
        retrait: null,
      },
    ]);
    expect(b.etat().attribues).toBe(1);
    expect(b.ouvertures).toEqual([
      { ordre: 1, nom: 'Bob', couleur: '#112233', cadeau: 'bougie', retraitPrevu: false },
    ]);
  });

  it('annonce la couleur par défaut du secteur et le retrait prévu (F19), sans cadeau', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob' });
    b.actions.executer('definirRetirerGagnants', { valeur: true });
    b.actions.executer('enregistrerTirage', { index: 0 });
    const info = b.ouvertures[0];
    expect(info?.couleur).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(info).toMatchObject({ nom: 'Ana', cadeau: null, retraitPrevu: true });
    // Le gagnant ne sort qu'à la fermeture.
    expect(b.noms()).toEqual(['Ana', 'Bob']);
  });

  it('refuse un index sans participant et ne change rien', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob' });
    const avant = b.etat();
    for (const index of [-1, 2, 0.5]) {
      expect(b.actions.executer('enregistrerTirage', { index })).toEqual({ ok: false, code: 'introuvable' });
    }
    expect(b.etat()).toBe(avant);
    expect(b.ouvertures).toEqual([]);
  });

  it('refuse quand tous les cadeaux sont attribués', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob' });
    b.actions.executer('ajouterCadeau', { nom: 'bougie' });
    b.actions.executer('enregistrerTirage', { index: 0 });
    const avant = b.etat();
    expect(b.actions.executer('enregistrerTirage', { index: 1 })).toEqual({ ok: false, code: 'cadeaux-epuises' });
    expect(b.etat()).toBe(avant);
    expect(b.ouvertures).toHaveLength(1);
  });
});

describe('lancer et cadeaux épuisés (F12)', () => {
  it('refuse le lancement avec cadeaux-epuises, sans lancer la roue', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob' });
    b.actions.executer('ajouterCadeau', { nom: 'bougie' });
    b.actions.executer('enregistrerTirage', { index: 0 });
    b.actions.executer('fermerAnnonce', {});
    expect(b.actions.lancementInterdit()).toBe('cadeaux-epuises');
    expect(b.actions.executer('lancer', {})).toEqual({ ok: false, code: 'cadeaux-epuises' });
    expect(b.lances).toEqual([]);
    expect(b.actions.executer('recommencerAttributions', {})).toEqual({ ok: true });
    expect(b.etat().attribues).toBe(0);
    expect(b.actions.lancementInterdit()).toBeNull();
    expect(b.actions.executer('lancer', {})).toEqual({ ok: true });
    expect(b.lances).toHaveLength(1);
  });

  it('refuse de lancer tant que l’annonce est ouverte', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob' });
    b.actions.executer('enregistrerTirage', { index: 0 });
    expect(b.actions.executer('lancer', {})).toEqual({ ok: false, code: 'annonce-ouverte' });
    expect(b.lances).toEqual([]);
  });
});

describe('fermerAnnonce', () => {
  it('refuse quand aucune annonce n’est ouverte', () => {
    const b = banc();
    expect(b.actions.executer('fermerAnnonce', {})).toEqual({ ok: false, code: 'annonce-fermee' });
    expect(b.fermetures).toEqual([]);
  });

  it('ferme l’annonce et garde le gagnant si l’option est décochée', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob' });
    b.actions.executer('enregistrerTirage', { index: 0 });
    expect(b.actions.executer('fermerAnnonce', {})).toEqual({ ok: true });
    expect(b.annonce.ouverte).toBe(false);
    expect(b.noms()).toEqual(['Ana', 'Bob']);
  });

  it('retire le gagnant à la fermeture si l’option est cochée (F19), et note le retrait', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob,Chloé' });
    b.actions.executer('definirRetirerGagnants', { valeur: true });
    b.actions.executer('enregistrerTirage', { index: 1 });
    b.actions.executer('fermerAnnonce', {});
    expect(b.noms()).toEqual(['Ana', 'Chloé']);
    expect(b.etat().historique[0]?.retrait).toEqual({ couleur: null });
  });
});

describe('relancer', () => {
  it('refuse sans annonce ouverte', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob' });
    expect(b.actions.executer('relancer', {})).toEqual({ ok: false, code: 'annonce-fermee' });
    expect(b.actions.relancementInterdit()).toBe('annonce-fermee');
    expect(b.lances).toEqual([]);
  });

  it('avec l’option cochée, le gagnant sort avant la nouvelle rotation, tirée sur les noms restants', () => {
    const b = banc(1);
    b.actions.executer('coller', { texte: 'Ana,Bob,Chloé' });
    b.actions.executer('definirRetirerGagnants', { valeur: true });
    b.actions.executer('enregistrerTirage', { index: 0 });
    expect(b.actions.relancementInterdit()).toBeNull();
    expect(b.actions.executer('relancer', {})).toEqual({ ok: true });
    expect(b.noms()).toEqual(['Bob', 'Chloé']);
    expect(b.lances).toEqual([1]);
    // Le focus n'est pas rendu : une rotation suit.
    expect(b.fermetures).toEqual([false]);
    expect(b.annonce.ouverte).toBe(false);
  });

  it('sans l’option, relance sur tous les noms', () => {
    const b = banc(0);
    b.actions.executer('coller', { texte: 'Ana,Bob' });
    b.actions.executer('enregistrerTirage', { index: 1 });
    expect(b.actions.executer('relancer', {})).toEqual({ ok: true });
    expect(b.noms()).toEqual(['Ana', 'Bob']);
    expect(b.lances).toEqual([0]);
  });

  it('refuse sans rien modifier s’il ne resterait qu’un nom après le retrait', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob' });
    b.actions.executer('definirRetirerGagnants', { valeur: true });
    b.actions.executer('enregistrerTirage', { index: 0 });
    const avant = b.etat();
    expect(b.actions.relancementInterdit()).toBe('moins-de-2-noms');
    expect(b.actions.executer('relancer', {})).toEqual({ ok: false, code: 'moins-de-2-noms' });
    expect(b.etat()).toBe(avant);
    expect(b.annonce.ouverte).toBe(true);
    expect(b.lances).toEqual([]);
  });

  it('refuse avec cadeaux-epuises quand le dernier cadeau vient d’être attribué', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob' });
    b.actions.executer('ajouterCadeau', { nom: 'bougie' });
    b.actions.executer('enregistrerTirage', { index: 0 });
    expect(b.actions.relancementInterdit()).toBe('cadeaux-epuises');
    expect(b.actions.executer('relancer', {})).toEqual({ ok: false, code: 'cadeaux-epuises' });
    expect(b.annonce.ouverte).toBe(true);
  });
});

describe('cadeaux', () => {
  it('ajoute, colle, renomme et supprime, avec leurs refus', () => {
    const b = banc();
    expect(b.actions.executer('ajouterCadeau', { nom: '  bougie  ' })).toEqual({ ok: true });
    expect(b.actions.executer('ajouterCadeau', { nom: '   ' })).toEqual({ ok: false, code: 'nom-vide' });
    expect(b.actions.executer('collerCadeaux', { texte: 'livre\nstylo, tasse;' })).toEqual({ ok: true });
    expect(b.actions.executer('collerCadeaux', { texte: ' ,; \n' })).toEqual({ ok: false, code: 'nom-vide' });
    expect(b.etat().cadeaux).toEqual(['bougie', 'livre', 'stylo', 'tasse']);
    expect(b.actions.executer('renommerCadeau', { index: 1, nom: ' roman ' })).toEqual({ ok: true });
    expect(b.actions.executer('renommerCadeau', { index: 1, nom: '' })).toEqual({ ok: false, code: 'nom-vide' });
    for (const index of [-1, 4, 1.5]) {
      expect(b.actions.executer('renommerCadeau', { index, nom: 'x' })).toEqual({ ok: false, code: 'introuvable' });
      expect(b.actions.executer('supprimerCadeau', { index })).toEqual({ ok: false, code: 'introuvable' });
    }
    expect(b.actions.executer('supprimerCadeau', { index: 0 })).toEqual({ ok: true });
    expect(b.etat().cadeaux).toEqual(['roman', 'stylo', 'tasse']);
  });
});

describe('historique et annulation (F13)', () => {
  it('refuse d’annuler un historique vide', () => {
    const b = banc();
    expect(b.actions.executer('annulerDernierTirage', {})).toEqual({ ok: false, code: 'historique-vide' });
  });

  it('annule le dernier tirage : ligne retirée, cadeau rendu, annonce fermée d’abord', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob' });
    b.actions.executer('ajouterCadeau', { nom: 'bougie' });
    b.actions.executer('enregistrerTirage', { index: 0 });
    expect(b.annonce.ouverte).toBe(true);
    expect(b.actions.executer('annulerDernierTirage', {})).toEqual({ ok: true });
    expect(b.annonce.ouverte).toBe(false);
    expect(b.etat().historique).toEqual([]);
    expect(b.etat().attribues).toBe(0);
    expect(b.noms()).toEqual(['Ana', 'Bob']);
  });

  it('avec F19, remet le gagnant retiré à sa place d’origine', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob,Chloé' });
    b.actions.executer('definirRetirerGagnants', { valeur: true });
    b.actions.executer('enregistrerTirage', { index: 1 });
    b.actions.executer('fermerAnnonce', {});
    expect(b.noms()).toEqual(['Ana', 'Chloé']);
    b.actions.executer('annulerDernierTirage', {});
    expect(b.noms()).toEqual(['Ana', 'Bob', 'Chloé']);
    expect(b.etat().historique).toEqual([]);
  });

  it('annulation avec l’annonce ouverte et F19 : le gagnant n’est jamais retiré', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob,Chloé' });
    b.actions.executer('definirRetirerGagnants', { valeur: true });
    b.actions.executer('enregistrerTirage', { index: 1 });
    b.actions.executer('annulerDernierTirage', {});
    expect(b.noms()).toEqual(['Ana', 'Bob', 'Chloé']);
  });

  it('efface l’historique sans toucher aux cadeaux attribués, et recommence les attributions', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob' });
    b.actions.executer('collerCadeaux', { texte: 'a,b' });
    b.actions.executer('enregistrerTirage', { index: 0 });
    b.actions.executer('fermerAnnonce', {});
    expect(b.actions.executer('effacerHistorique', {})).toEqual({ ok: true });
    expect(b.etat().historique).toEqual([]);
    expect(b.etat().attribues).toBe(1);
    b.actions.executer('recommencerAttributions', {});
    expect(b.etat().attribues).toBe(0);
  });

  it('définit l’option de retrait des gagnants', () => {
    const b = banc();
    expect(b.etat().retirerGagnants).toBe(false);
    expect(b.actions.executer('definirRetirerGagnants', { valeur: true })).toEqual({ ok: true });
    expect(b.etat().retirerGagnants).toBe(true);
    const etat = b.etat();
    b.actions.executer('definirRetirerGagnants', { valeur: true });
    expect(b.etat()).toBe(etat);
  });
});

describe('attribuerSansRotation (F19)', () => {
  it('refuse avec deux noms, sans cadeau, ou cadeaux épuisés', () => {
    const b = banc();
    b.actions.executer('coller', { texte: 'Ana,Bob' });
    b.actions.executer('ajouterCadeau', { nom: 'bougie' });
    expect(b.actions.executer('attribuerSansRotation', {})).toEqual({ ok: false, code: 'attribution-impossible' });
    const c = banc();
    c.actions.executer('ajouter', { nom: 'Ana' });
    expect(c.actions.executer('attribuerSansRotation', {})).toEqual({ ok: false, code: 'attribution-impossible' });
    c.actions.executer('ajouterCadeau', { nom: 'bougie' });
    c.actions.executer('attribuerSansRotation', {});
    c.actions.executer('fermerAnnonce', {});
    expect(c.actions.executer('attribuerSansRotation', {})).toEqual({ ok: false, code: 'attribution-impossible' });
    expect(c.ouvertures).toHaveLength(1);
  });

  it('attribue le cadeau au seul nom, ouvre l’annonce, sans lancer la roue', () => {
    const b = banc();
    b.actions.executer('ajouter', { nom: 'Ana' });
    b.actions.executer('ajouterCadeau', { nom: 'bougie' });
    expect(b.actions.executer('attribuerSansRotation', {})).toEqual({ ok: true });
    expect(b.lances).toEqual([]);
    expect(b.etat().attribues).toBe(1);
    expect(b.etat().historique[0]).toMatchObject({ nom: 'Ana', cadeau: 'bougie', heure: HEURE.toISOString() });
    expect(b.ouvertures[0]).toMatchObject({ nom: 'Ana', cadeau: 'bougie', retraitPrevu: false });
    expect(b.actions.executer('attribuerSansRotation', {})).toEqual({ ok: false, code: 'annonce-ouverte' });
  });

  it('avec l’option cochée, le nom est retiré aussitôt', () => {
    const b = banc();
    b.actions.executer('ajouter', { nom: 'Ana' });
    b.actions.executer('ajouterCadeau', { nom: 'bougie' });
    b.actions.executer('definirRetirerGagnants', { valeur: true });
    b.actions.executer('attribuerSansRotation', {});
    expect(b.noms()).toEqual([]);
    expect(b.ouvertures[0]).toMatchObject({ nom: 'Ana', retraitPrevu: false });
  });
});
