import { describe, expect, it } from "vitest";
import { MARGE_SECTEUR, angleArret, indexSousPointeur, rotationFinale, sourceCrypto, tirerIndex } from "./tirage";

/** Générateur déterministe mulberry32 (uint32). */
function graine(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

describe("tirerIndex", () => {
  it("χ² sur 1 000 000 de tirages à 7 noms, non rejeté à p = 0,001 (seuil 22,458)", () => {
    const n = 7;
    const total = 1_000_000;
    const source = graine(20261031);
    const comptes = new Array<number>(n).fill(0);
    for (let i = 0; i < total; i++) {
      const k = tirerIndex(n, source);
      comptes[k] = (comptes[k] ?? 0) + 1;
    }
    const attendu = total / n;
    const chi2 = comptes.reduce((s, o) => s + (o - attendu) ** 2 / attendu, 0);
    expect(comptes.reduce((s, o) => s + o, 0)).toBe(total);
    expect(chi2).toBeLessThan(22.458);
  });

  it("rejette les valeurs du dernier bloc incomplet", () => {
    // n = 3 : 2^32 mod 3 = 1, donc 2^32 - 1 est rejeté.
    const valeurs = [4294967295, 4294967295, 7];
    let appels = 0;
    const r = tirerIndex(3, () => valeurs[appels++] as number);
    expect(appels).toBe(3);
    expect(r).toBe(1);
  });

  it("accepte la plus grande valeur non rejetée", () => {
    expect(tirerIndex(3, () => 4294967294)).toBe(4294967294 % 3);
  });

  it("n = 1 renvoie toujours 0 et n puissance de 2 ne rejette rien", () => {
    expect(tirerIndex(1, () => 123456)).toBe(0);
    let appels = 0;
    expect(tirerIndex(8, () => (appels++, 4294967295))).toBe(7);
    expect(appels).toBe(1);
  });

  it("refuse un n invalide", () => {
    for (const n of [0, -1, 1.5, NaN, 2 ** 32 + 1]) {
      expect(() => tirerIndex(n, () => 0)).toThrow(RangeError);
    }
  });

  it("la source par défaut (crypto) reste dans les bornes", () => {
    for (let i = 0; i < 200; i++) {
      const r = tirerIndex(5);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(5);
    }
    expect(Number.isInteger(sourceCrypto())).toBe(true);
  });
});

describe("angleArret / indexSousPointeur", () => {
  it("retombe dans le secteur tiré, hors frontières, pour n de 2 à 1000", () => {
    const source = graine(42);
    for (let n = 2; n <= 1000; n++) {
      const largeur = 360 / n;
      const indices = [0, n - 1, tirerIndex(n, source), tirerIndex(n, source)];
      for (const index of indices) {
        for (const extreme of [0, 4294967295, undefined]) {
          const angle = angleArret(index, n, extreme === undefined ? source : () => extreme);
          expect(indexSousPointeur(angle, n)).toBe(index);
          const frac = angle / largeur - index;
          expect(frac).toBeGreaterThanOrEqual(MARGE_SECTEUR - 1e-9);
          expect(frac).toBeLessThanOrEqual(1 - MARGE_SECTEUR + 1e-9);
        }
      }
    }
  });

  it("fournit les bornes exactes de la marge", () => {
    expect(angleArret(0, 4, () => 0)).toBeCloseTo(9, 9);
    expect(angleArret(3, 4, () => 2 ** 31)).toBeCloseTo(3 * 90 + 45, 9);
  });

  it("refuse un index hors secteur", () => {
    expect(() => angleArret(5, 5, () => 0)).toThrow(RangeError);
    expect(() => angleArret(-1, 5, () => 0)).toThrow(RangeError);
    expect(() => angleArret(0, 0, () => 0)).toThrow(RangeError);
  });

  it("indexSousPointeur : convention horaire depuis le haut, modulo 360", () => {
    expect(indexSousPointeur(0, 4)).toBe(0);
    expect(indexSousPointeur(89.999, 4)).toBe(0);
    expect(indexSousPointeur(90, 4)).toBe(1);
    expect(indexSousPointeur(359.9, 4)).toBe(3);
    expect(indexSousPointeur(360, 4)).toBe(0);
    expect(indexSousPointeur(-1, 4)).toBe(3);
    expect(indexSousPointeur(450, 4)).toBe(1);
  });

  it("rotationFinale amène l'angle sous le pointeur", () => {
    expect(rotationFinale(0)).toBe(0);
    expect(rotationFinale(90)).toBe(270);
    expect(rotationFinale(450)).toBe(270);
  });
});
