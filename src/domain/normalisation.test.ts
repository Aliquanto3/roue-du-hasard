import { describe, expect, it } from "vitest";
import { compterDoublons, compterTronques, decouper, estTronque, longueur, normaliserNom, tronquer } from "./normalisation";

describe("estTronque", () => {
  it("juge le nom entier, sans découper sur les virgules", () => {
    expect(estTronque(`${"a".repeat(40)}, ${"b".repeat(40)}`)).toBe(true);
    expect(estTronque(`  ${"a".repeat(60)}  `)).toBe(false);
  });
});

describe("compterTronques", () => {
  it("compte les noms au-delà de 60 points de code, séparateurs compris", () => {
    const long = "a".repeat(61);
    expect(compterTronques(`${long}\nbob, ${"b".repeat(60)}; ${long}`)).toBe(2);
    expect(compterTronques("")).toBe(0);
  });
});

describe("decouper", () => {
  it("coupe sur retours à la ligne, virgules et points-virgules", () => {
    expect(decouper("Ana\nBob,Chloé;Dan\r\nEve")).toEqual(["Ana", "Bob", "Chloé", "Dan", "Eve"]);
  });
  it("retire les espaces et ignore les lignes vides", () => {
    expect(decouper("  Ana  \n\n \n, ;Bob \n")).toEqual(["Ana", "Bob"]);
    expect(decouper("")).toEqual([]);
    expect(decouper(" \n ")).toEqual([]);
  });
  it("garde les doublons", () => {
    expect(decouper("Marie\nMarie")).toEqual(["Marie", "Marie"]);
  });
});

describe("tronquer / normaliserNom", () => {
  it("garde exactement 60 caractères", () => {
    expect(normaliserNom("a".repeat(60))).toBe("a".repeat(60));
    expect(normaliserNom("a".repeat(61))).toBe("a".repeat(60));
  });
  it("ne coupe pas une paire de surrogates", () => {
    const nom = "😀".repeat(61);
    const r = normaliserNom(nom) as string;
    expect(longueur(r)).toBe(60);
    expect(r).toBe("😀".repeat(60));
    expect(r.length).toBe(120);
    expect(tronquer("a😀", 1)).toBe("a");
    expect(tronquer("a😀", 2)).toBe("a😀");
  });
  it("retire l'espace laissé par la troncature", () => {
    expect(normaliserNom("a".repeat(59) + " bbb")).toBe("a".repeat(59));
  });
  it("renvoie null pour un nom vide", () => {
    expect(normaliserNom("   ")).toBeNull();
  });
});

describe("compterDoublons", () => {
  it("compte les répétitions au-delà de la première, casse ignorée", () => {
    expect(compterDoublons(["Marie", "marie", "Paul", "Marie"])).toBe(2);
    expect(compterDoublons(["A", "B"])).toBe(0);
    expect(compterDoublons([])).toBe(0);
  });
  it("traite les formes Unicode équivalentes comme identiques", () => {
    expect(compterDoublons(["é", "é"])).toBe(1);
  });
});
