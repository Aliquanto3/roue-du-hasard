/** Export et import JSON versionnés (F15). L'import ne fait jamais confiance au contenu. */
import type { Etat, Participant, Retrait, Tirage } from "./etat";
import { LONGUEUR_MAX_NOM, longueur } from "./normalisation";

export const VERSION_SCHEMA = 1;
export const TAILLE_MAX_FICHIER = 5_000_000;
export const MAX_ELEMENTS = 100_000;

export type CodeErreurImport =
  | "fichier-trop-gros"
  | "json-invalide"
  | "format-invalide"
  | "version-inconnue"
  | "donnees-invalides";

export type ResultatImport =
  | { readonly ok: true; readonly etat: Etat }
  | { readonly ok: false; readonly code: CodeErreurImport };

const COULEUR = /^#[0-9a-fA-F]{6}$/;
const ID = /^p\d{1,9}$/;
const PROCHAIN_ID_MAX = 999_999_999;

/** Sérialise l'état (même format pour le fichier exporté et la sauvegarde automatique). */
export function exporter(etat: Etat): string {
  return JSON.stringify({
    version: VERSION_SCHEMA,
    participants: etat.participants.map((p) => ({ id: p.id, nom: p.nom, couleur: p.couleur })),
    cadeaux: [...etat.cadeaux],
    attribues: etat.attribues,
    historique: etat.historique.map((t) => ({
      ordre: t.ordre,
      participantId: t.participantId,
      nom: t.nom,
      cadeau: t.cadeau,
      cadeauSupprime: t.cadeauSupprime,
      heure: t.heure,
      retrait: t.retrait === null ? null : { couleur: t.retrait.couleur },
    })),
    retirerGagnants: etat.retirerGagnants,
    sonCoupe: etat.sonCoupe,
    prochainId: etat.prochainId,
  });
}

class Invalide extends Error {}

function refuser(): never {
  throw new Invalide();
}

function objet(v: unknown): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return refuser();
  return v as Record<string, unknown>;
}

/** Lecture d'une propriété propre uniquement (jamais héritée, ex. `__proto__`). */
function champ(o: Record<string, unknown>, nom: string): unknown {
  return Object.hasOwn(o, nom) ? o[nom] : undefined;
}

function tableau(v: unknown): unknown[] {
  if (!Array.isArray(v) || v.length > MAX_ELEMENTS) return refuser();
  return v as unknown[];
}

function texte(v: unknown, max = LONGUEUR_MAX_NOM): string {
  if (typeof v !== "string" || v.trim() === "" || v !== v.trim() || longueur(v) > max) return refuser();
  return v;
}

function entier(v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) return refuser();
  return v;
}

function booleen(v: unknown): boolean {
  if (typeof v !== "boolean") return refuser();
  return v;
}

function couleur(v: unknown): string | null {
  if (v === null) return null;
  if (typeof v !== "string" || !COULEUR.test(v)) return refuser();
  return v.toLowerCase();
}

function idValide(v: unknown): string {
  if (typeof v !== "string" || !ID.test(v)) return refuser();
  return v;
}

function numeroId(id: string): number {
  return Number(id.slice(1));
}

function lireParticipant(v: unknown): Participant {
  const o = objet(v);
  return { id: idValide(champ(o, "id")), nom: texte(champ(o, "nom")), couleur: couleur(champ(o, "couleur")) };
}

function lireRetrait(v: unknown): Retrait | null {
  if (v === null) return null;
  const o = objet(v);
  return { couleur: couleur(champ(o, "couleur")) };
}

function lireTirage(v: unknown): Tirage {
  const o = objet(v);
  const heure = champ(o, "heure");
  if (typeof heure !== "string" || heure.length > 40 || Number.isNaN(Date.parse(heure))) return refuser();
  const cadeau = champ(o, "cadeau");
  return {
    ordre: entier(champ(o, "ordre"), 1),
    participantId: idValide(champ(o, "participantId")),
    nom: texte(champ(o, "nom")),
    cadeau: cadeau === null ? null : texte(cadeau),
    cadeauSupprime: booleen(champ(o, "cadeauSupprime")),
    heure,
    retrait: lireRetrait(champ(o, "retrait")),
  };
}

function construire(racine: Record<string, unknown>): Etat {
  const participants = tableau(champ(racine, "participants")).map(lireParticipant);
  const cadeaux = tableau(champ(racine, "cadeaux")).map((c) => texte(c));
  const historique = tableau(champ(racine, "historique")).map(lireTirage);
  const attribues = entier(champ(racine, "attribues"), 0, cadeaux.length);
  const ids = new Set(participants.map((p) => p.id));
  if (ids.size !== participants.length) return refuser();
  let max = 0;
  for (const id of ids) max = Math.max(max, numeroId(id));
  for (const t of historique) max = Math.max(max, numeroId(t.participantId));
  return {
    participants,
    cadeaux,
    attribues,
    historique,
    retirerGagnants: booleen(champ(racine, "retirerGagnants")),
    sonCoupe: booleen(champ(racine, "sonCoupe")),
    prochainId: entier(champ(racine, "prochainId"), max + 1, PROCHAIN_ID_MAX),
  };
}

/** Valide un objet déjà décodé (ex. lu du stockage). Aucun effet de bord. */
export function valider(donnees: unknown): ResultatImport {
  let racine: Record<string, unknown>;
  try {
    racine = objet(donnees);
  } catch {
    return { ok: false, code: "format-invalide" };
  }
  const version = champ(racine, "version");
  if (typeof version !== "number") return { ok: false, code: "format-invalide" };
  if (version !== VERSION_SCHEMA) return { ok: false, code: "version-inconnue" };
  try {
    return { ok: true, etat: construire(racine) };
  } catch (e) {
    if (e instanceof Invalide) return { ok: false, code: "donnees-invalides" };
    throw e;
  }
}

/** Importe un texte JSON ; ne lève jamais et ne modifie rien : l'appelant remplace l'état si `ok`. */
export function importer(contenu: string): ResultatImport {
  if (contenu.length > TAILLE_MAX_FICHIER) {
    return { ok: false, code: "fichier-trop-gros" };
  }
  let donnees: unknown;
  try {
    donnees = JSON.parse(contenu);
  } catch {
    return { ok: false, code: "json-invalide" };
  }
  return valider(donnees);
}
