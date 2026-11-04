/**
 * Mode projection (F18) : la roue et l'annonce occupent tout l'écran, les contrôles d'édition
 * (panneau, réglages, historique, panneau du chat) sont masqués par `projection.css`.
 *
 * Plein écran par l'API Fullscreen sur `<html>` (l'annonce et les confettis restent visibles) ; si
 * elle manque (iPhone) ou refuse (pas de geste récent, après une commande du chat par exemple),
 * le mode reste en pleine fenêtre CSS. La classe est posée tout de suite : le repli est l'état de
 * départ, le plein écran s'y ajoute s'il est accordé.
 *
 * Sortie : le bouton (toujours visible, `aria-pressed`), Échap, ou `fullscreenchange` quand le
 * navigateur sort seul du plein écran. Échap ferme d'abord l'annonce : cet écouteur est enregistré
 * au démarrage, avant celui de l'annonce (posé à son ouverture), et lit `annonceOuverte()` encore
 * vrai ; il laisse alors l'annonce se fermer. Un second Échap sort du mode. Quand le navigateur
 * garde Échap pour lui (sans Keyboard Lock), c'est `fullscreenchange` qui fait sortir.
 *
 * Le mode n'est pas mémorisé : chaque chargement repart en mode normal.
 */
import type { Actions, ControleProjection } from '../actions';
import { TEXTS } from '../texts';
import { annonceur, creer } from './dom';
import './projection.css';

export type ModeProjection = 'normal' | 'fenetre' | 'plein-ecran';

export interface OptionsProjection {
  readonly actions: Actions;
  /** La page (`.page`), qui reçoit la classe `page--projection`. */
  readonly page: HTMLElement;
  /** Où placer le bouton (colonne de la roue). */
  readonly conteneur: HTMLElement;
  readonly annonceOuverte: () => boolean;
}

export interface Projection extends ControleProjection {
  readonly bouton: HTMLButtonElement;
  mode(): ModeProjection;
}

/** Keyboard Lock (Chromium) : garde Échap pour la page en plein écran ; absent ailleurs. */
interface ClavierVerrouillable {
  lock?: (touches: string[]) => Promise<void>;
  unlock?: () => void;
}
const clavier = (): ClavierVerrouillable | undefined =>
  (navigator as Navigator & { keyboard?: ClavierVerrouillable }).keyboard;

const visible = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement && el.isConnected && el.getClientRects().length > 0;

export function creerProjection(options: OptionsProjection): Projection {
  const { actions, page } = options;
  const racine = creer('div', 'projection', options.conteneur);
  const bouton = creer('button', 'panneau__bouton projection__bouton', racine);
  bouton.type = 'button';
  bouton.textContent = TEXTS.projection.bouton;
  bouton.setAttribute('aria-pressed', 'false');
  const statut = creer('p', 'visuellement-cache', racine);
  statut.setAttribute('role', 'status');
  const annoncer = annonceur(statut);

  let mode: ModeProjection = 'normal';
  let origine: HTMLElement | null = null;

  function appliquer(): void {
    const actif = mode !== 'normal';
    page.classList.toggle('page--projection', actif);
    document.documentElement.classList.toggle('projection', actif);
    if (actif) page.dataset['projection'] = mode;
    else delete page.dataset['projection'];
    bouton.setAttribute('aria-pressed', String(actif));
  }

  function pleinEcran(): void {
    const html = document.documentElement;
    if (typeof html.requestFullscreen !== 'function' || document.fullscreenEnabled === false) return;
    let demande: Promise<void>;
    try {
      demande = html.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      return;
    }
    Promise.resolve(demande).then(
      () => {
        // Sorti entre-temps : on rend le plein écran aussitôt.
        if (mode === 'normal') {
          quitterPleinEcran();
          return;
        }
        mode = 'plein-ecran';
        appliquer();
        clavier()
          ?.lock?.(['Escape'])
          .catch(() => undefined);
      },
      () => undefined,
    );
  }

  function quitterPleinEcran(): void {
    clavier()?.unlock?.();
    if (!document.fullscreenElement || typeof document.exitFullscreen !== 'function') return;
    document.exitFullscreen().catch(() => undefined);
  }

  function entrer(): void {
    const actif = document.activeElement;
    origine = actif instanceof HTMLElement && actif !== document.body ? actif : null;
    mode = 'fenetre';
    appliquer();
    // Le focus ne se perd pas sur un contrôle masqué (la saisie du chat, par exemple).
    if (!visible(origine)) bouton.focus();
    annoncer(TEXTS.projection.statut(true));
    pleinEcran();
  }

  function sortir(): void {
    mode = 'normal';
    appliquer();
    quitterPleinEcran();
    const actif = document.activeElement;
    const perdu = actif === null || actif === document.body || actif === bouton;
    if (perdu && origine !== null && origine !== bouton && visible(origine)) origine.focus();
    origine = null;
    annoncer(TEXTS.projection.statut(false));
  }

  function definir(actif: boolean): void {
    if (actif === (mode !== 'normal')) return;
    if (actif) entrer();
    else sortir();
  }

  bouton.addEventListener('click', () => {
    void actions.executer('modeProjection', { actif: mode === 'normal' });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || mode === 'normal') return;
    // L'annonce reçoit la même touche après cet écouteur et se ferme : on ne sort pas encore.
    if (options.annonceOuverte()) return;
    e.preventDefault();
    void actions.executer('modeProjection', { actif: false });
  });

  document.addEventListener('fullscreenchange', () => {
    if (mode === 'plein-ecran' && !document.fullscreenElement) {
      void actions.executer('modeProjection', { actif: false });
    }
  });

  return {
    bouton,
    mode: () => mode,
    active: () => mode !== 'normal',
    definir,
  };
}
