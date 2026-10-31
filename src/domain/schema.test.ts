import { describe, expect, it } from "vitest";
import {
  ajouter,
  coller,
  collerCadeaux,
  definirCouleur,
  definirRetirerGagnants,
  definirSonCoupe,
  enregistrerTirage,
  etatInitial,
  supprimer,
  supprimerCadeau,
} from "./etat";
import { VERSION_SCHEMA, exporter, importer, valider } from "./schema";

function exemple() {
  let e = coller(etatInitial(), "Ana\nBob\nChloé");
  e = collerCadeaux(e, "Bougie\nLivre");
  e = definirCouleur(e, "p2", "#AABBCC");
  e = enregistrerTirage(e, "p1", "2026-10-31T10:00:00.000Z");
  e = definirRetirerGagnants(definirSonCoupe(e, true), true);
  return e;
}

function fichier(modif: (o: Record<string, unknown>) => void): string {
  const o = JSON.parse(exporter(exemple())) as Record<string, unknown>;
  modif(o);
  return JSON.stringify(o);
}

function code(contenu: string): string | undefined {
  const r = importer(contenu);
  return r.ok ? undefined : r.code;
}

describe("export / import", () => {
  it("fait l'aller-retour exact", () => {
    const e = exemple();
    const r = importer(exporter(e));
    expect(r).toEqual({ ok: true, etat: e });
    expect(JSON.parse(exporter(e)).version).toBe(VERSION_SCHEMA);
  });

  it("restaure prochainId au-delà des ids connus", () => {
    const r = importer(exporter(exemple()));
    expect(r.ok && r.etat.prochainId).toBe(4);
  });

  it("garde prochainId à l'aller-retour : un id supprimé n'est jamais réutilisé", () => {
    const e = supprimer(coller(etatInitial(), "A\nB\nC"), "p3");
    const r = importer(exporter(e));
    expect(r).toEqual({ ok: true, etat: e });
    if (r.ok) expect(ajouter(r.etat, "D").participants.map((p) => p.id)).toEqual(["p1", "p2", "p4"]);
  });

  it("refuse un prochainId absent ou déjà utilisé", () => {
    expect(code(fichier((o) => delete o["prochainId"]))).toBe("donnees-invalides");
    expect(code(fichier((o) => (o["prochainId"] = 3)))).toBe("donnees-invalides");
    expect(code(fichier((o) => (o["prochainId"] = 2 ** 53)))).toBe("donnees-invalides");
  });

  it("garde la marque d'un cadeau supprimé à l'aller-retour", () => {
    const e = supprimerCadeau(exemple(), 0);
    expect(e.historique[0]?.cadeauSupprime).toBe(true);
    expect(importer(exporter(e))).toEqual({ ok: true, etat: e });
  });

  it("refuse un JSON illisible", () => {
    expect(code("{pas du json")).toBe("json-invalide");
    expect(code("")).toBe("json-invalide");
  });

  it("refuse une racine qui n'est pas un objet ou sans version", () => {
    for (const c of ["[]", "null", "42", '"x"', "{}", '{"version":"1"}']) {
      expect(code(c)).toBe("format-invalide");
    }
  });

  it("refuse une version inconnue", () => {
    expect(code(fichier((o) => (o["version"] = 2)))).toBe("version-inconnue");
    expect(code(fichier((o) => (o["version"] = 0)))).toBe("version-inconnue");
  });

  it("refuse les types incorrects", () => {
    const cas: ((o: Record<string, unknown>) => void)[] = [
      (o) => delete o["participants"],
      (o) => (o["participants"] = "x"),
      (o) => (o["participants"] = { length: 1e9 }),
      (o) => (o["cadeaux"] = [1]),
      (o) => (o["attribues"] = "1"),
      (o) => (o["attribues"] = 3),
      (o) => (o["attribues"] = -1),
      (o) => (o["attribues"] = 0.5),
      (o) => (o["retirerGagnants"] = "oui"),
      (o) => (o["sonCoupe"] = 1),
      (o) => (o["historique"] = [null]),
      (o) => (o["participants"] = [{ id: "p1", nom: 3, couleur: null }]),
      (o) => (o["participants"] = [{ id: "x", nom: "A", couleur: null }]),
      (o) =>
        (o["participants"] = [
          { id: "p1", nom: "A", couleur: null },
          { id: "p1", nom: "B", couleur: null },
        ]),
    ];
    for (const c of cas) expect(code(fichier(c))).toBe("donnees-invalides");
  });

  it("refuse noms vides, non normalisés ou de plus de 60 caractères", () => {
    const avec = (nom: unknown) => fichier((o) => (o["participants"] = [{ id: "p1", nom, couleur: null }]));
    expect(code(avec("a".repeat(60)))).toBeUndefined();
    expect(code(avec("a".repeat(61)))).toBe("donnees-invalides");
    expect(code(avec("😀".repeat(60)))).toBeUndefined();
    expect(code(avec("😀".repeat(61)))).toBe("donnees-invalides");
    expect(code(avec(""))).toBe("donnees-invalides");
    expect(code(avec(" A"))).toBe("donnees-invalides");
  });

  it("valide les couleurs #RRGGBB", () => {
    const avec = (couleur: unknown) =>
      fichier((o) => (o["participants"] = [{ id: "p1", nom: "A", couleur }]));
    expect(code(avec("#12abEF"))).toBeUndefined();
    for (const c of ["#12345", "#1234567", "123456", "red", "#GGGGGG", 5, undefined]) {
      expect(code(avec(c))).toBe("donnees-invalides");
    }
  });

  it("valide les entrées d'historique", () => {
    const base = {
      ordre: 1,
      participantId: "p1",
      nom: "A",
      cadeau: null,
      cadeauSupprime: false,
      heure: "2026-10-31T10:00:00.000Z",
      retrait: null,
    };
    const avec = (m: Record<string, unknown>) => fichier((o) => (o["historique"] = [{ ...base, ...m }]));
    expect(code(avec({}))).toBeUndefined();
    expect(code(avec({ retrait: { couleur: "#000000" } }))).toBeUndefined();
    expect(code(avec({ ordre: 0 }))).toBe("donnees-invalides");
    expect(code(avec({ heure: "pas une date" }))).toBe("donnees-invalides");
    expect(code(avec({ heure: 5 }))).toBe("donnees-invalides");
    expect(code(avec({ cadeau: 5 }))).toBe("donnees-invalides");
    expect(code(avec({ cadeauSupprime: "non" }))).toBe("donnees-invalides");
    expect(code(avec({ retrait: { couleur: "rouge" } }))).toBe("donnees-invalides");
    expect(code(avec({ retrait: 3 }))).toBe("donnees-invalides");
  });

  it("fait l'aller-retour exact d'un export de 150 000 noms", () => {
    const noms = Array.from({ length: 150_000 }, (_, i) => `Nom ${String(i)}`);
    const e = coller(etatInitial(), noms.join("\n"));
    expect(e.participants).toHaveLength(150_000);
    const r = importer(exporter(e));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.etat).toEqual(e);
  });

  it("conserve tel quel un nom hostile", () => {
    const hostile = "<img src=x onerror=alert(1)>";
    const r = importer(exporter(ajouter(etatInitial(), hostile)));
    expect(r.ok && r.etat.participants[0]?.nom).toBe(hostile);
  });

  it("ne pollue pas les prototypes et ignore __proto__", () => {
    const contenu = fichier((o) => o).replace(
      '"version":1',
      '"version":1,"__proto__":{"polluant":true},"constructor":{"prototype":{"polluant":true}}',
    );
    const r = importer(contenu);
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>)["polluant"]).toBeUndefined();
    if (r.ok) expect(Object.hasOwn(r.etat, "polluant")).toBe(false);
    const participant = '{"id":"p1","nom":"A","couleur":null,"__proto__":{"x":1}}';
    const r2 = importer(
      `{"version":1,"participants":[${participant}],"cadeaux":[],"attribues":0,"historique":[],"retirerGagnants":false,"sonCoupe":false,"prochainId":2}`,
    );
    expect(r2.ok && Object.keys(r2.etat.participants[0] as object)).toEqual(["id", "nom", "couleur"]);
  });

  it("un __proto__ ne peut pas se substituer à un champ requis", () => {
    const r = importer('{"version":1,"__proto__":{"participants":[],"cadeaux":[]}}');
    expect(r.ok).toBe(false);
  });

  it("valider() accepte un objet déjà décodé et ne touche pas à l'original", () => {
    const o = JSON.parse(exporter(exemple())) as unknown;
    const avant = JSON.stringify(o);
    expect(valider(o).ok).toBe(true);
    expect(JSON.stringify(o)).toBe(avant);
    expect(valider(undefined)).toEqual({ ok: false, code: "format-invalide" });
  });
});
