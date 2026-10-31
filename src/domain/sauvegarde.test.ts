import { describe, expect, it } from "vitest";
import { ajouter, coller, collerCadeaux, definirCouleur, enregistrerTirage, etatInitial } from "./etat";
import { creerPersistance, type StockageMinimal } from "./persistance";
import { CLE_ETAT, restaurer, sauvegarder } from "./sauvegarde";
import { exporter } from "./schema";

function memoire(): StockageMinimal & { donnees: Map<string, string> } {
  const donnees = new Map<string, string>();
  return {
    donnees,
    getItem: (k) => donnees.get(k) ?? null,
    setItem: (k, v) => void donnees.set(k, v),
    removeItem: (k) => void donnees.delete(k),
  };
}

function exemple() {
  let e = coller(etatInitial(), "Ana\nBob\nChloé");
  e = collerCadeaux(e, "Bougie\nLivre");
  e = definirCouleur(e, "p2", "#AABBCC");
  return enregistrerTirage(e, "p1", "2026-10-31T10:00:00.000Z");
}

describe("sauvegarder / restaurer", () => {
  it("fait un aller-retour exact", () => {
    const s = memoire();
    const p = creerPersistance(() => s);
    const e = exemple();
    expect(sauvegarder(p, e)).toBe(true);
    expect(restaurer(p)).toEqual(e);
  });

  it("n'encode pas deux fois : le stockage contient exactement l'export", () => {
    const s = memoire();
    const e = exemple();
    sauvegarder(creerPersistance(() => s), e);
    const brut = s.donnees.get(CLE_ETAT);
    expect(brut).toBe(exporter(e));
    expect(typeof JSON.parse(brut ?? "")).toBe("object");
  });

  it("conserve un nom hostile tel quel", () => {
    const s = memoire();
    const p = creerPersistance(() => s);
    const hostile = "<img src=x onerror=alert(1)>";
    sauvegarder(p, ajouter(etatInitial(), hostile));
    expect(restaurer(p)?.participants[0]?.nom).toBe(hostile);
  });

  it("renvoie null si absent, corrompu, doublement encodé ou de version inconnue", () => {
    const s = memoire();
    const p = creerPersistance(() => s);
    expect(restaurer(p)).toBeNull();
    s.donnees.set(CLE_ETAT, "{pas du json");
    expect(restaurer(p)).toBeNull();
    s.donnees.set(CLE_ETAT, JSON.stringify(exporter(exemple())));
    expect(restaurer(p)).toBeNull();
    s.donnees.set(CLE_ETAT, exporter(exemple()).replace('"version":1', '"version":2'));
    expect(restaurer(p)).toBeNull();
    s.donnees.set(CLE_ETAT, "42");
    expect(restaurer(p)).toBeNull();
  });

  it("au-delà du quota : renvoie false et garde la sauvegarde précédente", () => {
    const s = memoire();
    const p = creerPersistance(() => ({
      ...s,
      // Comme `localStorage` : l'écriture refusée lève et laisse l'ancienne valeur intacte.
      setItem: (k, v) => {
        if (v.length > 500) throw new DOMException("quota", "QuotaExceededError");
        s.setItem(k, v);
      },
    }));
    const e = exemple();
    expect(sauvegarder(p, e)).toBe(true);
    const gros = coller(e, Array.from({ length: 200 }, (_, i) => `Nom ${String(i)}`).join("\n"));
    expect(sauvegarder(p, gros)).toBe(false);
    expect(restaurer(p)).toEqual(e);
  });

  it("ne lève jamais quand le stockage est en panne", () => {
    const p = creerPersistance(() => {
      throw new Error("SecurityError");
    });
    expect(sauvegarder(p, exemple())).toBe(false);
    expect(restaurer(p)).toBeNull();
  });
});
