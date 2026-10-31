/** Textes de l'interface, centralisés (N8). */
import { LONGUEUR_MAX_NOM } from './domain/normalisation';

const pluriel = (n: number, singulier: string, plurielForme: string): string =>
  `${String(n)} ${n > 1 ? plurielForme : singulier}`;

export const TEXTS = {
  title: 'Roue du hasard',
  roueLancer: 'Lancer la roue',
  roueDescription: 'Roue du hasard, avec un pointeur fixe en haut',
  roueIndice: 'Ajoutez au moins deux noms pour lancer la roue.',

  panneauTitre: 'Participants',
  ajoutLibelle: 'Ajouter un nom',
  ajoutBouton: 'Ajouter',
  collageLibelle: 'Coller une liste de noms',
  collageAide: 'Un nom par ligne ; les virgules et les points-virgules séparent aussi les noms.',
  collageBouton: 'Ajouter la liste',
  longueurMax: `${String(LONGUEUR_MAX_NOM)} caractères au maximum par nom.`,
  listeLibelle: 'Liste des participants',
  listeVide: 'Aucun nom pour le moment.',
  couleursTout: 'Revenir aux couleurs par défaut',
  compteur: (n: number): string => pluriel(n, 'nom', 'noms'),
  doublons: (n: number): string =>
    `Attention : ${pluriel(n, 'doublon', 'doublons')} (un nom en double est permis).`,
  nomLibelle: (rang: number): string => `Nom n° ${String(rang)}`,
  couleurLibelle: (nom: string): string => `Couleur de ${nom}`,
  couleurDefautLibelle: (nom: string): string => `Revenir à la couleur par défaut de ${nom}`,
  supprimerLibelle: (nom: string): string => `Supprimer ${nom}`,
  supprimerBouton: 'Supprimer',
  couleurDefautBouton: 'Défaut',

  statutAjoute: (n: number): string => `${pluriel(n, 'nom ajouté', 'noms ajoutés')}.`,
  statutRenomme: 'Nom modifié.',
  statutSupprime: (nom: string): string => `${nom} retiré de la liste.`,
  statutCouleurs: 'Couleurs par défaut rétablies.',
  statutTronques: (n: number): string =>
    `${pluriel(n, 'nom raccourci', 'noms raccourcis')} à ${String(LONGUEUR_MAX_NOM)} caractères.`,
  statutVerrou: 'Rotation en cours : la modification de la liste est verrouillée.',
  statutDeverrou: 'Rotation terminée : la liste peut de nouveau être modifiée.',

  refus: {
    'rotation-en-cours': 'Rotation en cours : la liste ne peut pas être modifiée.',
    'moins-de-2-noms': 'Il faut au moins deux noms pour lancer la roue.',
    'cadeaux-epuises': 'Tous les cadeaux sont attribués.',
    'nom-vide': 'Le nom est vide.',
    introuvable: 'Ce nom n’existe plus.',
    'couleur-invalide': 'Cette couleur n’est pas valide.',
  },
} as const;
