/**
 * Annonce du résultat (F9). Boîte modale créée à l'arrêt de la roue et retirée du DOM à la
 * fermeture : elle n'existe pas pendant la rotation. Le résultat est lu par une région `aria-live`
 * permanente (hors de la zone rendue inerte). Le focus entre dans la boîte, y reste, et revient à
 * l'élément qui l'avait avant la rotation (ou, à défaut, au bouton de lancement).
 *
 * Point d'appel de la 3.2 (fanfare, confettis) : l'option `celebration`, appelée une fois à
 * l'ouverture, avec le contenu de l'annonce et le réglage de mouvement réduit.
 *
 * Échap ferme l'annonce sans arrêter la propagation ni empêcher l'action par défaut : la sortie du
 * mode projection (3.3) reçoit aussi la touche et lit `annonce.ouverte` (encore vrai à ce moment,
 * l'écouteur de la 3.3 étant enregistré avant celui-ci) pour ne fermer que l'annonce.
 */
import type { Actions, ControleAnnonce, InfoAnnonce } from '../actions';
import { couleurTexte } from '../domain/palette';
import { TEXTS } from '../texts';
import { creer, idUnique } from './dom';
import './annonce.css';

export interface OptionsAnnonce {
  readonly actions: Actions;
  /** Zone rendue inerte tant que l'annonce est ouverte (la page). */
  readonly arriere: HTMLElement;
  /** Où rendre le focus quand l'élément d'origine a disparu. */
  readonly focusParDefaut: () => HTMLElement;
  /** Appelé avant « Relancer » : valide la saisie en cours (voir `Panneau.validerSaisie`). */
  readonly avantLancement: () => void;
  /** Crochet de la 3.2 : fanfare et confettis. Absent en 2.3. */
  readonly celebration?: (info: InfoAnnonce, mouvementReduit: boolean) => void;
}

export interface Annonce extends ControleAnnonce {
  /** Texte lu par le lecteur d'écran sans rien afficher (refus d'un lancement, par exemple). */
  dire(message: string): void;
  readonly boite: HTMLElement | null;
}

const FOCALISABLES = 'button:not([disabled])';

export function creerAnnonce(conteneur: HTMLElement, options: OptionsAnnonce): Annonce {
  const { actions, arriere } = options;
  const live = creer('p', 'annonce-live visuellement-cache', conteneur);
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');

  let fond: HTMLElement | null = null;
  let boite: HTMLElement | null = null;
  let origine: HTMLElement | null = null;
  let minuteur = 0;

  function dire(message: string): void {
    window.clearTimeout(minuteur);
    live.textContent = '';
    minuteur = window.setTimeout(() => {
      live.textContent = message;
    }, 30);
  }

  const boutons = (): HTMLButtonElement[] =>
    boite ? [...boite.querySelectorAll<HTMLButtonElement>(FOCALISABLES)] : [];

  function surClavier(e: KeyboardEvent): void {
    if (!boite) return;
    if (e.key === 'Escape') {
      void actions.executer('fermerAnnonce', {});
      return;
    }
    if (e.key !== 'Tab') return;
    const liste = boutons();
    const premier = liste[0];
    const dernier = liste[liste.length - 1];
    if (!premier || !dernier) return;
    const actif = document.activeElement;
    if (e.shiftKey && (actif === premier || actif === boite)) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && actif === dernier) {
      e.preventDefault();
      premier.focus();
    }
  }

  /** Filet si `inert` est ignoré : le focus qui s'échappe revient dans la boîte. */
  function surFocus(e: FocusEvent): void {
    if (boite && e.target instanceof Node && !boite.contains(e.target)) boite.focus();
  }

  function fermer(opt: { restaurerFocus?: boolean } = {}): void {
    if (!fond) return;
    document.removeEventListener('keydown', surClavier);
    document.removeEventListener('focusin', surFocus);
    fond.remove();
    fond = null;
    boite = null;
    arriere.inert = false;
    if (opt.restaurerFocus === false) return;
    const cible = origine?.isConnected ? origine : options.focusParDefaut();
    cible.focus();
    origine = null;
  }

  function ouvrir(info: InfoAnnonce): void {
    fermer({ restaurerFocus: false });
    // Après « Relancer » le focus est perdu : on garde l'origine d'avant la première rotation.
    const actif = document.activeElement;
    if (actif instanceof HTMLElement && actif !== document.body) origine = actif;

    fond = creer('div', 'annonce', conteneur);
    boite = creer('div', 'annonce__boite', fond);
    boite.setAttribute('role', 'dialog');
    boite.setAttribute('aria-modal', 'true');
    boite.tabIndex = -1;
    boite.dataset['ordre'] = String(info.ordre);
    const titre = creer('h2', 'annonce__titre', boite);
    titre.id = idUnique('annonce-titre');
    titre.textContent = TEXTS.annonce.titre(info.ordre);
    boite.setAttribute('aria-labelledby', titre.id);
    creer('p', 'annonce__etiquette', boite).textContent = TEXTS.annonce.etiquette;
    const nom = creer('p', 'annonce__nom', boite);
    nom.textContent = info.nom;
    nom.dataset['couleur'] = info.couleur;
    nom.style.backgroundColor = info.couleur;
    nom.style.color = couleurTexte(info.couleur);
    if (info.cadeau !== null) creer('p', 'annonce__cadeau', boite).textContent = TEXTS.annonce.cadeau(info.cadeau);
    if (info.retraitPrevu) creer('p', 'annonce__note', boite).textContent = TEXTS.annonce.retraitPrevu;

    const raison = actions.relancementInterdit();
    if (raison !== null) creer('p', 'annonce__note', boite).textContent = TEXTS.refus[raison];
    const rangee = creer('div', 'annonce__actions', boite);
    const relancer = creer('button', 'annonce__bouton annonce__bouton--principal', rangee);
    relancer.type = 'button';
    relancer.textContent = TEXTS.annonce.relancer;
    relancer.setAttribute('aria-disabled', String(raison !== null));
    const fermerBouton = creer('button', 'annonce__bouton', rangee);
    fermerBouton.type = 'button';
    fermerBouton.textContent = TEXTS.annonce.fermer;

    relancer.addEventListener('click', () => {
      if (relancer.getAttribute('aria-disabled') === 'true') return;
      options.avantLancement();
      const r = actions.executer('relancer', {});
      if (!r.ok) dire(TEXTS.refus[r.code]);
    });
    fermerBouton.addEventListener('click', () => {
      void actions.executer('fermerAnnonce', {});
    });

    arriere.inert = true;
    document.addEventListener('keydown', surClavier);
    document.addEventListener('focusin', surFocus);
    boite.focus();
    dire(TEXTS.annonce.live(info.nom, info.cadeau));
    options.celebration?.(info, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  return {
    ouverte: () => fond !== null,
    ouvrir,
    fermer,
    dire,
    get boite() {
      return boite;
    },
  };
}
