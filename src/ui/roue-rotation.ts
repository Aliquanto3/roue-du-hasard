/**
 * Moteur de rotation (F6, F8), sans DOM : piloté par le temps écoulé, pas par le nombre d'images.
 * Si `requestAnimationFrame` s'arrête (onglet en arrière-plan), un délai termine la rotation au
 * bon angle ; à l'arrêt, la rotation vaut exactement celle du domaine, sans dérive.
 */
import { angleArret, indexApresRotation, rotationFinale, type Source } from '../domain/tirage';

export const DUREE_MIN = 4000;
export const DUREE_MAX = 6000;
export const TOURS_MIN = 4;
export const TOURS_MAX = 6;
export const DUREE_FONDU = 400;
/** Le délai de secours passe après la dernière image attendue. */
const MARGE_SECOURS = 250;
const DEUX_32 = 2 ** 32;

export function normaliser(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/** Décélération naturelle : vitesse maximale au départ, nulle à l'arrivée. Monotone sur [0, 1]. */
export function deceleration(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

export interface PlanRotation {
  /** Angle de départ, dans [0, 360). */
  depart: number;
  /** Rotation cumulée à l'arrivée, tours compris. */
  fin: number;
  /** Rotation exacte à l'arrêt, dans [0, 360), issue du domaine. */
  cible: number;
  duree: number;
  tours: number;
}

export function planifierRotation(
  depart: number,
  index: number,
  n: number,
  source: Source,
  dureeForcee?: number,
): PlanRotation {
  const cible = rotationFinale(angleArret(index, n, source));
  const duree = dureeForcee ?? DUREE_MIN + (DUREE_MAX - DUREE_MIN) * (source() / DEUX_32);
  const tours = TOURS_MIN + Math.floor((source() / DEUX_32) * (TOURS_MAX - TOURS_MIN + 1));
  const debut = normaliser(depart);
  return { depart: debut, fin: debut + normaliser(cible - debut) + tours * 360, cible, duree, tours };
}

/** Rotation cumulée après `ecoule` ms ; exactement `plan.fin` au terme. */
export function rotationAuTemps(plan: PlanRotation, ecoule: number): number {
  if (ecoule >= plan.duree) return plan.fin;
  return plan.depart + (plan.fin - plan.depart) * deceleration(ecoule / plan.duree);
}

/** Frontières de secteur franchies entre deux rotations cumulées. */
export function secteursFranchis(avant: number, apres: number, n: number): number {
  const largeur = 360 / n;
  return Math.floor(apres / largeur) - Math.floor(avant / largeur);
}

export interface Horloge {
  maintenant(): number;
  demanderImage(rappel: () => void): number;
  annulerImage(id: number): void;
  differer(rappel: () => void, ms: number): number;
  annulerDelai(id: number): void;
}

/** Ce qu'il faut afficher : `rotation`, en fondu depuis `fondu.depart` si présent. */
export interface Vue {
  rotation: number;
  fondu?: { depart: number; progression: number };
}

export interface Evenements {
  debut: { index: number; n: number; reduit: boolean };
  fin: { index: number; n: number; rotation: number };
  /** Une fois par image au plus : `franchis` agrège les frontières passées depuis l'image précédente. */
  secteur: { franchis: number; index: number };
}

export type ResultatLancer =
  | { accepte: true; index: number; rotation: number }
  | { accepte: false; raison: 'en-rotation' | 'trop-peu-de-noms' | 'index-invalide' };

export interface OptionsMoteur {
  horloge: Horloge;
  source: Source;
  mouvementReduit: () => boolean;
  surImage: (vue: Vue) => void;
  /** Appelé à l'arrêt, après les écouteurs de `fin`, qui voient encore le gagnant sous le pointeur. */
  surArret?: (() => void) | undefined;
  /** Durée forcée, pour un harnais de test ; bornes de F8 sinon. */
  dureeMs?: number | undefined;
}

export interface Moteur {
  readonly enRotation: boolean;
  readonly rotation: number;
  lancer(index: number, n: number): Promise<ResultatLancer>;
  ecouter<K extends keyof Evenements>(nom: K, rappel: (e: Evenements[K]) => void): () => void;
}

export function creerMoteur(options: OptionsMoteur): Moteur {
  const { horloge, source, surImage } = options;
  const ecouteurs: { [K in keyof Evenements]: Set<(e: Evenements[K]) => void> } = {
    debut: new Set(),
    fin: new Set(),
    secteur: new Set(),
  };
  let rotation = 0;
  let enRotation = false;

  /** Une erreur chez un écouteur ne doit jamais bloquer la roue ni la promesse. */
  function emettre<K extends keyof Evenements>(nom: K, e: Evenements[K]): void {
    for (const rappel of [...ecouteurs[nom]]) {
      try {
        rappel(e);
      } catch (erreur) {
        console.error(erreur);
      }
    }
  }

  function tourner(index: number, n: number, reduit: boolean): Promise<ResultatLancer> {
    const plan = planifierRotation(rotation, index, n, source, reduit ? DUREE_FONDU : options.dureeMs);
    const t0 = horloge.maintenant();
    let cumul = plan.depart;
    let image = 0;
    let delai = 0;

    return new Promise((resoudre) => {
      const signalerSecteurs = (apres: number): void => {
        const franchis = secteursFranchis(cumul, apres, n);
        cumul = apres;
        if (franchis > 0) emettre('secteur', { franchis, index: indexApresRotation(apres, n) });
      };
      const terminer = (): void => {
        horloge.annulerImage(image);
        horloge.annulerDelai(delai);
        if (!reduit) signalerSecteurs(plan.fin);
        rotation = plan.cible;
        enRotation = false;
        surImage({ rotation });
        emettre('fin', { index, n, rotation });
        options.surArret?.();
        resoudre({ accepte: true, index, rotation });
      };
      const surAnimation = (): void => {
        const ecoule = horloge.maintenant() - t0;
        if (ecoule >= plan.duree) {
          terminer();
          return;
        }
        if (reduit) {
          surImage({
            rotation: plan.cible,
            fondu: { depart: plan.depart, progression: ecoule / plan.duree },
          });
        } else {
          const r = rotationAuTemps(plan, ecoule);
          signalerSecteurs(r);
          surImage({ rotation: r });
        }
        image = horloge.demanderImage(surAnimation);
      };
      emettre('debut', { index, n, reduit });
      image = horloge.demanderImage(surAnimation);
      delai = horloge.differer(terminer, plan.duree + MARGE_SECOURS);
    });
  }

  return {
    get enRotation() {
      return enRotation;
    },
    get rotation() {
      return rotation;
    },
    lancer(index, n) {
      if (enRotation) return Promise.resolve({ accepte: false, raison: 'en-rotation' });
      if (n < 2) return Promise.resolve({ accepte: false, raison: 'trop-peu-de-noms' });
      if (!Number.isInteger(index) || index < 0 || index >= n) {
        return Promise.resolve({ accepte: false, raison: 'index-invalide' });
      }
      enRotation = true;
      // Lu au lancement : un changement du réglage vaut pour le lancement suivant.
      return tourner(index, n, options.mouvementReduit());
    },
    ecouter(nom, rappel) {
      ecouteurs[nom].add(rappel);
      return () => ecouteurs[nom].delete(rappel);
    },
  };
}
