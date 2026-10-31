import { describe, expect, it } from "vitest";
import {
  ajouter,
  ajouterCadeau,
  annulerDernierTirage,
  attribuerSansRotation,
  attributionSansRotationPossible,
  coller,
  collerCadeaux,
  definirCouleur,
  definirRetirerGagnants,
  effacerHistorique,
  enregistrerTirage,
  etatInitial,
  libelleCadeau,
  raisonLancementInterdit,
  recommencerAttributions,
  reinitialiserCouleurs,
  renommer,
  renommerCadeau,
  retirerDernierGagnant,
  supprimer,
  supprimerCadeau,
  type Etat,
} from "./etat";
import { exporter, importer } from "./schema";

const H = "2026-10-31T10:00:00.000Z";
const noms = (e: Etat) => e.participants.map((p) => p.nom);

describe("participants", () => {
  it("ajoute avec des ids stables et jamais réutilisés", () => {
    let e = ajouter(etatInitial(), "  Ana ");
    e = ajouter(e, "Bob");
    expect(e.participants).toEqual([
      { id: "p1", nom: "Ana", couleur: null },
      { id: "p2", nom: "Bob", couleur: null },
    ]);
    e = supprimer(e, "p2");
    e = ajouter(e, "Cléo");
    expect(e.participants.map((p) => p.id)).toEqual(["p1", "p3"]);
  });
  it("ignore un nom vide et ne découpe pas un ajout unique", () => {
    const e0 = etatInitial();
    expect(ajouter(e0, "  ")).toBe(e0);
    expect(noms(ajouter(e0, "Dupont, Jean"))).toEqual(["Dupont, Jean"]);
  });
  it("colle une liste", () => {
    expect(noms(coller(etatInitial(), "A\nB;C, D\n\n"))).toEqual(["A", "B", "C", "D"]);
    const e0 = etatInitial();
    expect(coller(e0, "\n ,")).toBe(e0);
  });
  it("renomme avec normalisation, sans effet si vide ou inconnu", () => {
    const e = coller(etatInitial(), "A\nB");
    expect(noms(renommer(e, "p2", " Zoé "))).toEqual(["A", "Zoé"]);
    expect(renommer(e, "p2", " ")).toBe(e);
    expect(renommer(e, "p9", "X")).toBe(e);
  });
  it("est immuable", () => {
    const e = coller(etatInitial(), "A\nB");
    const copie = JSON.stringify(e);
    renommer(e, "p1", "Z");
    supprimer(e, "p1");
    definirCouleur(e, "p1", "#ffffff");
    enregistrerTirage(e, "p1", H);
    expect(JSON.stringify(e)).toBe(copie);
  });
  it("supprime, ignore un id inconnu", () => {
    const e = coller(etatInitial(), "A\nB");
    expect(noms(supprimer(e, "p1"))).toEqual(["B"]);
    expect(supprimer(e, "p9")).toBe(e);
  });
  it("couleurs : #RRGGBB en minuscules, null = défaut, invalide ignoré, réinitialisation", () => {
    let e = coller(etatInitial(), "A\nB");
    e = definirCouleur(e, "p1", "#AABBCC");
    expect(e.participants[0]?.couleur).toBe("#aabbcc");
    expect(definirCouleur(e, "p1", "rouge")).toBe(e);
    expect(definirCouleur(e, "p1", "#abc")).toBe(e);
    e = definirCouleur(e, "p2", "#000000");
    expect(definirCouleur(e, "p1", null).participants[0]?.couleur).toBeNull();
    expect(reinitialiserCouleurs(e).participants.map((p) => p.couleur)).toEqual([null, null]);
  });
  it("limite à 60 caractères par nom", () => {
    expect(ajouter(etatInitial(), "x".repeat(70)).participants[0]?.nom).toBe("x".repeat(60));
  });
});

describe("cadeaux", () => {
  it("même saisie que les noms", () => {
    const e = collerCadeaux(etatInitial(), "Bougie\nLivre, Stylo;  ");
    expect(e.cadeaux).toEqual(["Bougie", "Livre", "Stylo"]);
    expect(ajouterCadeau(e, " Vase ").cadeaux).toEqual(["Bougie", "Livre", "Stylo", "Vase"]);
    expect(ajouterCadeau(e, " ")).toBe(e);
    expect(collerCadeaux(e, "")).toBe(e);
    expect(ajouterCadeau(e, "y".repeat(61)).cadeaux[3]).toBe("y".repeat(60));
  });
  it("renomme et supprime", () => {
    const e = collerCadeaux(etatInitial(), "A\nB\nC");
    expect(renommerCadeau(e, 1, " Bis ").cadeaux).toEqual(["A", "Bis", "C"]);
    expect(renommerCadeau(e, 5, "X")).toBe(e);
    expect(renommerCadeau(e, 1, " ")).toBe(e);
    expect(supprimerCadeau(e, 0).cadeaux).toEqual(["B", "C"]);
    expect(supprimerCadeau(e, 3)).toBe(e);
  });
  it("supprimer un cadeau déjà attribué baisse le compteur", () => {
    let e = collerCadeaux(coller(etatInitial(), "A\nB\nC"), "X\nY\nZ");
    e = enregistrerTirage(enregistrerTirage(e, "p1", H), "p2", H);
    expect(e.attribues).toBe(2);
    expect(supprimerCadeau(e, 0).attribues).toBe(1);
    expect(supprimerCadeau(e, 2).attribues).toBe(2);
  });
  describe("annuler après suppression d'un cadeau attribué", () => {
    const deuxTirages = () => {
      const e = collerCadeaux(coller(etatInitial(), "P\nQ\nR"), "A\nB\nC");
      return enregistrerTirage(enregistrerTirage(e, "p1", H), "p2", H);
    };
    it("cadeau du tirage annulé supprimé : le premier cadeau n'est pas redistribué", () => {
      const a = annulerDernierTirage(supprimerCadeau(deuxTirages(), 1));
      expect(a.attribues).toBe(1);
      expect(libelleCadeau(a)?.nom).toBe("C");
    });
    it("cadeau d'un tirage antérieur supprimé : le cadeau annulé redevient le prochain", () => {
      const a = annulerDernierTirage(supprimerCadeau(deuxTirages(), 0));
      expect(a.attribues).toBe(0);
      expect(libelleCadeau(a)?.nom).toBe("B");
    });
    it("distingue deux cadeaux de même nom", () => {
      let e = collerCadeaux(coller(etatInitial(), "P\nQ"), "X\nX\nY");
      e = enregistrerTirage(enregistrerTirage(e, "p1", H), "p2", H);
      const a = annulerDernierTirage(supprimerCadeau(e, 1));
      expect(a.attribues).toBe(1);
      expect(libelleCadeau(a)?.nom).toBe("Y");
    });
    it("un renommage ne change rien à la restitution", () => {
      const a = annulerDernierTirage(renommerCadeau(deuxTirages(), 1, "Bis"));
      expect(libelleCadeau(a)?.nom).toBe("Bis");
    });
  });
  it("après effacement de l'historique, les cadeaux attribués le restent", () => {
    const e = collerCadeaux(coller(etatInitial(), "P\nQ"), "A\nB\nC");
    const efface = effacerHistorique(enregistrerTirage(enregistrerTirage(e, "p1", H), "p2", H));
    expect(annulerDernierTirage(efface)).toBe(efface);
    expect(libelleCadeau(efface)?.nom).toBe("C");
    const sansTrace = supprimerCadeau(efface, 0);
    expect(libelleCadeau(sansTrace)?.nom).toBe("C");
    const suivant = annulerDernierTirage(enregistrerTirage(sansTrace, "p1", H));
    expect(libelleCadeau(suivant)?.nom).toBe("C");
  });
  it("après recommencement, annuler ne fait jamais passer le compteur sous zéro", () => {
    const e = collerCadeaux(coller(etatInitial(), "P\nQ"), "A\nB");
    let r = recommencerAttributions(enregistrerTirage(enregistrerTirage(e, "p1", H), "p2", H));
    r = annulerDernierTirage(enregistrerTirage(r, "p1", H));
    expect(r.attribues).toBe(0);
    r = annulerDernierTirage(r);
    expect(r.attribues).toBe(0);
    expect(r.historique).toHaveLength(1);
    expect(libelleCadeau(r)?.nom).toBe("A");
  });
  it("invariant sur des suites aléatoires : le début de la liste suit les tirages vivants", () => {
    let graine = 12345;
    const alea = (n: number): number => {
      graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0;
      return Math.floor((graine / 2 ** 32) * n);
    };
    for (let essai = 0; essai < 200; essai++) {
      let e = definirRetirerGagnants(coller(etatInitial(), "P\nQ\nR\nS\nT\nU"), essai % 2 === 0);
      e = collerCadeaux(e, "C1\nC2\nC3\nC4\nC5\nC6");
      for (let pas = 0; pas < 30; pas++) {
        const op = alea(4);
        if (op === 0 && e.participants.length > 0) {
          const p = e.participants[alea(e.participants.length)];
          if (p) e = retirerDernierGagnant(enregistrerTirage(e, p.id, H));
        } else if (op === 1) e = annulerDernierTirage(e);
        else if (op === 2 && e.cadeaux.length > 0) e = supprimerCadeau(e, alea(e.cadeaux.length));
        else if (op === 3 && e.participants.length > 0) {
          const p = e.participants[alea(e.participants.length)];
          if (p) e = supprimer(e, p.id);
        }
        const vivants = e.historique.filter((t) => t.cadeau !== null && !t.cadeauSupprime).map((t) => t.cadeau);
        expect(e.cadeaux.slice(0, e.attribues)).toEqual(vivants);
        const ids = e.participants.map((p) => Number(p.id.slice(1)));
        expect(ids).toEqual([...ids].sort((a, b) => a - b));
        expect(importer(exporter(e))).toEqual({ ok: true, etat: e });
      }
    }
  });
});

describe("tirages et cadeaux", () => {
  const base = () => collerCadeaux(coller(etatInitial(), "A\nB\nC"), "Bougie\nLivre");

  it("libellé « cadeau n sur m »", () => {
    expect(libelleCadeau(base())).toEqual({ numero: 1, total: 2, nom: "Bougie" });
    const e = enregistrerTirage(base(), "p1", H);
    expect(libelleCadeau(e)).toEqual({ numero: 2, total: 2, nom: "Livre" });
    expect(libelleCadeau(enregistrerTirage(e, "p2", H))).toBeNull();
    expect(libelleCadeau(coller(etatInitial(), "A"))).toBeNull();
  });
  it("enregistre ordre, nom, cadeau et heure", () => {
    let e = enregistrerTirage(base(), "p2", new Date(H));
    e = enregistrerTirage(e, "p3", H);
    expect(e.historique).toEqual([
      { ordre: 1, participantId: "p2", nom: "B", cadeau: "Bougie", cadeauSupprime: false, heure: H, retrait: null },
      { ordre: 2, participantId: "p3", nom: "C", cadeau: "Livre", cadeauSupprime: false, heure: H, retrait: null },
    ]);
    expect(e.attribues).toBe(2);
  });
  it("sans cadeau : cadeau null, compteur inchangé", () => {
    const e = enregistrerTirage(coller(etatInitial(), "A\nB"), "p1", H);
    expect(e.historique[0]?.cadeau).toBeNull();
    expect(e.attribues).toBe(0);
  });
  it("lancement interdit : moins de 2 noms, cadeaux épuisés", () => {
    expect(raisonLancementInterdit(etatInitial())).toBe("moins-de-2-noms");
    expect(raisonLancementInterdit(coller(etatInitial(), "A"))).toBe("moins-de-2-noms");
    expect(raisonLancementInterdit(coller(etatInitial(), "A\nB"))).toBeNull();
    let e = enregistrerTirage(enregistrerTirage(base(), "p1", H), "p2", H);
    expect(raisonLancementInterdit(e)).toBe("cadeaux-epuises");
    e = recommencerAttributions(e);
    expect(e.attribues).toBe(0);
    expect(raisonLancementInterdit(e)).toBeNull();
    expect(e.historique).toHaveLength(2);
  });
  it("cadeaux épuisés et moins de 2 noms : le récapitulatif F12 prime", () => {
    const e = enregistrerTirage(collerCadeaux(coller(etatInitial(), "A"), "X"), "p1", H);
    expect(raisonLancementInterdit(e)).toBe("cadeaux-epuises");
  });
  it("un tirage avec cadeaux épuisés ou participant inconnu est ignoré", () => {
    const e = enregistrerTirage(enregistrerTirage(base(), "p1", H), "p2", H);
    expect(enregistrerTirage(e, "p3", H)).toBe(e);
    expect(enregistrerTirage(base(), "p9", H).historique).toHaveLength(0);
  });
  it("annuler rend le cadeau", () => {
    const e = enregistrerTirage(base(), "p1", H);
    const a = annulerDernierTirage(e);
    expect(a.historique).toEqual([]);
    expect(a.attribues).toBe(0);
    expect(annulerDernierTirage(a)).toBe(a);
  });
  it("annuler sans cadeau ne touche pas au compteur", () => {
    let e = coller(etatInitial(), "A\nB");
    e = enregistrerTirage(e, "p1", H);
    e = collerCadeaux(e, "X");
    expect(annulerDernierTirage(e).attribues).toBe(0);
  });
  it("effacer l'historique", () => {
    const e = enregistrerTirage(base(), "p1", H);
    expect(effacerHistorique(e).historique).toEqual([]);
    const vide = base();
    expect(effacerHistorique(vide)).toBe(vide);
    expect(enregistrerTirage(effacerHistorique(e), "p2", H).historique[0]?.ordre).toBe(1);
  });
});

describe("retrait des gagnants (F19)", () => {
  const base = () => definirRetirerGagnants(collerCadeaux(coller(etatInitial(), "A\nB\nC\nD"), "X\nY"), true);

  it("le tirage seul ne retire personne", () => {
    expect(noms(enregistrerTirage(base(), "p2", H))).toEqual(["A", "B", "C", "D"]);
  });
  it("la fermeture retire le gagnant et annuler le remet à sa position", () => {
    let e = definirCouleur(base(), "p3", "#112233");
    e = retirerDernierGagnant(enregistrerTirage(e, "p3", H));
    expect(noms(e)).toEqual(["A", "B", "D"]);
    expect(e.historique[0]?.retrait).toEqual({ couleur: "#112233" });
    expect(retirerDernierGagnant(e)).toBe(e);
    const a = annulerDernierTirage(e);
    expect(a.participants).toEqual([
      { id: "p1", nom: "A", couleur: null },
      { id: "p2", nom: "B", couleur: null },
      { id: "p3", nom: "C", couleur: "#112233" },
      { id: "p4", nom: "D", couleur: null },
    ]);
    expect(a.attribues).toBe(0);
    expect(a.historique).toEqual([]);
  });
  it("annuler après retrait de voisins garde l'ordre d'origine", () => {
    let e = retirerDernierGagnant(enregistrerTirage(base(), "p4", H));
    e = supprimer(supprimer(e, "p1"), "p2");
    expect(annulerDernierTirage(e).participants.map((p) => p.id)).toEqual(["p3", "p4"]);
  });
  it("annuler après suppression d'un voisin placé avant : ordre d'origine, pas index périmé", () => {
    let e = retirerDernierGagnant(enregistrerTirage(base(), "p2", H));
    e = supprimer(e, "p1");
    expect(annulerDernierTirage(e).participants.map((p) => p.id)).toEqual(["p2", "p3", "p4"]);
  });
  it("annuler après ajout d'un nom : le nouveau nom reste à la fin", () => {
    let e = retirerDernierGagnant(enregistrerTirage(base(), "p2", H));
    e = ajouter(e, "E");
    expect(annulerDernierTirage(e).participants.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });
  it("option décochée : pas de retrait", () => {
    const e = definirRetirerGagnants(enregistrerTirage(base(), "p1", H), false);
    expect(retirerDernierGagnant(e)).toBe(e);
  });
  it("sans historique : pas de retrait", () => {
    const e = base();
    expect(retirerDernierGagnant(e)).toBe(e);
  });
  it("annuler sans retrait ne duplique pas le participant", () => {
    const e = enregistrerTirage(base(), "p1", H);
    expect(noms(annulerDernierTirage(e))).toEqual(["A", "B", "C", "D"]);
  });
  it("attribution sans rotation avec un seul nom et un cadeau", () => {
    const seul = collerCadeaux(coller(etatInitial(), "Solo"), "Prix");
    expect(attributionSansRotationPossible(seul)).toBe(true);
    const r = attribuerSansRotation(seul, H);
    expect(r.historique[0]).toMatchObject({ nom: "Solo", cadeau: "Prix", retrait: null });
    expect(r.participants).toHaveLength(1);
    const retire = attribuerSansRotation(definirRetirerGagnants(seul, true), H);
    expect(retire.participants).toEqual([]);
    expect(annulerDernierTirage(retire).participants[0]?.nom).toBe("Solo");
  });
  it("pas d'attribution sans rotation : sans cadeau restant, ou avec plusieurs noms", () => {
    const sansCadeau = coller(etatInitial(), "Solo");
    expect(attributionSansRotationPossible(sansCadeau)).toBe(false);
    expect(attribuerSansRotation(sansCadeau, H)).toBe(sansCadeau);
    const deux = collerCadeaux(coller(etatInitial(), "A\nB"), "X");
    expect(attributionSansRotationPossible(deux)).toBe(false);
    const fini = attribuerSansRotation(collerCadeaux(coller(etatInitial(), "Solo"), "X"), H);
    expect(attributionSansRotationPossible(fini)).toBe(false);
  });
});
