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
  VOISINES_ADMISES,
} from "./palette";

const { matrice, couleurs, minToutesPaires, minCycle } = matriceJson as {
  matrice: number[][];
  couleurs: string[];
  minToutesPaires: number;
  minCycle: number;
};

/** Seuil de la spec §5, écrit ici pour ne pas dépendre de la constante testée. */
const SEUIL_SPEC = 17.95;

function delta(hexA: string, hexB: string): number {
  return matrice[couleurs.indexOf(hexA)]![couleurs.indexOf(hexB)]!;
}

function verifierVoisines(seq: string[]): void {
  const n = seq.length;
  for (let i = 0; i < n; i++) {
    const a = seq[i]!;
    const b = seq[(i + 1) % n]!;
    expect(a, `secteur ${i} / n=${n}`).not.toBe(b);
    expect(delta(a, b), `${a}-${b} secteur ${i} / n=${n}`).toBeGreaterThanOrEqual(SEUIL_SPEC);
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
  it("la table des voisines admises correspond exactement aux paires >= seuil", () => {
    expect(SEUIL_DELTA_E).toBe(SEUIL_SPEC);
    const attendu = matrice.map((l, i) =>
      l.flatMap((v, j) => (i !== j && v >= SEUIL_SPEC ? [j] : [])),
    );
    expect(VOISINES_ADMISES.map((l) => [...l].sort((a, b) => a - b))).toEqual(attendu);
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
  it("n = 2 à 7 : couleurs toutes différentes, voisines admises bouclage compris", () => {
    const attendu: Record<number, number[]> = {
      2: [0, 1],
      3: [0, 1, 6],
      4: [0, 1, 2, 6],
      5: [0, 1, 2, 5, 6],
      6: [0, 1, 2, 4, 5, 6],
      7: [0, 1, 2, 3, 4, 5, 6],
    };
    for (let n = 2; n <= 7; n++) {
      const idx = indicesParDefaut(n);
      expect(idx, `n=${n}`).toEqual(attendu[n]);
      expect(new Set(idx).size, `n=${n}`).toBe(n);
      expect(new Set(couleursParDefaut(n)).size, `n=${n}`).toBe(n);
      idx.forEach((a, i) => {
        expect(VOISINES_ADMISES[a], `n=${n} secteur ${i}`).toContain(idx[(i + 1) % n]);
      });
    }
  });
  it("suit l'ordre du tableau, sauf la fin ajustée (n > 7)", () => {
    // n = 8 : le cycle répété (7 → 0 puis 0 → 0) est ajusté en fin.
    expect(indicesParDefaut(8)).toHaveLength(8);
    expect(indicesParDefaut(200).slice(0, 190)).toEqual(
      Array.from({ length: 190 }, (_, i) => i % 7),
    );
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
  it("n multiple de 7 : exactement le cycle du tableau", () => {
    for (const n of [7, 14, 70, 700, 7000]) {
      const attendu = Array.from({ length: n }, (_, i) => PALETTE[i % 7]!.hex);
      expect(couleursParDefaut(n)).toEqual(attendu);
    }
  });
  it("seule la fin est ajustée (au plus 12 secteurs)", () => {
    for (let n = 14; n <= 300; n++) {
      const idx = indicesParDefaut(n);
      let k = 0;
      while (k < n && idx[k] === k % 7) k++;
      expect(n - k, `n=${n}`).toBeLessThanOrEqual(12);
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
