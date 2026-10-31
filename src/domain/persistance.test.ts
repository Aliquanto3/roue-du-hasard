import { describe, expect, it } from "vitest";
import { creerPersistance, type StockageMinimal } from "./persistance";

function memoire(): StockageMinimal & { donnees: Map<string, string> } {
  const donnees = new Map<string, string>();
  return {
    donnees,
    getItem: (k) => donnees.get(k) ?? null,
    setItem: (k, v) => void donnees.set(k, v),
    removeItem: (k) => void donnees.delete(k),
  };
}

const casse = (): never => {
  throw new Error("SecurityError");
};

describe("creerPersistance", () => {
  it("écrit puis relit un objet", () => {
    const p = creerPersistance(() => memoire());
    const s = memoire();
    const q = creerPersistance(() => s);
    expect(q.ecrire("k", { a: [1, 2] })).toBe(true);
    expect(s.donnees.get("k")).toBe('{"a":[1,2]}');
    expect(q.lire("k")).toEqual({ a: [1, 2] });
    expect(p.lire("absent")).toBeNull();
    expect(q.supprimer("k")).toBe(true);
    expect(q.lire("k")).toBeNull();
  });

  it("fonctionne() est vrai pour un stockage sain et ne laisse pas de sonde", () => {
    const s = memoire();
    expect(creerPersistance(() => s).fonctionne()).toBe(true);
    expect(s.donnees.size).toBe(0);
  });

  it("JSON corrompu : lire renvoie null", () => {
    const s = memoire();
    s.donnees.set("k", "{pas du json");
    expect(creerPersistance(() => s).lire("k")).toBeNull();
  });

  it("stockage absent : tout est neutre", () => {
    for (const f of [() => null, () => undefined, casse]) {
      const p = creerPersistance(f);
      expect(p.lire("k")).toBeNull();
      expect(p.ecrire("k", 1)).toBe(false);
      expect(p.supprimer("k")).toBe(false);
      expect(p.fonctionne()).toBe(false);
    }
  });

  it("exception sur chaque méthode du stockage", () => {
    const p = creerPersistance(() => ({ getItem: casse, setItem: casse, removeItem: casse }));
    expect(p.lire("k")).toBeNull();
    expect(p.ecrire("k", 1)).toBe(false);
    expect(p.supprimer("k")).toBe(false);
    expect(p.fonctionne()).toBe(false);
  });

  it("QuotaExceededError à l'écriture : false, sans lever", () => {
    const s = memoire();
    s.setItem = () => {
      throw new DOMException("plein", "QuotaExceededError");
    };
    const p = creerPersistance(() => s);
    expect(p.ecrire("k", "x")).toBe(false);
    expect(p.fonctionne()).toBe(false);
  });

  it("valeur non sérialisable : false", () => {
    const p = creerPersistance(() => memoire());
    expect(p.ecrire("k", undefined)).toBe(false);
    const cyclique: Record<string, unknown> = {};
    cyclique["x"] = cyclique;
    expect(p.ecrire("k", cyclique)).toBe(false);
  });

  it("stockage qui avale les écritures : fonctionne() est faux", () => {
    const s = memoire();
    s.setItem = () => undefined;
    expect(creerPersistance(() => s).fonctionne()).toBe(false);
  });
});
