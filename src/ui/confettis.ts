/** Confettis en canvas, sans bibliothèque (F17). Désactivés en mouvement réduit (N6). */

/** Le conteneur doit être positionné (`position: relative`) : le canvas s'y place en absolu. */
export interface ConteneurConfettis {
  readonly clientWidth: number;
  readonly clientHeight: number;
  appendChild(noeud: HTMLCanvasElement): unknown;
}

export interface OptionsConfettis {
  /** Nombre dans [0, 1). Par défaut `crypto.getRandomValues`, hors tirage du gagnant. */
  source?: () => number;
  /** Mouvement réduit ; sinon lu à chaque lancement via `matchMedia`. */
  reduit?: boolean;
  /** Horloge en millisecondes. */
  maintenant?: () => number;
  demanderImage?: (rappel: () => void) => number;
  annulerImage?: (id: number) => void;
  creerCanvas?: () => HTMLCanvasElement;
}

export interface Confettis {
  lancer(couleurs: readonly string[]): void;
  arreter(): void;
}

export const DUREE_CONFETTIS_MS = 3500;
export const PARTICULES_MAX = 150;
export const PARTICULES_MIN = 30;
export const RATIO_PIXELS_MAX = 2;
/** Surface d'un écran 4K : au-delà (écran 5K à ratio 2…), la netteté ne vaut pas le coût par image (N7). */
const SURFACE_MAX = 3840 * 2160;
const PIXELS_PAR_PARTICULE = 8000;
const GRAVITE = 900; // px/s²

interface Particule {
  x: number;
  y: number;
  vx: number;
  vy: number;
  largeur: number;
  hauteur: number;
  angle: number;
  rotation: number;
  couleur: string;
}

function sourceParDefaut(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] ?? 0) / 2 ** 32;
}

export function nombreParticules(largeur: number, hauteur: number): number {
  const n = Math.round((largeur * hauteur) / PIXELS_PAR_PARTICULE);
  return Math.max(PARTICULES_MIN, Math.min(PARTICULES_MAX, n));
}

export function creerConfettis(conteneur: ConteneurConfettis, options: OptionsConfettis = {}): Confettis {
  const source = options.source ?? sourceParDefaut;
  const maintenant = options.maintenant ?? (() => performance.now());
  const demander = options.demanderImage ?? ((f) => requestAnimationFrame(f));
  const annuler = options.annulerImage ?? ((id) => cancelAnimationFrame(id));
  const creerCanvas = options.creerCanvas ?? (() => document.createElement('canvas'));
  let canvas: HTMLCanvasElement | null = null;
  let image: number | null = null;

  function mouvementReduit(): boolean {
    if (options.reduit !== undefined) return options.reduit;
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  function arreter(): void {
    if (image !== null) annuler(image);
    image = null;
    canvas?.remove();
    canvas = null;
  }

  function lancer(couleurs: readonly string[]): void {
    arreter();
    if (mouvementReduit() || couleurs.length === 0) return;
    try {
      const largeur = Math.max(1, conteneur.clientWidth || globalThis.innerWidth || 1);
      const hauteur = Math.max(1, conteneur.clientHeight || globalThis.innerHeight || 1);
      const ratio = Math.min(
        globalThis.devicePixelRatio || 1,
        RATIO_PIXELS_MAX,
        Math.sqrt(SURFACE_MAX / (largeur * hauteur)),
      );
      const c = creerCanvas();
      const ctx = c.getContext('2d');
      if (!ctx) return;
      c.width = Math.round(largeur * ratio);
      c.height = Math.round(hauteur * ratio);
      c.setAttribute('aria-hidden', 'true');
      c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
      conteneur.appendChild(c);
      canvas = c;

      const alea = (min: number, max: number): number => min + source() * (max - min);
      const particules: Particule[] = Array.from({ length: nombreParticules(largeur, hauteur) }, () => ({
        x: alea(0.2, 0.8) * largeur,
        y: hauteur * 0.35,
        vx: alea(-0.5, 0.5) * largeur * 0.8,
        vy: -alea(0.4, 1) * hauteur * 1.1,
        largeur: alea(6, 12),
        hauteur: alea(4, 8),
        angle: alea(0, Math.PI * 2),
        rotation: alea(-8, 8),
        couleur: couleurs[Math.floor(source() * couleurs.length) % couleurs.length] ?? '#fff',
      }));
      const debut = maintenant();

      const dessiner = (): void => {
        image = null;
        if (canvas !== c) return;
        const t = maintenant() - debut;
        if (t >= DUREE_CONFETTIS_MS) {
          arreter();
          return;
        }
        const s = t / 1000;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, largeur, hauteur);
        ctx.globalAlpha = Math.min(1, (DUREE_CONFETTIS_MS - t) / 600);
        for (const p of particules) {
          ctx.save();
          ctx.translate(p.x + p.vx * s, p.y + p.vy * s + 0.5 * GRAVITE * s * s);
          ctx.rotate(p.angle + p.rotation * s);
          ctx.fillStyle = p.couleur;
          ctx.fillRect(-p.largeur / 2, -p.hauteur / 2, p.largeur, p.hauteur);
          ctx.restore();
        }
        image = demander(dessiner);
      };
      image = demander(dessiner);
    } catch {
      arreter();
    }
  }

  return { lancer, arreter };
}
