/** Textes du chat (V1.1), centralisés comme ceux de l'interface (N8). Rendus en texte seulement. */
import type { CodeRefus } from '../actions';
import type { LibelleCadeau } from '../domain/etat';
import { TEXTS } from '../texts';

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

const LIBELLES_ETAPES: Readonly<Record<string, string>> = {
  supprimer: 'Supprimer',
  effacerHistorique: 'Effacer l’historique',
  reinitialiserCouleurs: 'Réinitialiser toutes les couleurs',
  ajouter: 'Ajouter',
  renommer: 'Renommer',
  lancer: 'Lancer la roue',
};

const refusChat = (code: string | undefined): string => {
  const cle = code ?? 'incompris';
  return (Object.hasOwn(REFUS_CHAT, cle) ? REFUS_CHAT[cle] : undefined) ?? REFUS_CHAT['incompris'] ?? '';
};

export const TEXTES_CHAT = {
  refusChat,
  refusAction: (code: CodeRefus): string => REFUS_ACTION[code],
  clarifier: (candidats: readonly string[]): string =>
    candidats.length === 0 ? 'De qui parlez-vous ?' : `De qui parlez-vous : ${candidats.join(' ou ')} ?`,
  confirmer: 'Cette action est irréversible. Confirmer ?',
  fait: 'C’est fait.',
  titre: 'Chat',
  basculerOuvrir: 'Ouvrir le chat',
  basculerFermer: 'Replier le chat',
  filLibelle: 'Échanges avec le chat',
  saisieLibelle: 'Commande',
  saisieAide: 'Par exemple : ajoute Léo',
  envoyer: 'Envoyer',
  reflexion: 'Je réfléchis…',
  auteurMoi: 'Vous',
  auteurChat: 'Chat',
  confirmerBouton: 'Confirmer',
  annulerBouton: 'Annuler',
  confirmationTitre: 'Étapes à exécuter',
  confirmationPerimee: 'La liste a changé depuis la demande : rien n’a été fait. Redemandez la commande.',
  confirmationAbandonnee: 'Confirmation annulée : une nouvelle commande a été envoyée, rien n’a été fait.',
  commandeAnnulee: 'Commande annulée.',
  ambigu: 'Plusieurs personnes portent ce nom : renommez-en une, ou demandez « supprime les deux ».',
  reglagesTitre: 'Réglages du modèle',
  reglageSlm: 'Modèle de langage (SLM)',
  reglageDecision: 'Modèle de décision',
  reglagesAide: 'Vides, seules les commandes simples sont comprises. Enregistrés dans ce navigateur.',
  /** Un seul avis par session, quand le modèle configuré ne répond pas. */
  avisIndisponible:
    'Le modèle local ne répond pas : seules les commandes simples sont comprises. Pour l’utiliser, lancez Ollama avec OLLAMA_ORIGINS=http://localhost:5200 (par exemple « OLLAMA_ORIGINS=http://localhost:5200 ollama serve »).',
  /** Modèle configuré mais non installé : Ollama répond, mais ne connaît pas ce nom. */
  avisModeleAbsent: (modele: string): string =>
    `Le modèle « ${modele} » n’est pas installé : seules les commandes simples sont comprises. Installez-le avec « ollama pull ${modele} » ou corrigez son nom dans les réglages.`,
  /** Messages de l'interface pour un refus d'action (rotation, moins de 2 noms, cadeaux épuisés…), sinon ceux du chat. */
  refusPlan: (code: string | undefined): string =>
    code !== undefined && Object.hasOwn(TEXTS.refus, code)
      ? TEXTS.refus[code as keyof typeof TEXTS.refus]
      : refusChat(code),
  /** Libellé d'une étape pour la carte de confirmation ; les paramètres sont des données, rendues en texte. */
  etape: (action: string, params: Readonly<Record<string, unknown>> | undefined): string => {
    const valeurs = Object.values(params ?? {})
      .map(String)
      .filter((v) => v !== '');
    const libelle = (Object.hasOwn(LIBELLES_ETAPES, action) ? LIBELLES_ETAPES[action] : undefined) ?? action;
    return valeurs.length === 0 ? libelle : `${libelle} : ${valeurs.join(', ')}`;
  },
  cadeauSuivant: (libelle: LibelleCadeau | null): string =>
    libelle === null
      ? 'Il n’y a plus de cadeau à attribuer.'
      : `Cadeau n° ${String(libelle.numero)} sur ${String(libelle.total)} : ${libelle.nom}`,
} as const;
