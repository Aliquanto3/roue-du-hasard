import { afterEach, describe, expect, it, vi } from "vitest";
import { ajouter, coller, collerCadeaux, etatInitial } from "../domain/etat";
import { exporter } from "../domain/schema";
import { lireFichierImport, nomFichierExport, TAILLE_MAX_FICHIER_OCTETS, telechargerExport } from "./echange";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const exemple = () => collerCadeaux(coller(etatInitial(), "Ana\nBob"), "Bougie");

describe("nomFichierExport", () => {
  it("date locale sur deux chiffres", () => {
    expect(nomFichierExport(new Date(2026, 0, 5))).toBe("roue-du-hasard-2026-01-05.json");
    expect(nomFichierExport(new Date(2026, 11, 31))).toBe("roue-du-hasard-2026-12-31.json");
  });
});

describe("telechargerExport", () => {
  it("crée un lien blob daté, le clique, le retire puis révoque l'URL", async () => {
    vi.useFakeTimers();
    let blob: Blob | null = null;
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
      blob = b as Blob;
      return "blob:test";
    });
    const revoque = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const journal: string[] = [];
    const lien = {
      href: "",
      download: "",
      hidden: false,
      click: () => journal.push("clic"),
      remove: () => journal.push("retrait"),
    };
    const doc = {
      createElement: (t: string) => {
        journal.push(t);
        return lien;
      },
      body: { append: () => journal.push("ajout") },
    } as unknown as Document;

    telechargerExport(exemple(), doc, new Date(2026, 9, 31));

    expect(journal).toEqual(["a", "ajout", "clic", "retrait"]);
    expect(lien.href).toBe("blob:test");
    expect(lien.download).toBe("roue-du-hasard-2026-10-31.json");
    expect(revoque).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoque).toHaveBeenCalledExactlyOnceWith("blob:test");
    const b = blob as unknown as Blob;
    expect(b.type).toBe("application/json");
    expect(await b.text()).toBe(exporter(exemple()));
  });

  it("révoque l'URL même si le clic échoue", () => {
    vi.useFakeTimers();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    const revoque = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const doc = {
      createElement: () => ({
        click: () => {
          throw new Error("boum");
        },
        remove: () => undefined,
      }),
      body: { append: () => undefined },
    } as unknown as Document;
    expect(() => {
      telechargerExport(exemple(), doc);
    }).toThrow("boum");
    vi.runAllTimers();
    expect(revoque).toHaveBeenCalledWith("blob:x");
  });
});

describe("lireFichierImport", () => {
  const fichier = (contenu: string) => new File([contenu], "x.json", { type: "application/json" });

  it("importe un export valide, nom hostile conservé", async () => {
    const hostile = "<img src=x onerror=alert(1)>";
    const e = ajouter(exemple(), hostile);
    const r = await lireFichierImport(fichier(exporter(e)));
    expect(r).toEqual({ ok: true, etat: e });
  });

  it("refuse un JSON invalide, un format invalide, une version inconnue", async () => {
    expect(await lireFichierImport(fichier("{pas du json"))).toEqual({ ok: false, code: "json-invalide" });
    expect(await lireFichierImport(fichier("[]"))).toEqual({ ok: false, code: "format-invalide" });
    const v2 = exporter(exemple()).replace('"version":1', '"version":2');
    expect(await lireFichierImport(fichier(v2))).toEqual({ ok: false, code: "version-inconnue" });
    const mauvais = exporter(exemple()).replace('"attribues":0', '"attribues":99');
    expect(await lireFichierImport(fichier(mauvais))).toEqual({ ok: false, code: "donnees-invalides" });
  });

  it("refuse un fichier trop gros sans le lire", async () => {
    const texte = vi.fn(() => Promise.resolve("{}"));
    const gros = { size: TAILLE_MAX_FICHIER_OCTETS + 1, text: texte } as unknown as File;
    expect(await lireFichierImport(gros)).toEqual({ ok: false, code: "fichier-trop-gros" });
    expect(texte).not.toHaveBeenCalled();
    const limite = { size: TAILLE_MAX_FICHIER_OCTETS, text: () => Promise.resolve("{pas json") } as unknown as File;
    expect(await lireFichierImport(limite)).toEqual({ ok: false, code: "json-invalide" });
  });

  it("renvoie fichier-illisible si la lecture échoue, sans rejeter", async () => {
    const casse = { size: 3, text: () => Promise.reject(new Error("NotReadableError")) } as unknown as File;
    expect(await lireFichierImport(casse)).toEqual({ ok: false, code: "fichier-illisible" });
  });

  it("ne rejette pas quand le fichier est absent ou que sa taille est illisible", async () => {
    expect(await lireFichierImport(undefined as unknown as File)).toEqual({ ok: false, code: "fichier-illisible" });
  });

  it("accepte un UTF-8 avec BOM (éditeurs Windows), refuse un UTF-16", async () => {
    const e = exemple();
    expect(await lireFichierImport(fichier(`\uFEFF${exporter(e)}`))).toEqual({ ok: true, etat: e });
    const utf16 = new File([Buffer.from(`\uFEFF${exporter(e)}`, "utf16le")], "x.json");
    expect(await lireFichierImport(utf16)).toEqual({ ok: false, code: "json-invalide" });
  });

  it("accepte 150 000 noms", async () => {
    const e = coller(etatInitial(), Array.from({ length: 150_000 }, (_, i) => `N${String(i)}`).join("\n"));
    const r = await lireFichierImport(fichier(exporter(e)));
    expect(r).toEqual({ ok: true, etat: e });
  }, 30_000);
});
