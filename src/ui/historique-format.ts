/** Mise en forme de l'historique (F13), sans DOM : affichage de l'heure et texte à copier. */
import type { Tirage } from '../domain/etat';
import { TEXTS } from '../texts';

const deux = (n: number): string => String(n).padStart(2, '0');

/** `HH:MM:SS` à l'heure locale ; l'horodatage illisible est rendu tel quel. */
export function formaterHeure(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${deux(d.getHours())}:${deux(d.getMinutes())}:${deux(d.getSeconds())}`;
}

/** Texte copié : une ligne d'en-tête puis une ligne par tirage, colonnes séparées par des tabulations. */
export function formaterPourCopie(historique: readonly Tirage[]): string {
  const lignes = historique.map((t) =>
    [String(t.ordre), t.nom, t.cadeau ?? '', formaterHeure(t.heure)].join('\t'),
  );
  return [TEXTS.historique.copieEntete, ...lignes].join('\n');
}
