// @vitest-environment node
// Cas du lot `dev` (catégorie « transcription orale ») ou inventés : jamais ceux des lots `test` et `test2`.
import { describe, expect, it } from 'vitest';
import { comparer, decisionEffective } from '../banc/comparateur';
import { lireCorpus } from '../banc/cli';
import {
  correctionsAConfirmer,
  estNomNouveau,
  nomsNonEntendus,
  rapprocher,
  SCORE_EXACT,
  SCORE_PHONETIQUE,
  SCORE_PHONETIQUE_SOUPLE,
  SEUIL_CORRECTION,
} from './oral';
import { decideRegles } from './regles';
import type { Decision } from './types';

const noms = ['Marie', 'Paul', 'Zoé', 'Léa'];

describe('constantes', () => {
  it('le seuil sépare la phonétique stricte (appliquée) de la phonétique souple et du proche (confirmés)', () => {
    expect(SCORE_EXACT).toBe(1);
    expect(SCORE_PHONETIQUE).toBeGreaterThanOrEqual(SEUIL_CORRECTION);
    expect(SCORE_PHONETIQUE_SOUPLE).toBeLessThan(SEUIL_CORRECTION);
  });
});

describe('rapprocher', () => {
  it('« mari » et « pol » : même clé phonétique stricte, appliqués sans question (0,9)', () => {
    const r = rapprocher('retire mari et pol', noms);
    expect(r.texte).toBe('retire Marie et Paul');
    expect(r.corrections).toEqual([
      { avant: 'mari', apres: 'Marie', score: 0.9, methode: 'phonetique', appliquee: true },
      { avant: 'pol', apres: 'Paul', score: 0.9, methode: 'phonetique', appliquee: true },
    ]);
    expect(r.aConfirmer).toBe(false);
  });

  it('Thibaut pour Thibault : proche, sous le seuil, donc à confirmer', () => {
    const r = rapprocher('supprime Thibaut', ['Thibault', 'Léa']);
    expect(r.texte).toBe('supprime Thibault');
    expect(r.corrections).toHaveLength(1);
    const [c] = r.corrections;
    expect(c).toMatchObject({ avant: 'Thibaut', apres: 'Thibault', appliquee: false });
    expect(c?.score).toBeLessThan(SEUIL_CORRECTION);
    expect(c?.score).toBeGreaterThanOrEqual(0.6);
    expect(r.aConfirmer).toBe(true);
  });

  it('Gaëtan écrit « gaétan » ou « Gaétan » : exact (accent seul), corrigé à 1', () => {
    const r = rapprocher('supprime gaétan', ['Gaëtan', 'Léa']);
    expect(r.texte).toBe('supprime Gaëtan');
    expect(r.corrections).toEqual([{ avant: 'gaétan', apres: 'Gaëtan', score: 1, methode: 'exact', appliquee: true }]);
  });

  it('Anaël écrit « Anael » : exact, rien à confirmer', () => {
    const r = rapprocher('retire Anael', ['Anaël', 'Léa']);
    expect(r.texte).toBe('retire Anaël');
    expect(r.aConfirmer).toBe(false);
  });

  it('un prénom déjà exact n’est pas une correction', () => {
    const r = rapprocher('supprime Marie', noms);
    expect(r).toEqual({ texte: 'supprime Marie', corrections: [], aConfirmer: false });
  });

  it('homonymes (Marie et Mari, même clé) : deux prénoms au même rang, aucune correction, la cascade demandera', () => {
    const r = rapprocher('supprime Marri', ['Marie', 'Mari']);
    expect(r.texte).toBe('supprime Marri');
    expect(r.corrections).toEqual([]);
  });

  it('nom composé : « Marie-Claire » ne devient pas « Marie »', () => {
    const r = rapprocher('supprime Marie-Claire', ['Marie', 'Paul']);
    expect(r.texte).toBe('supprime Marie-Claire');
    expect(r.corrections).toEqual([]);
  });

  it('nom composé dicté en deux mots : le groupe est rapproché avant le mot seul', () => {
    const r = rapprocher('supprime Marie Claire', ['Marie-Claire', 'Marie']);
    expect(r.texte).toBe('supprime Marie-Claire');
    expect(r.corrections).toEqual([{ avant: 'Marie Claire', apres: 'Marie-Claire', score: 1, methode: 'exact', appliquee: true }]);
  });

  it('la ponctuation de bord est gardée', () => {
    expect(rapprocher('retire pol, puis mari.', noms).texte).toBe('retire Paul, puis Marie.');
  });

  it('les mots de la commande ne sont pas pris pour des prénoms', () => {
    const r = rapprocher('mets Paul en bleu', ['Paul', 'Bleue', 'Roue']);
    expect(r).toEqual({ texte: 'mets Paul en bleu', corrections: [], aConfirmer: false });
  });

  it('nom nouveau : ce qui suit « ajoute » et « renomme X en » n’est jamais rapproché', () => {
    expect(rapprocher('ajoute Mari', noms)).toEqual({ texte: 'ajoute Mari', corrections: [], aConfirmer: false });
    const r = rapprocher('renomme pol en Mari', noms);
    expect(r.texte).toBe('renomme Paul en Mari');
    expect(r.corrections).toHaveLength(1);
  });

  it('verbes de regles.ts : « intègre », « incorpore », « add », « colle » protègent le nom qui suit', () => {
    for (const verbe of ['intègre', 'incorpore', 'add', 'colle', 'importe']) {
      expect(rapprocher(`${verbe} Mari`, noms)).toEqual({ texte: `${verbe} Mari`, corrections: [], aConfirmer: false });
    }
  });

  it('« change le nom de pol en Mari » : pol est corrigé, le nouveau nom reste tel quel', () => {
    const r = rapprocher('change le nom de pol en Mari', noms);
    expect(r.texte).toBe('change le nom de Paul en Mari');
    expect(r.corrections).toHaveLength(1);
  });

  it('un verbe de commande n’est pas rapproché d’un prénom', () => {
    expect(rapprocher('annule vide efface', ['Anule', 'Vide', 'Efface2']).corrections).toEqual([]);
  });

  it('un seuil plus haut met tout sous confirmation, un seuil plus bas rien', () => {
    expect(rapprocher('retire mari', noms, 0.95).aConfirmer).toBe(true);
    expect(rapprocher('supprime Thibaut', ['Thibault'], 0.5).aConfirmer).toBe(false);
  });

  it('rien d’entendu qui ressemble : texte inchangé', () => {
    expect(rapprocher('lance la roue', noms)).toEqual({ texte: 'lance la roue', corrections: [], aConfirmer: false });
  });
});

describe('correctionsAConfirmer', () => {
  const r = rapprocher('retire mari', noms);
  it('action non destructive : seuil seul (0,9 passe)', () => {
    expect(correctionsAConfirmer(r, ['lancer'])).toEqual([]);
  });
  it('action destructive : toute correction non exacte est confirmée, même à 0,9', () => {
    expect(correctionsAConfirmer(r, ['supprimer'])).toHaveLength(1);
    expect(correctionsAConfirmer(r, ['renommer'])).toHaveLength(1);
    expect(correctionsAConfirmer(r, ['effacerHistorique'])).toHaveLength(1);
  });
  it('une correction exacte (accent seul) n’est jamais confirmée', () => {
    expect(correctionsAConfirmer(rapprocher('retire zoe', noms), ['supprimer'])).toEqual([]);
  });
});

describe('estNomNouveau', () => {
  it('compare sans accents ni casse', () => {
    expect(estNomNouveau('ZOE', noms)).toBe(false);
    expect(estNomNouveau('Camille', noms)).toBe(true);
  });
});

describe('nomsNonEntendus', () => {
  it('rend les noms visés absents tels quels de la commande (accents, casse, ponctuation, nom composé)', () => {
    expect(nomsNonEntendus('supprime Virgini', ['Virginie'])).toEqual(['Virginie']);
    expect(nomsNonEntendus('Supprime ZOE, puis Marie-Claire.', ['Zoé', 'Marie-Claire'])).toEqual([]);
    expect(nomsNonEntendus('supprime Marie Claire', ['Marie-Claire'])).toEqual(['Marie-Claire']);
    expect(nomsNonEntendus('supprime Mariette', ['Marie'])).toEqual(['Marie']);
  });
});

describe('lot dev, transcription orale : rapprochement puis règles', () => {
  const lignes = lireCorpus().filter((l) => l.lot === 'dev' && l.categorie === 'transcription_orale');

  it('le lot contient des lignes', () => {
    expect(lignes.length).toBeGreaterThanOrEqual(7);
  });

  it.each(lignes.map((l) => [l.id, l] as const))('%s', (_id, ligne) => {
    const r = rapprocher(ligne.commande, ligne.etat.noms);
    // Aucune de ces lignes n'est à confirmer par la correction : les écarts sont de la phonétique stricte.
    expect(r.aConfirmer).toBe(false);
    const obtenue: Decision = decideRegles(r.texte, ligne.etat)?.decision ?? { action: 'refuser', code: 'incompris' };
    expect(comparer(ligne, decisionEffective(obtenue, ligne.etat))).toEqual({ ok: true, raison: '' });
  });
});
