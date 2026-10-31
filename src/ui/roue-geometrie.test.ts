// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ARC_MIN_SEPARATEUR,
  corpsLibelle,
  CORPS_MIN,
  estSurRoue,
  geometrie,
  graphemes,
  libellesLisibles,
  rayonInterieurLibelle,
  separateurs,
  TAILLE_MAX_PX,
  taillePixels,
  tronquer,
} from './roue-geometrie';

/** Un caractère vaut une unité par point de code : mesure déterministe. */
const mesure = (t: string): number => Array.from(t).length;

describe('taillePixels', () => {
  it('suit le DPR puis plafonne', () => {
    expect(taillePixels(500, 2)).toBe(1000);
    expect(taillePixels(500.4, 1)).toBe(500);
    expect(taillePixels(2000, 3)).toBe(TAILLE_MAX_PX);
  });
  it('ne descend jamais à zéro et ignore un DPR invalide', () => {
    expect(taillePixels(0, 2)).toBe(1);
    expect(taillePixels(300, 0)).toBe(300);
    expect(taillePixels(300, Number.NaN)).toBe(300);
  });
});

describe('geometrie', () => {
  it('place la sonde sous la pointe, avant la fin des libellés, et sur le disque', () => {
    for (const taille of [200, 300, 600, 2000]) {
      const g = geometrie(taille);
      expect(g.sondeY).toBeGreaterThan(g.pointeY);
      expect(g.centre - g.rayonLibelle).toBeGreaterThan(g.sondeY);
      expect(estSurRoue(g.centre, g.sondeY, g)).toBe(true);
    }
  });
  it('distingue le disque des coins', () => {
    const g = geometrie(600);
    expect(estSurRoue(300, 300, g)).toBe(true);
    expect(estSurRoue(1, 1, g)).toBe(false);
    expect(estSurRoue(300, 300 - g.rayon, g)).toBe(true);
    expect(estSurRoue(300, 300 - g.rayon - 1, g)).toBe(false);
  });
});

describe('corpsLibelle et seuil F10', () => {
  it('plafonne le corps quand la place abonde', () => {
    expect(corpsLibelle(300, 2)).toBeCloseTo(30);
    expect(corpsLibelle(100, 2)).toBeCloseTo(14);
  });
  it('décroît avec le nombre de noms', () => {
    expect(corpsLibelle(300, 300)).toBeLessThan(corpsLibelle(300, 50));
  });
  it('vaut la largeur au rayon de référence, et 0 sans nom', () => {
    expect(corpsLibelle(280, 100)).toBeCloseTo(0.85 * 2 * 210 * Math.sin(Math.PI / 100));
    expect(corpsLibelle(280, 0)).toBe(0);
  });
  it('bascule exactement au corps minimal', () => {
    const rayon = 280;
    let n = 2;
    while (libellesLisibles(rayon, n)) n++;
    expect(corpsLibelle(rayon, n - 1)).toBeGreaterThanOrEqual(CORPS_MIN);
    expect(corpsLibelle(rayon, n)).toBeLessThan(CORPS_MIN);
    expect(n).toBe(102);
  });
  it('dépend de la taille réelle : le même nombre de noms bascule sur une petite roue', () => {
    expect(libellesLisibles(450, 100)).toBe(true);
    expect(libellesLisibles(140, 100)).toBe(false);
  });
  it('garde le texte dans le secteur à son rayon intérieur', () => {
    const r = rayonInterieurLibelle(12, 280, 80);
    expect(12).toBeLessThanOrEqual(0.85 * 2 * r * Math.sin(Math.PI / 80) + 1e-9);
    expect(rayonInterieurLibelle(14, 280, 2)).toBeCloseTo(280 * 0.12);
  });
});

describe('separateurs', () => {
  it('omet le trait quand le secteur devient trop fin', () => {
    expect(separateurs(280, 1000).epaisseur).toBe(0);
    expect(separateurs(140, 200).epaisseur).toBe(0);
    expect(separateurs(280, 1).epaisseur).toBe(0);
  });
  it('garde le trait à la limite exacte', () => {
    const n = 100;
    const rayon = (ARC_MIN_SEPARATEUR * n) / (2 * Math.PI);
    expect(separateurs(rayon, n).epaisseur).toBeCloseTo(0.75);
    expect(separateurs(rayon - 0.01, n).epaisseur).toBe(0);
  });
  it('reste plus fin que la marge d’arrêt de chaque côté', () => {
    for (const n of [2, 10, 100, 200]) {
      const s = separateurs(280, n);
      const arc = (2 * Math.PI * 280) / n;
      expect(s.epaisseur / 2).toBeLessThan(arc * 0.1);
    }
  });
  it('ne noircit pas le centre : le trait démarre là où le secteur est assez large', () => {
    const s = separateurs(280, 200);
    expect(s.rayonDebut).toBeGreaterThan(100);
    expect((2 * Math.PI * s.rayonDebut) / 200).toBeCloseTo(4 * s.epaisseur);
    expect(separateurs(280, 2).rayonDebut).toBeCloseTo(280 * 0.08);
  });
});

describe('tronquer', () => {
  it('rend le nom entier s’il tient', () => {
    expect(tronquer('Anaël', 5, mesure)).toBe('Anaël');
  });
  it('tronque au plus long préfixe avec ellipse', () => {
    expect(tronquer('Bartholomé', 5, mesure)).toBe('Bart…');
  });
  it('ne laisse pas d’espace avant l’ellipse', () => {
    expect(tronquer('Jean Pierre', 6, mesure)).toBe('Jean…');
  });
  it('ne coupe jamais de paire de surrogates', () => {
    const r = tronquer('😀😀😀😀😀', 3, mesure);
    expect(r).toBe('😀😀…');
    expect(/[\uD800-\uDFFF]/u.test(r)).toBe(false);
  });
  it('ne coupe pas un emoji composé', () => {
    expect(tronquer('A👨‍👩‍👧BCDEFGHIJK', 3, mesure)).toBe('A…');
  });
  it('réduit à l’ellipse ou à rien quand la place manque', () => {
    expect(tronquer('Bartholomé', 1, mesure)).toBe('…');
    expect(tronquer('Bartholomé', 0.5, mesure)).toBe('');
  });
});

describe('graphemes', () => {
  it('regroupe une lettre et son accent combinant', () => {
    expect(graphemes('éa')).toEqual(['é', 'a']);
  });
  it('se replie sur les points de code sans Intl.Segmenter', () => {
    expect(graphemes('😀a', null)).toEqual(['😀', 'a']);
  });
});
