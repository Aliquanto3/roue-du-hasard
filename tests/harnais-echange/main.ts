/** Page de test hors bundle : exerce `ui/echange.ts` sous la CSP du fichier construit. */
import { ajouter, collerCadeaux, coller, etatInitial } from "../../src/domain/etat";
import { lireFichierImport, telechargerExport } from "../../src/ui/echange";

const etat = collerCadeaux(
  ajouter(coller(etatInitial(), "Ana\nBob\nChloé"), "<img src=x onerror=alert(1)>"),
  "Bougie\nLivre",
);

const resultat = document.getElementById("resultat");
const fichier = document.getElementById("fichier");
const bouton = document.getElementById("exporter");

bouton?.addEventListener("click", () => {
  telechargerExport(etat, document);
});

fichier?.addEventListener("change", () => {
  const f = (fichier as HTMLInputElement).files?.[0];
  if (!f || !resultat) return;
  void lireFichierImport(f).then((r) => {
    resultat.textContent = JSON.stringify(r);
    resultat.dataset["pret"] = "true";
  });
});
