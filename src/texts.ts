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

  // --- Annonce (F9) ---
  annonce: {
    titre: (ordre: number): string => `Résultat du tirage n° ${String(ordre)}`,
    etiquette: 'Le gagnant est',
    cadeau: (nom: string): string => `Cadeau : ${nom}`,
    relancer: 'Relancer',
    fermer: 'Fermer',
    retraitPrevu: 'Ce nom sortira de la roue à la fermeture.',
    /** Lu par le lecteur d'écran à l'ouverture (région `aria-live`). */
    live: (nom: string, cadeau: string | null): string =>
      cadeau === null ? `Le gagnant est ${nom}.` : `Le gagnant est ${nom}. Cadeau : ${cadeau}.`,
  },

  // --- Cadeaux (F11, F12) ---
  cadeaux: {
    titre: 'Cadeaux (facultatif)',
    ajoutLibelle: 'Ajouter un cadeau',
    ajoutBouton: 'Ajouter le cadeau',
    collageLibelle: 'Coller une liste de cadeaux',
    collageAide:
      'Un cadeau par ligne, dans l’ordre d’attribution ; les virgules et les points-virgules séparent aussi.',
    collageBouton: 'Ajouter les cadeaux',
    listeLibelle: 'Liste des cadeaux, dans l’ordre d’attribution',
    vide: 'Aucun cadeau : la roue désigne seulement un nom.',
    compteur: (attribues: number, total: number): string =>
      `${String(attribues)} attribué${attribues > 1 ? 's' : ''} sur ${String(total)}`,
    libelleLigne: (rang: number): string => `Cadeau n° ${String(rang)}`,
    supprimerLibelle: (nom: string): string => `Supprimer le cadeau ${nom}`,
    attribue: 'Attribué',
    prochain: 'Prochain',
    prochainPhrase: (numero: number, total: number, nom: string): string =>
      `Cadeau n° ${String(numero)} sur ${String(total)} : ${nom}`,
    sansRotation: (nom: string): string => `Attribuer à ${nom} sans rotation`,
    statutAjoute: (n: number): string => `${pluriel(n, 'cadeau ajouté', 'cadeaux ajoutés')}.`,
    statutRenomme: 'Cadeau modifié.',
    statutSupprime: (nom: string): string => `Cadeau ${nom} retiré de la liste.`,
    statutRecommence: 'Attributions recommencées : tous les cadeaux sont de nouveau disponibles.',
    recapTitre: 'Tous les cadeaux sont attribués',
    recapLigne: (cadeau: string, nom: string): string => `${cadeau} : ${nom}`,
    recommencer: 'Recommencer les attributions',
    indiceEpuises: 'Tous les cadeaux sont attribués. Recommencez les attributions pour relancer la roue.',
    indicePlusDeNoms:
      'Il reste moins de deux noms, car les gagnants ont été retirés de la roue. Ajoutez des noms, ou annulez le dernier tirage.',
  },

  // --- Historique (F13) et retrait des gagnants (F19) ---
  historique: {
    titre: 'Historique des tirages',
    retirerLibelle: 'Retirer les gagnants de la roue',
    retirerAide: 'Cochée, le gagnant sort de la roue quand on ferme l’annonce.',
    tableLibelle: 'Tirages, du plus ancien au plus récent',
    colonnes: { ordre: 'N°', nom: 'Nom', cadeau: 'Cadeau', heure: 'Heure' },
    vide: 'Aucun tirage pour le moment.',
    compteur: (n: number): string => pluriel(n, 'tirage', 'tirages'),
    copier: 'Copier l’historique',
    effacer: 'Effacer l’historique',
    annuler: 'Annuler le dernier tirage',
    confirmationTitre: (n: number): string => `Effacer ${pluriel(n, 'tirage', 'tirages')} de l’historique ?`,
    confirmationAide: 'Cette action est définitive. Les cadeaux déjà attribués restent attribués.',
    confirmer: 'Effacer',
    garder: 'Garder',
    copieEntete: 'N°\tNom\tCadeau\tHeure',
    copieOk: 'Historique copié dans le presse-papiers.',
    copieRepli:
      'La copie automatique est refusée par le navigateur. Le texte ci-dessous est sélectionné : copiez-le avec Ctrl+C (ou ⌘C).',
    copieZoneLibelle: 'Historique à copier',
    statutEfface: 'Historique effacé.',
    statutAnnule: (nom: string, remis: boolean, cadeauRendu: boolean): string =>
      `Dernier tirage annulé (${nom})${remis ? `, ${nom} est de nouveau dans la roue` : ''}${
        cadeauRendu ? ', cadeau de nouveau disponible' : ''
      }.`,
    statutOption: (v: boolean): string =>
      v ? 'Les gagnants seront retirés de la roue.' : 'Les gagnants restent dans la roue.',
  },

  refus: {
    'rotation-en-cours': 'Rotation en cours : la liste ne peut pas être modifiée.',
    'annonce-fermee': 'Aucune annonce n’est ouverte.',
    'annonce-ouverte': 'Fermez d’abord l’annonce du résultat.',
    'historique-vide': 'Il n’y a aucun tirage à annuler.',
    'attribution-impossible': 'Il faut exactement un nom et un cadeau disponible pour attribuer sans rotation.',
    'moins-de-2-noms': 'Il faut au moins deux noms pour lancer la roue.',
    'cadeaux-epuises': 'Tous les cadeaux sont attribués.',
    'nom-vide': 'Le nom est vide.',
    introuvable: 'Ce nom n’existe plus.',
    'couleur-invalide': 'Cette couleur n’est pas valide.',
  },
} as const;
