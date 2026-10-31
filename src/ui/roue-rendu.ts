/** Dessin de la roue : image pré-rendue (secteurs, libellés) et composition de chaque image. */
import { couleursParDefaut, couleurTexte, SEPARATEUR } from '../domain/palette';
import {
  corpsLibelle,
  CORPS_MIN,
  geometrie,
  rayonInterieurLibelle,
  separateurs,
  tronquer,
} from './roue-geometrie';
import { ombrerSecteurs } from './roue-relief';
import type { Vue } from './roue-rotation';

export interface NomRoue {
  nom: string;
  couleur: string | null;
}

const NEUTRE = '#6B6F8A';
const POINTEUR = '#FFFFFF';
const POLICE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const DEUX_PI = Math.PI * 2;
const HAUT = -Math.PI / 2;

/** Secteur par défaut sauf couleur personnalisée, qui ne touche que son secteur. */
export function couleursSecteurs(noms: readonly NomRoue[]): string[] {
  const defauts = couleursParDefaut(noms.length);
  return noms.map((p, i) => p.couleur ?? (defauts[i] as string));
}

function contexte(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  return ctx;
}

function dessinerSecteurs(ctx: CanvasRenderingContext2D, couleurs: readonly string[], rayonPx: number): void {
  const largeur = DEUX_PI / couleurs.length;
  // Léger recouvrement d'un demi-pixel : pas de joint d'anticrénelage entre deux secteurs.
  const recouvrement = 0.5 / rayonPx;
  couleurs.forEach((couleur, i) => {
    const a = HAUT + i * largeur;
    ctx.fillStyle = couleur;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, rayonPx, a, a + largeur + recouvrement);
    ctx.closePath();
    ctx.fill();
  });
}

function dessinerSeparateurs(ctx: CanvasRenderingContext2D, n: number, rayon: number, echelle: number): void {
  const { epaisseur, rayonDebut } = separateurs(rayon, n);
  if (epaisseur === 0) return;
  ctx.strokeStyle = SEPARATEUR;
  ctx.lineWidth = epaisseur * echelle;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = HAUT + (i * DEUX_PI) / n;
    ctx.moveTo(Math.cos(a) * rayonDebut * echelle, Math.sin(a) * rayonDebut * echelle);
    ctx.lineTo(Math.cos(a) * rayon * echelle, Math.sin(a) * rayon * echelle);
  }
  ctx.stroke();
}

function dessinerLibelles(
  ctx: CanvasRenderingContext2D,
  noms: readonly NomRoue[],
  couleurs: readonly string[],
  corps: number,
  taille: number,
  echelle: number,
): void {
  const g = geometrie(taille);
  const n = noms.length;
  const largeur = DEUX_PI / n;
  const place = (g.rayonLibelle - rayonInterieurLibelle(corps, g.rayon, n)) * echelle;
  ctx.font = `600 ${String(corps * echelle)}px ${POLICE}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const mesure = (t: string): number => ctx.measureText(t).width;
  noms.forEach((p, i) => {
    const texte = tronquer(p.nom, place, mesure);
    if (!texte) return;
    ctx.save();
    ctx.rotate(HAUT + (i + 0.5) * largeur);
    ctx.fillStyle = couleurTexte(couleurs[i] as string);
    ctx.fillText(texte, g.rayonLibelle * echelle, 0);
    ctx.restore();
  });
}

/** Redessine l'image de la roue dans `cible`, à rotation nulle. Renvoie le corps retenu, en px CSS. */
export function prerendre(
  cible: HTMLCanvasElement,
  noms: readonly NomRoue[],
  tailleCss: number,
  pixels: number,
  relief = false,
): number {
  cible.width = pixels;
  cible.height = pixels;
  const ctx = contexte(cible);
  const echelle = pixels / tailleCss;
  const g = geometrie(tailleCss);
  const n = noms.length;
  const rayonPx = g.rayon * echelle;
  ctx.translate(pixels / 2, pixels / 2);

  let corps = 0;
  ctx.fillStyle = n < 2 ? NEUTRE : SEPARATEUR;
  ctx.beginPath();
  ctx.arc(0, 0, rayonPx, 0, DEUX_PI);
  ctx.fill();
  if (n >= 2) {
    const couleurs = couleursSecteurs(noms);
    dessinerSecteurs(ctx, couleurs, rayonPx);
    dessinerSeparateurs(ctx, n, g.rayon, echelle);
    // Relief : l'ombrage passe sous les libellés, qui gardent leur couleur et leur contraste.
    if (relief) ombrerSecteurs(ctx, g.rayon, echelle);
    corps = corpsLibelle(g.rayon, n);
    if (corps >= CORPS_MIN) dessinerLibelles(ctx, noms, couleurs, corps, tailleCss, echelle);
  }
  ctx.strokeStyle = SEPARATEUR;
  ctx.lineWidth = Math.max(1.5, g.rayon * 0.008) * echelle;
  ctx.beginPath();
  ctx.arc(0, 0, rayonPx, 0, DEUX_PI);
  ctx.stroke();
  ctx.fillStyle = SEPARATEUR;
  ctx.beginPath();
  ctx.arc(0, 0, g.rayonMoyeu * echelle, 0, DEUX_PI);
  ctx.fill();
  return corps;
}

function dessinerPointeur(ctx: CanvasRenderingContext2D, tailleCss: number, echelle: number): void {
  const g = geometrie(tailleCss);
  ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
  ctx.beginPath();
  ctx.moveTo(g.centre, g.pointeY);
  ctx.lineTo(g.centre - g.demiBasePointeur, g.contourPointeur);
  ctx.lineTo(g.centre + g.demiBasePointeur, g.contourPointeur);
  ctx.closePath();
  ctx.fillStyle = POINTEUR;
  ctx.fill();
  ctx.strokeStyle = SEPARATEUR;
  ctx.lineWidth = g.contourPointeur;
  // Pointe sans onglet : le contour ne descend pas jusqu'au point de sonde.
  ctx.lineJoin = 'bevel';
  ctx.stroke();
}

/** Compose une image : seule l'image pré-rendue tourne ; le pointeur (ou la couche fixe du relief) reste par-dessus. */
export function dessinerImage(
  canvas: HTMLCanvasElement,
  image: HTMLCanvasElement,
  tailleCss: number,
  vue: Vue,
  fixe: HTMLCanvasElement | null = null,
): void {
  const ctx = contexte(canvas);
  const cote = canvas.width;
  const poser = (rotation: number, alpha: number): void => {
    ctx.setTransform(1, 0, 0, 1, cote / 2, cote / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.globalAlpha = alpha;
    // L'image peut être d'une autre taille juste après un redimensionnement : mise à l'échelle.
    ctx.drawImage(image, -cote / 2, -cote / 2, cote, cote);
  };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cote, cote);
  if (vue.fondu) {
    poser(vue.fondu.depart, 1);
    poser(vue.rotation, vue.fondu.progression);
  } else {
    poser(vue.rotation, 1);
  }
  ctx.globalAlpha = 1;
  if (fixe) {
    // Relief : une seule image fixe de plus (ombre, jante, reflet, moyeu, pointeur).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(fixe, 0, 0, cote, cote);
  } else {
    dessinerPointeur(ctx, tailleCss, cote / tailleCss);
  }
}
