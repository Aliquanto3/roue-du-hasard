import { describe, expect, it } from "vitest";
import matriceJson from "./palette-matrice.json";
import {
  BLANC,
  NOIR,
  PALETTE,
  SEPARATEUR,
  SEUIL_DELTA_E,
  contraste,
  couleurTexte,
  couleursParDefaut,
  indicesParDefaut,
} from "./palette";

const { matrice, couleurs, minToutesPaires, minCycle } = matriceJson as {
  matrice: number[][];
  couleurs: string[];
  minToutesPaires: number;
  minCycle: number;
};

function delta(hexA: string, hexB: string): number {
  return matrice[couleurs.indexOf(hexA)]![couleurs.indexOf(hexB)]!;
}

function verifierVoisines(seq: string[]): void {
  const n = seq.length;
  for (let i = 0; i < n; i++) {
    const a = seq[i]!;
    const b = seq[(i + 1) % n]!;
    expect(a, `secteur ${i} / n=${n}`).not.toBe(b);
    expect(delta(a, b), `${a}-${b} secteur ${i} / n=${n}`).toBeGreaterThanOrEqual(SEUIL_DELTA_E);
  }
}

describe("fixture de mesure CVD", () => {
  it("couvre la palette dans l'ordre", () => {
    expect(couleurs).toEqual(PALETTE.map((c) => c.hex));
  });
  it("redonne les mesures de la spec (arrondies à 0,1)", () => {
    expect(minToutesPaires).toBeCloseTo(7.9, 1);
    expect(matrice[0]![3]).toBeCloseTo(7.93, 2); // orange-rose
    expect(minCycle).toBeCloseTo(18.0, 1); // 17,96 mesuré
  });
  it("est symétrique à diagonale nulle", () => {
    matrice.forEach((l, i) =>
      l.forEach((v, j) => {
        expect(v).toBe(matrice[j]![i]);
        if (i === j) expect(v).toBe(0);
      }),
    );
  });
});

describe("couleursParDefaut", () => {
  it("cas limites", () => {
    expect(couleursParDefaut(0)).toEqual([]);
    expect(couleursParDefaut(-3)).toEqual([]);
    expect(couleursParDefaut(1)).toEqual(["#E69F00"]);
    expect(couleursParDefaut(2)).toHaveLength(2);
  });
  it("commence par la palette dans l'ordre pour de petits n", () => {
    expect(couleursParDefaut(3).length).toBe(3);
    expect(couleursParDefaut(200)[0]).toBe("#E69F00");
  });
  it("est déterministe", () => {
    expect(couleursParDefaut(37)).toEqual(couleursParDefaut(37));
  });
  it("n = 2 à 200 : chaque paire voisine, bouclage compris, atteint le seuil", () => {
    for (let n = 2; n <= 200; n++) {
      const seq = couleursParDefaut(n);
      expect(seq).toHaveLength(n);
      verifierVoisines(seq);
    }
  });
  it("grands n", () => {
    for (const n of [201, 500, 997, 1000, 1001, 5000, 20003]) {
      const seq = couleursParDefaut(n);
      expect(seq).toHaveLength(n);
      verifierVoisines(seq);
    }
  });
  it("le motif est suivi jusqu'à la fin ajustée", () => {
    const idx = indicesParDefaut(1000);
    expect(idx.slice(0, 900)).toEqual(indicesParDefaut(1001).slice(0, 900));
  });
  it("n'utilise que des couleurs de la palette", () => {
    const hexes = new Set(PALETTE.map((c) => c.hex));
    for (const c of couleursParDefaut(50)) expect(hexes.has(c)).toBe(true);
  });
});

describe("contraste", () => {
  it("noir sur blanc = 21, identique = 1", () => {
    expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contraste("#123456", "#123456")).toBeCloseTo(1, 5);
  });
  it("rejette une couleur invalide", () => {
    expect(() => contraste("rouge", NOIR)).toThrow("Couleur invalide : rouge");
  });
  it("contrastes du tableau §5", () => {
    const attendu = [8.4, 8.2, 14.3, 6.2, 5.5, 4.9, 5.2];
    PALETTE.forEach((c, i) => {
      expect(Math.abs(contraste(c.hex, c.texte) - attendu[i]!), c.nom).toBeLessThan(0.05);
    });
  });
  it("séparateur au moins 3,4:1 sur chaque couleur", () => {
    for (const c of PALETTE) {
      expect(contraste(SEPARATEUR, c.hex), c.nom).toBeGreaterThanOrEqual(3.4);
    }
  });
});

describe("couleurTexte", () => {
  it("redonne la colonne Texte", () => {
    for (const c of PALETTE) expect(couleurTexte(c.hex), c.nom).toBe(c.texte);
  });
  it("extrêmes, casse et couleur invalide", () => {
    expect(couleurTexte("#000000")).toBe(BLANC);
    expect(couleurTexte("#ffffff")).toBe(NOIR);
    expect(couleurTexte("#0072b2")).toBe(BLANC);
    expect(couleurTexte("nimporte")).toBe(NOIR);
  });
});
