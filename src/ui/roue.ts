/**
 * Roue du hasard : canvas, pointeur, bandeau F10, bouton et toucher (F5 à F8, F10, N7).
 * Elle reçoit un gagnant déjà tiré : ce module ne décide jamais du résultat.
 */
import { indexApresRotation, sourceCrypto, type Source } from '../domain/tirage';
import { TEXTS } from '../texts';
import { CORPS_MIN, estSurRoue, geometrie, taillePixels } from './roue-geometrie';
import { creerGeste } from './roue-geste';
import { dessinerImage, prerendre, type NomRoue } from './roue-rendu';
import {
  creerMoteur,
  type Evenements,
  type Horloge,
  type ResultatLancer,
  type Vue,
} from './roue-rotation';
import { epaisseurJante, prerendreFixe } from './roue-relief';
import './roue.css';

export type { NomRoue } from './roue-rendu';
export type { Evenements, ResultatLancer } from './roue-rotation';

/** Délai de regroupement du pré-rendu pendant un redimensionnement, en ms. */
const REGROUPEMENT_PRERENDU = 100;

export interface OptionsRoue {
  /** Geste de lancement reçu (bouton, toucher) alors que la roue peut partir : tirer puis `lancer`. */
  surDemande: () => void;
  /** Source de l'angle d'arrêt et de la durée ; `crypto` par défaut. */
  source?: Source | undefined;
  /** Durée forcée, pour le harnais de test seulement. */
  dureeMs?: number | undefined;
  /** Rendu en relief (F20) ; plat par défaut. */
  relief?: boolean | undefined;
}

export interface Roue {
  /** Conduit la roue au gagnant déjà tiré ; résolue à l'arrêt, ou aussitôt avec `accepte: false`. */
  lancer(index: number): Promise<ResultatLancer>;
  /** Remplace la liste ; pendant une rotation, appliqué à l'arrêt, après les écouteurs de `fin`. */
  definirNoms(noms: readonly NomRoue[]): void;
  /** Événements `debut`, `fin` et `secteur` ; renvoie la fonction de désabonnement. */
  ecouter<K extends keyof Evenements>(nom: K, rappel: (e: Evenements[K]) => void): () => void;
  readonly enRotation: boolean;
  /** Rotation au repos, dans [0, 360). */
  readonly rotation: number;
  /** Active ou coupe le relief : redessine l'image pré-rendue, sans toucher à la rotation. */
  definirRelief(actif: boolean): void;
  readonly relief: boolean;
  readonly nombre: number;
  readonly peutLancer: boolean;
  readonly bouton: HTMLButtonElement;
  readonly canvas: HTMLCanvasElement;
}

const horlogeNavigateur: Horloge = {
  maintenant: () => performance.now(),
  demanderImage: (rappel) => requestAnimationFrame(rappel),
  annulerImage: (id) => cancelAnimationFrame(id),
  differer: (rappel, ms) => window.setTimeout(rappel, ms),
  annulerDelai: (id) => window.clearTimeout(id),
};

function element<K extends keyof HTMLElementTagNameMap>(
  balise: K,
  classe: string,
  parent: HTMLElement,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(balise);
  el.className = classe;
  parent.append(el);
  return el;
}

export function creerRoue(conteneur: HTMLElement, options: OptionsRoue): Roue {
  const racine = element('div', 'roue', conteneur);
  const scene = element('div', 'roue__scene', racine);
  const canvas = element('canvas', 'roue__canvas', scene);
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', TEXTS.roueDescription);
  const bandeau = element('div', 'roue__bandeau', scene);
  bandeau.hidden = true;
  const indice = element('p', 'roue__indice', racine);
  indice.id = 'roue-indice';
  indice.textContent = TEXTS.roueIndice;
  const bouton = element('button', 'roue__bouton', racine);
  bouton.type = 'button';
  bouton.textContent = TEXTS.roueLancer;

  const image = document.createElement('canvas');
  const fixe = document.createElement('canvas');
  let relief = options.relief ?? false;
  let noms: readonly NomRoue[] = [];
  let enAttente: readonly NomRoue[] | null = null;
  let tailleCss = 0;
  let sansLibelles = false;
  let dernierIndexBandeau = -1;
  let vue: Vue = { rotation: 0 };
  let minuteur = 0;

  const moteur = creerMoteur({
    horloge: horlogeNavigateur,
    source: options.source ?? sourceCrypto,
    mouvementReduit: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    surImage: afficher,
    surArret: appliquerAttente,
    dureeMs: options.dureeMs,
  });

  function peutLancer(): boolean {
    return noms.length >= 2 && !moteur.enRotation;
  }

  function majEtatLancement(): void {
    const lancable = peutLancer();
    // `aria-disabled` plutôt que `disabled` : le bouton garde le focus clavier pendant la rotation.
    bouton.setAttribute('aria-disabled', String(!lancable));
    canvas.dataset['lancable'] = String(lancable);
    const manquant = noms.length < 2;
    indice.hidden = !manquant;
    if (manquant) bouton.setAttribute('aria-describedby', indice.id);
    else bouton.removeAttribute('aria-describedby');
  }

  function majBandeau(rotation: number): void {
    if (!sansLibelles) return;
    const i = indexApresRotation(rotation, noms.length);
    if (i !== dernierIndexBandeau) {
      dernierIndexBandeau = i;
      bandeau.textContent = noms[i]?.nom ?? '';
    }
  }

  function afficher(nouvelle: Vue): void {
    vue = nouvelle;
    // Pendant un fondu, le bandeau suit l'image dominante : il ne révèle pas le gagnant d'avance.
    majBandeau(vue.fondu && vue.fondu.progression < 0.5 ? vue.fondu.depart : vue.rotation);
    if (tailleCss > 0) dessinerImage(canvas, image, tailleCss, vue, relief ? fixe : null);
  }

  /** Redessine l'image pré-rendue : seulement à l'édition et au redimensionnement. */
  function repreparer(): void {
    window.clearTimeout(minuteur);
    if (tailleCss <= 0) return;
    const corps = prerendre(image, noms, tailleCss, canvas.width, relief);
    // Sans relief, la couche fixe ne garde pas sa mémoire.
    if (relief) prerendreFixe(fixe, tailleCss, canvas.width);
    else fixe.width = 0;
    sansLibelles = noms.length >= 2 && corps < CORPS_MIN;
    bandeau.hidden = !sansLibelles;
    bandeau.style.top = `${String(geometrie(tailleCss).pointeY + 6)}px`;
    dernierIndexBandeau = -1;
    if (!sansLibelles) bandeau.textContent = '';
    canvas.dataset['corps'] = String(corps);
    afficher(vue);
  }

  /** Ajuste le canvas et redessine aussitôt avec l'image existante : la rotation ne saute pas. */
  function ajusterTaille(): void {
    const css = scene.getBoundingClientRect().width;
    const pixels = taillePixels(css, window.devicePixelRatio);
    if (css === tailleCss && pixels === canvas.width) return;
    const premier = tailleCss === 0;
    tailleCss = css;
    canvas.width = pixels;
    canvas.height = pixels;
    if (css <= 0) return;
    canvas.dataset['sondeX'] = String(Math.floor(pixels / 2));
    canvas.dataset['sondeY'] = String(Math.round((geometrie(css).sondeY * pixels) / css));
    if (premier) {
      repreparer();
      return;
    }
    dessinerImage(canvas, image, css, vue, relief ? fixe : null);
    window.clearTimeout(minuteur);
    minuteur = window.setTimeout(repreparer, REGROUPEMENT_PRERENDU);
  }

  function appliquerNoms(liste: readonly NomRoue[]): void {
    noms = [...liste];
    canvas.dataset['noms'] = String(noms.length);
    repreparer();
    majEtatLancement();
  }

  /** Un écouteur de `fin` a pu relancer : la liste attend alors l'arrêt suivant. */
  function appliquerAttente(): void {
    if (!enAttente || moteur.enRotation) return;
    const liste = enAttente;
    enAttente = null;
    appliquerNoms(liste);
  }

  function demander(): void {
    if (peutLancer()) options.surDemande();
  }

  moteur.ecouter('debut', majEtatLancement);
  moteur.ecouter('fin', majEtatLancement);

  bouton.addEventListener('click', demander);

  // Événements de pointeur seuls : pas de `click` sur le canvas, donc pas de double lancement par
  // un toucher suivi de son clic synthétique. Un défilement déclenche `pointercancel`.
  const geste = creerGeste();
  canvas.addEventListener('pointerdown', (e) => {
    if (e.isPrimary && e.button === 0) geste.debut(e.pointerId, e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', (e) => {
    geste.deplacement(e.pointerId, e.clientX, e.clientY);
  });
  canvas.addEventListener('pointercancel', (e) => {
    geste.annuler(e.pointerId);
  });
  canvas.addEventListener('pointerleave', (e) => {
    geste.annuler(e.pointerId);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!geste.fin(e.pointerId, e.clientX, e.clientY)) return;
    const cadre = canvas.getBoundingClientRect();
    const g = geometrie(cadre.width);
    // En relief, la jante fait partie de la roue visible.
    const cible = relief ? { ...g, rayon: g.rayon + epaisseurJante(g) } : g;
    if (estSurRoue(e.clientX - cadre.left, e.clientY - cadre.top, cible)) demander();
  });

  new ResizeObserver(ajusterTaille).observe(scene);
  // Un changement de DPR seul (écran déplacé, zoom) ne change pas toujours la taille CSS.
  const suivreDpr = (): void => {
    window.matchMedia(`(resolution: ${String(window.devicePixelRatio)}dppx)`).addEventListener(
      'change',
      () => {
        ajusterTaille();
        suivreDpr();
      },
      { once: true },
    );
  };
  suivreDpr();

  ajusterTaille();
  appliquerNoms([]);

  return {
    lancer: (index) => moteur.lancer(index, noms.length),
    definirNoms(liste) {
      if (moteur.enRotation) {
        enAttente = [...liste];
      } else {
        enAttente = null;
        appliquerNoms(liste);
      }
    },
    ecouter: (nom, rappel) => moteur.ecouter(nom, rappel),
    definirRelief(actif) {
      if (actif === relief) return;
      relief = actif;
      repreparer();
    },
    get relief() {
      return relief;
    },
    get enRotation() {
      return moteur.enRotation;
    },
    get rotation() {
      return moteur.rotation;
    },
    get nombre() {
      return noms.length;
    },
    get peutLancer() {
      return peutLancer();
    },
    bouton,
    canvas,
  };
}
