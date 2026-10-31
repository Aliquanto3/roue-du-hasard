/** Échange de fichiers (F15) : téléchargement de l'export et lecture d'un fichier à importer. Sans texte d'interface. */
import type { Etat } from "../domain/etat";
import { exporter, importer, type CodeErreurImport } from "../domain/schema";

/**
 * Taille maximale d'un fichier à importer, en octets (50 Mio) : évite de lire un fichier choisi par
 * erreur. Mesures : 1 000 noms = 40 Ko, 150 000 noms courts = 7,4 Mo, 150 000 noms de 60 emojis = 42 Mo.
 * Un export au-delà (environ 1 million de noms courts) s'écrit mais se refuse à l'import : cas assumé,
 * loin de la cible de 1 000 noms (N7).
 */
export const TAILLE_MAX_FICHIER_OCTETS = 50 * 1024 * 1024;

export type CodeErreurLecture = CodeErreurImport | "fichier-illisible";

export type ResultatLecture =
  | { readonly ok: true; readonly etat: Etat }
  | { readonly ok: false; readonly code: CodeErreurLecture };

const DELAI_REVOCATION_MS = 1000;

const deux = (n: number): string => String(n).padStart(2, "0");

/** `roue-du-hasard-AAAA-MM-JJ.json`, date locale. */
export function nomFichierExport(date: Date): string {
  return `roue-du-hasard-${String(date.getFullYear())}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}.json`;
}

/** Déclenche le téléchargement de l'export via un lien `blob:` temporaire. */
export function telechargerExport(etat: Etat, document: Document, maintenant: Date = new Date()): void {
  const blob = new Blob([exporter(etat)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichierExport(maintenant);
  lien.hidden = true;
  document.body.append(lien);
  try {
    lien.click();
  } finally {
    lien.remove();
    // Révocation différée : certains navigateurs lisent le blob après le clic.
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, DELAI_REVOCATION_MS);
  }
}

/** Lit et valide un fichier d'import. Ne rejette jamais ; l'appelant remplace l'état si `ok`. */
export async function lireFichierImport(fichier: File): Promise<ResultatLecture> {
  let contenu: string;
  try {
    if (fichier.size > TAILLE_MAX_FICHIER_OCTETS) return { ok: false, code: "fichier-trop-gros" };
    contenu = await fichier.text();
  } catch {
    return { ok: false, code: "fichier-illisible" };
  }
  return importer(contenu);
}
