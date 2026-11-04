/** Textes du chat (V1.1), centralisés comme ceux de l'interface (N8). Rendus en texte seulement. */
import type { CodeRefus } from '../actions';
import type { LibelleCadeau } from '../domain/etat';

/** Refus propres au chat (hors `CodeRefus` de `actions.ts`, qui garde ses messages d'interface). */
export const REFUS_CHAT: Readonly<Record<string, string>> = {
  incompris: 'Je n’ai pas compris cette commande.',
  indisponible: 'Cette fonction n’est pas encore disponible.',
  annule: 'Commande annulée.',
  'nom-absent': 'Je ne trouve personne de ce nom dans la liste.',
  'action-inconnue': 'Je ne sais pas faire cela.',
  'forme-invalide': 'La réponse du moteur n’a pas la forme attendue.',
  'conflit-etapes': 'Deux étapes visent la même personne : précisez une seule demande à la fois.',
  'parametres-invalides': 'La commande est incomplète ou mal formée.',
};

const REFUS_ACTION: Readonly<Record<CodeRefus, string>> = {
  'rotation-en-cours': 'La roue tourne : attendez la fin de la rotation.',
  'moins-de-2-noms': 'Il faut au moins deux noms pour lancer la roue.',
  'cadeaux-epuises': 'Tous les cadeaux sont déjà attribués.',
  'nom-vide': 'Le nom est vide.',
  introuvable: 'Cet élément n’existe pas.',
  'couleur-invalide': 'Cette couleur n’est pas valide.',
  'annonce-fermee': 'Aucune annonce n’est ouverte.',
  'annonce-ouverte': 'Fermez d’abord l’annonce du tirage.',
  'historique-vide': 'L’historique est vide.',
  'attribution-impossible': 'L’attribution sans rotation est impossible.',
  'rendu-invalide': 'Ce rendu n’existe pas.',
};

export const TEXTES_CHAT = {
  refusChat: (code: string | undefined): string => REFUS_CHAT[code ?? 'incompris'] ?? REFUS_CHAT['incompris'] ?? '',
  refusAction: (code: CodeRefus): string => REFUS_ACTION[code],
  clarifier: (candidats: readonly string[]): string =>
    candidats.length === 0 ? 'De qui parlez-vous ?' : `De qui parlez-vous : ${candidats.join(' ou ')} ?`,
  confirmer: 'Cette action est irréversible. Confirmer ?',
  fait: 'C’est fait.',
  slmIndisponible: 'Le modèle de langage local est indisponible : seules les commandes simples sont comprises.',
  cadeauSuivant: (libelle: LibelleCadeau | null): string =>
    libelle === null
      ? 'Il n’y a plus de cadeau à attribuer.'
      : `Cadeau n° ${String(libelle.numero)} sur ${String(libelle.total)} : ${libelle.nom}`,
} as const;
