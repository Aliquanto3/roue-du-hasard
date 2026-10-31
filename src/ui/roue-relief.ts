/**
 * Relief de la roue (F20) : effet 3D vu de face en canvas 2D, sans perspective.
 * Deux couches pré-rendues : l'ombrage radial des secteurs, qui tourne avec l'image (il est
 * invariant par rotation), et une couche fixe (ombre portée, jante, reflet, moyeu, pointeur)
 * dessinée par-dessus à chaque image, car la lumière ne tourne pas avec la roue.
 */
import { BLANC, contraste, couleurTexte, NOIR, SEPARATEUR } from '../domain/palette';
import { geometrie, type Geometrie } from './roue-geometrie';

/** Opacité du noir sur les secteurs, dans la zone des libellés : quasi nulle (vermillon, 4,9:1). */
export const OMBRE_BASE = 0.015;
/** Opacité du noir sur le bord extérieur des secteurs. */
export const OMBRE_BORD = 0.4;
/** Largeur, en px CSS, de la zone de bord où l'ombrage monte. */
export const ZONE_BORD = 12;
/** Opacité maximale du blanc du reflet, fixe, par-dessus secteurs et libellés. */
export const REFLET_ALPHA = 0.05;
/** Seuil de contraste des libellés avec relief (WCAG AA). */
export const CONTRASTE_MIN = 4.5;

const DEUX_PI = Math.PI * 2;

/** Opacité du noir à la distance `d` (px CSS) du bord de la roue. */
export function alphaOmbre(d: number): number {
  if (d >= ZONE_BORD) return OMBRE_BASE;
  const t = 1 - Math.max(0, d) / ZONE_BORD;
  return OMBRE_BASE + (OMBRE_BORD - OMBRE_BASE) * t * t;
}

/** Distance au bord où s'arrêtent les libellés, en px CSS : au moins `ZONE_BORD`. */
export function distanceLibelleBord(taille: number): number {
  const g = geometrie(taille);
  return g.rayon - g.rayonLibelle;
}

export interface Couche {
  couleur: string;
  alpha: number;
}

function canal(hex: string, i: number): number {
  return parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
}

/** Composition « source-over » des couches, dans l'ordre, sur `fond` ; canaux arrondis comme le canvas. */
export function composer(fond: string, couches: readonly Couche[]): string {
  const c = [0, 1, 2].map((i) => canal(fond, i));
  for (const { couleur, alpha } of couches) {
    for (let i = 0; i < 3; i++) c[i] = (c[i] as number) * (1 - alpha) + canal(couleur, i) * alpha;
  }
  return `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Pire contraste du libellé d'une couleur de secteur, avec relief, dans la zone des libellés :
 * ombrage maximal sous le texte, avec ou sans le reflet fixe qui passe aussi par-dessus le texte.
 */
export function pireContrasteLibelle(secteur: string): number {
  const texte = couleurTexte(secteur);
  const ombre: Couche = { couleur: NOIR, alpha: OMBRE_BASE };
  const reflet: Couche = { couleur: BLANC, alpha: REFLET_ALPHA };
  const fond = composer(secteur, [ombre]);
  return Math.min(
    contraste(texte, fond),
    contraste(composer(texte, [reflet]), composer(secteur, [ombre, reflet])),
  );
}

/** Ombrage radial des secteurs, centré sur l'origine : à dessiner avant les libellés. */
export function ombrerSecteurs(ctx: CanvasRenderingContext2D, rayonCss: number, echelle: number): void {
  const rayonPx = rayonCss * echelle;
  const debut = Math.max(0, 1 - ZONE_BORD / rayonCss);
  const degrade = ctx.createRadialGradient(0, 0, 0, 0, 0, rayonPx);
  degrade.addColorStop(0, `rgba(0,0,0,${String(OMBRE_BASE)})`);
  degrade.addColorStop(debut, `rgba(0,0,0,${String(OMBRE_BASE)})`);
  const pas = 6;
  for (let k = 1; k <= pas; k++) {
    const d = ZONE_BORD * (1 - k / pas);
    degrade.addColorStop(debut + (k / pas) * (1 - debut), `rgba(0,0,0,${alphaOmbre(d).toFixed(4)})`);
  }
  ctx.fillStyle = degrade;
  ctx.beginPath();
  ctx.arc(0, 0, rayonPx, 0, DEUX_PI);
  ctx.fill();
}

/** Épaisseur de la jante, en px CSS : dans la marge autour de la roue. */
export function epaisseurJante(g: Geometrie): number {
  return Math.max(4, (g.taille / 2 - g.rayon) * 0.6);
}

function disque(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, DEUX_PI);
}

function dessinerJante(ctx: CanvasRenderingContext2D, g: Geometrie): void {
  const j = epaisseurJante(g);
  const interne = g.rayon + 0.75;
  const externe = g.rayon + j;
  const c = g.centre;
  const degrade = ctx.createLinearGradient(c - externe, c - externe, c + externe, c + externe);
  degrade.addColorStop(0, '#F4F5FA');
  degrade.addColorStop(0.45, '#A9AEC4');
  degrade.addColorStop(1, '#4B4F6B');
  ctx.fillStyle = degrade;
  ctx.beginPath();
  ctx.arc(c, c, externe, 0, DEUX_PI);
  ctx.arc(c, c, interne, 0, DEUX_PI, true);
  ctx.fill();
  // Biseau : liseré sombre côté roue, liseré clair côté extérieur.
  ctx.lineWidth = Math.max(1, j * 0.12);
  ctx.strokeStyle = 'rgba(20,22,43,0.55)';
  disque(ctx, c, c, interne + ctx.lineWidth / 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  disque(ctx, c, c, externe - ctx.lineWidth / 2);
  ctx.stroke();
}

function dessinerReflet(ctx: CanvasRenderingContext2D, g: Geometrie): void {
  const c = g.centre;
  const r = g.rayon;
  // Centré en haut à gauche, rayon 0,55 R : s'arrête avant le point sondé sous le pointeur.
  const x = c - 0.35 * r;
  const y = c - 0.4 * r;
  const degrade = ctx.createRadialGradient(x, y, 0, x, y, 0.55 * r);
  degrade.addColorStop(0, `rgba(255,255,255,${String(REFLET_ALPHA)})`);
  degrade.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  disque(ctx, c, c, r);
  ctx.clip();
  ctx.fillStyle = degrade;
  ctx.fillRect(c - r, c - r, 2 * r, 2 * r);
  ctx.restore();
}

function dessinerMoyeu(ctx: CanvasRenderingContext2D, g: Geometrie): void {
  const c = g.centre;
  const r = g.rayonMoyeu * 1.05;
  const degrade = ctx.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.1, c, c, r);
  degrade.addColorStop(0, '#E4E6F0');
  degrade.addColorStop(0.5, '#7C819D');
  degrade.addColorStop(1, '#2A2D48');
  const e = ctx.getTransform().a;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = r * 0.4 * e;
  ctx.shadowOffsetY = r * 0.12 * e;
  ctx.fillStyle = degrade;
  disque(ctx, c, c, r);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = SEPARATEUR;
  ctx.lineWidth = Math.max(1, r * 0.08);
  disque(ctx, c, c, r);
  ctx.stroke();
}

function dessinerPointeurRelief(ctx: CanvasRenderingContext2D, g: Geometrie): void {
  const c = g.centre;
  const chemin = (): void => {
    ctx.beginPath();
    ctx.moveTo(c, g.pointeY);
    ctx.lineTo(c - g.demiBasePointeur, g.contourPointeur);
    ctx.lineTo(c + g.demiBasePointeur, g.contourPointeur);
    ctx.closePath();
  };
  const degrade = ctx.createLinearGradient(c - g.demiBasePointeur, 0, c + g.demiBasePointeur, 0);
  degrade.addColorStop(0, '#FFFFFF');
  degrade.addColorStop(0.55, '#E3E5EF');
  degrade.addColorStop(1, '#9498B3');
  const e = ctx.getTransform().a;
  ctx.save();
  // Ombre courte, vers le bas : elle s'éteint avant le point sondé, 3,5 px sous la pointe.
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 3 * e;
  ctx.shadowOffsetY = e;
  chemin();
  ctx.fillStyle = degrade;
  ctx.fill();
  ctx.restore();
  chemin();
  ctx.strokeStyle = SEPARATEUR;
  ctx.lineWidth = g.contourPointeur;
  ctx.lineJoin = 'bevel';
  ctx.stroke();
}

/**
 * Couche fixe pré-rendue, de la taille du canvas : ombre portée hors du disque, jante, reflet,
 * moyeu et pointeur. Transparente sur la roue, hors reflet : les secteurs restent lisibles dessous.
 */
export function prerendreFixe(cible: HTMLCanvasElement, tailleCss: number, pixels: number): void {
  cible.width = pixels;
  cible.height = pixels;
  const ctx = cible.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  const echelle = pixels / tailleCss;
  const g = geometrie(tailleCss);
  ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
  const externe = g.rayon + epaisseurJante(g);
  // Ombre portée : disque ombré puis évidé, il ne reste que l'ombre qui déborde.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = tailleCss * 0.014 * echelle;
  ctx.shadowOffsetY = tailleCss * 0.005 * echelle;
  ctx.fillStyle = '#000000';
  disque(ctx, g.centre, g.centre, externe);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  disque(ctx, g.centre, g.centre, externe);
  ctx.fill();
  ctx.restore();
  dessinerJante(ctx, g);
  dessinerReflet(ctx, g);
  dessinerMoyeu(ctx, g);
  dessinerPointeurRelief(ctx, g);
}
