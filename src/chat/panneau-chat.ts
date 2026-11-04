/**
 * Vue du panneau de chat (5.5). Tout texte, y compris les noms et le texte d'un modèle, est rendu
 * par `textContent` (N2) : aucun `innerHTML`, aucun lien fabriqué à partir de ce texte.
 */
import { bouton, champ, creer, idUnique } from '../ui/dom';
import type { Controleur } from './controleur';
import type { FenetreInspection } from './fenetre-inspection';
import type { Micro } from './micro';
import { ecrireReglages, type ReglagesChat } from './reglages-chat';
import type { ClientStt } from './stt';
import { TEXTES_CHAT } from './textes';
import { RACCOURCI_INSPECTION, TEXTES_INSPECTION } from './textes-inspection';
import { creerVoix, type Transcription, type Voix } from './voix';
import './panneau-chat.css';

export interface OptionsPanneauChat {
  readonly controleur: Controleur;
  readonly reglages: ReglagesChat;
  /** Appelé quand un réglage change (le stockage est écrit ici, dans un try/catch). */
  readonly surReglages: (reglages: ReglagesChat) => void;
  readonly stockage: () => Pick<Storage, 'getItem' | 'setItem'>;
  /** Ouvert au départ (écran large). */
  readonly ouvert?: boolean;
  /** Fenêtre d'inspection (5.7) ; sans elle, pas de bouton. */
  readonly inspection?: Pick<FenetreInspection, 'ouvrir'>;
  /** Voix (6.2) : micro, STT et prénoms de la liste (indice). Sans elle, pas de bouton « Parler ». */
  readonly voix?: {
    readonly micro: Micro;
    readonly stt: ClientStt;
    readonly indices: () => readonly string[];
  };
}

export function creerPanneauChat(parent: HTMLElement, options: OptionsPanneauChat): HTMLElement {
  const { controleur } = options;
  const racine = creer('section', 'chat', parent);
  const idTitre = idUnique('chat-titre');
  const idCorps = idUnique('chat-corps');
  racine.setAttribute('aria-labelledby', idTitre);

  const entete = creer('h2', 'chat__titre', racine);
  entete.id = idTitre;
  const bascule = bouton('chat__bascule', '', entete);
  bascule.setAttribute('aria-controls', idCorps);

  const corps = creer('div', 'chat__corps', racine);
  corps.id = idCorps;

  const avis = creer('p', 'chat__avis', corps);
  avis.setAttribute('role', 'note');
  avis.hidden = true;

  const fil = creer('ol', 'chat__fil', corps);
  fil.setAttribute('role', 'log');
  fil.setAttribute('aria-live', 'polite');
  fil.setAttribute('aria-label', TEXTES_CHAT.filLibelle);
  fil.tabIndex = 0;

  const etat = creer('p', 'chat__etat', corps);
  etat.setAttribute('role', 'status');

  const attenteZone = creer('div', 'chat__attente', corps);
  attenteZone.hidden = true;

  const formulaire = creer('form', 'chat__formulaire', corps);
  const idSaisie = idUnique('chat-saisie');
  const etiquette = creer('label', 'panneau__etiquette chat__etiquette', formulaire);
  etiquette.htmlFor = idSaisie;
  etiquette.textContent = TEXTES_CHAT.saisieLibelle;
  const rangee = creer('div', 'chat__rangee', formulaire);
  const saisie = champ('panneau__champ chat__saisie', rangee);
  saisie.id = idSaisie;
  saisie.placeholder = TEXTES_CHAT.saisieAide;
  const envoyer = bouton('chat__envoyer', TEXTES_CHAT.envoyer, rangee);
  envoyer.type = 'submit';
  let parler: HTMLButtonElement | null = null;
  let voixEtat: HTMLElement | null = null;
  if (options.voix !== undefined) {
    parler = bouton('chat__parler', TEXTES_CHAT.parler, rangee);
    parler.title = TEXTES_CHAT.parlerAide;
    parler.setAttribute('aria-pressed', 'false');
    voixEtat = creer('p', 'chat__voix', formulaire);
    voixEtat.setAttribute('role', 'status');
    voixEtat.hidden = true;
  }
  /** Transcription dans le champ, en attente d'envoi : sa trace part avec la commande (inspection). */
  let dictee: Transcription | null = null;
  let voix: Voix | null = null;
  // Champ vidé : la dictée est abandonnée, sa trace ne suit pas une commande tapée ensuite (une correction la garde).
  saisie.addEventListener('input', () => {
    if (saisie.value.trim() === '') dictee = null;
  });

  const details = creer('details', 'chat__reglages', corps);
  const resume = creer('summary', 'chat__reglages-titre', details);
  resume.textContent = TEXTES_CHAT.reglagesTitre;
  let courants = options.reglages;
  const champReglage = (libelle: string, valeur: string, maj: (v: string) => ReglagesChat): void => {
    const id = idUnique('chat-reglage');
    const ligne = creer('div', 'chat__reglage', details);
    const lbl = creer('label', 'panneau__etiquette', ligne);
    lbl.htmlFor = id;
    lbl.textContent = libelle;
    const c = champ('panneau__champ', ligne);
    c.id = id;
    c.value = valeur;
    c.addEventListener('change', () => {
      courants = maj(c.value.trim());
      ecrireReglages(options.stockage, courants);
      options.surReglages(courants);
    });
  };
  champReglage(TEXTES_CHAT.reglageSlm, courants.modeleSlm, (v) => ({
    ...courants,
    modeleSlm: v,
  }));
  champReglage(TEXTES_CHAT.reglageDecision, courants.modeleDecision, (v) => ({
    ...courants,
    modeleDecision: v,
  }));
  const aide = creer('p', 'panneau__aide', details);
  aide.textContent = TEXTES_CHAT.reglagesAide;

  if (options.inspection !== undefined) {
    const fenetre = options.inspection;
    const inspecter = bouton('chat__inspecter', TEXTES_INSPECTION.bouton, corps);
    inspecter.title = TEXTES_INSPECTION.boutonAide;
    inspecter.setAttribute('aria-haspopup', 'dialog');
    inspecter.setAttribute('aria-keyshortcuts', RACCOURCI_INSPECTION);
    inspecter.addEventListener('click', () => {
      fenetre.ouvrir(inspecter);
    });
  }

  if (options.voix !== undefined && parler !== null && voixEtat !== null) {
    const { micro, stt, indices } = options.voix;
    const bouteParler = parler;
    const zoneVoix = voixEtat;
    const dire = (texte: string): void => {
      zoneVoix.textContent = texte;
      zoneVoix.hidden = texte === '';
    };
    voix = creerVoix({
      micro,
      stt,
      indices,
      surEtat: (e) => {
        bouteParler.setAttribute('aria-pressed', String(e === 'ecoute'));
        if (e === 'ecoute') dire(TEXTES_CHAT.voixEcoute);
        else if (e === 'transcription') dire(TEXTES_CHAT.voixTranscription);
      },
      surRefus: (message) => {
        dire(message);
      },
      surTranscription: (t) => {
        dictee = t;
        saisie.value = t.texte;
        dire(TEXTES_CHAT.voixPrete);
        saisie.focus();
      },
    });
    const debut = (): void => {
      if (saisie.disabled) return;
      void voix?.demarrer();
    };
    const fin = (): void => {
      voix?.arreter();
    };
    bouteParler.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      bouteParler.focus();
      try {
        bouteParler.setPointerCapture(ev.pointerId);
      } catch {
        // Capture indisponible : pointerleave prend le relais.
      }
      debut();
    });
    for (const nom of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'] as const) bouteParler.addEventListener(nom, fin);
    bouteParler.addEventListener('keydown', (ev) => {
      if (ev.key !== ' ' && ev.key !== 'Enter') return;
      ev.preventDefault();
      if (!ev.repeat) debut();
    });
    bouteParler.addEventListener('keyup', (ev) => {
      if (ev.key !== ' ' && ev.key !== 'Enter') return;
      ev.preventDefault();
      fin();
    });
    bouteParler.addEventListener('blur', fin);
    bouteParler.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
    });
  }

  let rendus = 0;
  let rendreFocus = false;

  const ouvrir = (ouvert: boolean): void => {
    corps.hidden = !ouvert;
    racine.dataset['ouvert'] = String(ouvert);
    bascule.setAttribute('aria-expanded', String(ouvert));
    bascule.textContent = ouvert ? TEXTES_CHAT.basculerFermer : TEXTES_CHAT.basculerOuvrir;
    if (!ouvert) {
      voix?.annuler();
      controleur.fermer();
    }
    ajusterRoue();
  };

  const rendre = (): void => {
    const e = controleur.etat();
    for (const m of e.messages.slice(rendus)) {
      const li = creer('li', `chat__message chat__message--${m.auteur}`, fil);
      const auteur = creer('span', 'chat__auteur', li);
      auteur.textContent = `${m.auteur === 'moi' ? TEXTES_CHAT.auteurMoi : TEXTES_CHAT.auteurChat} : `;
      const texte = creer('span', 'chat__texte', li);
      texte.textContent = m.texte;
    }
    if (e.messages.length !== rendus) fil.scrollTop = fil.scrollHeight;
    rendus = e.messages.length;

    avis.hidden = e.avis === null;
    avis.textContent = e.avis ?? '';
    etat.textContent = e.occupe ? TEXTES_CHAT.reflexion : '';
    saisie.disabled = e.occupe;
    envoyer.disabled = e.occupe;
    envoyer.setAttribute('aria-disabled', String(e.occupe));
    if (parler !== null) {
      parler.disabled = e.occupe;
      parler.setAttribute('aria-disabled', String(e.occupe));
      if (e.occupe) voix?.annuler();
    }

    attenteZone.replaceChildren();
    attenteZone.hidden = e.attente === null;
    let premier: HTMLButtonElement | null = null;
    if (e.attente?.genre === 'clarifier') {
      for (const candidat of e.attente.candidats) {
        const b = bouton('chat__choix', candidat, attenteZone);
        b.addEventListener('click', () => {
          rendreFocus = true;
          controleur.choisir(candidat);
        });
        premier ??= b;
      }
    } else if (e.attente?.genre === 'confirmer') {
      attenteZone.setAttribute('role', 'group');
      attenteZone.setAttribute('aria-label', TEXTES_CHAT.confirmationTitre);
      const titre = creer('p', 'chat__recap-titre', attenteZone);
      titre.textContent = TEXTES_CHAT.confirmationTitre;
      const liste = creer('ul', 'chat__recap', attenteZone);
      for (const ligne of e.attente.recapitulatif) creer('li', 'chat__recap-ligne', liste).textContent = ligne;
      const barre = creer('div', 'chat__recap-barre', attenteZone);
      const ok = bouton('chat__confirmer', TEXTES_CHAT.confirmerBouton, barre);
      ok.addEventListener('click', () => {
        rendreFocus = true;
        controleur.confirmer();
      });
      const non = bouton('chat__annuler', TEXTES_CHAT.annulerBouton, barre);
      non.addEventListener('click', () => {
        rendreFocus = true;
        controleur.annuler();
      });
      premier = non;
    }
    if (e.attente?.genre !== 'confirmer') {
      attenteZone.removeAttribute('role');
      attenteZone.removeAttribute('aria-label');
    }
    if (rendreFocus && !e.occupe) {
      rendreFocus = false;
      (premier ?? saisie).focus();
    }
  };

  formulaire.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const texte = saisie.value;
    if (texte.trim() === '' || saisie.disabled) return;
    saisie.value = '';
    rendreFocus = true;
    const origine = dictee;
    dictee = null;
    if (voixEtat !== null) voixEtat.hidden = true;
    void controleur.envoyer(
      texte,
      origine === null ? undefined : { transcription: { brut: origine.brut, latenceMs: origine.dureeMs } },
    );
  });
  racine.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || corps.hidden) return;
    ouvrir(false);
    bascule.focus();
  });
  bascule.addEventListener('click', () => {
    ouvrir(corps.hidden === true);
    if (!corps.hidden) saisie.focus();
  });

  /**
   * Écran étroit, tiroir ouvert : hauteur libre sous le haut de la roue, mesurée et non estimée.
   * Les polices changent la hauteur de ce qui précède la roue ; seule la mesure évite le recouvrement.
   */
  const etroit = globalThis.matchMedia?.('(max-width: 51.99rem)');
  const ajusterRoue = (): void => {
    const cible = document.documentElement.style;
    const roue = document.querySelector('.page__roue');
    if (!etroit?.matches || racine.dataset['ouvert'] !== 'true' || !roue) {
      cible.removeProperty('--roue-libre');
      cible.removeProperty('--tiroir-max');
      return;
    }
    const poser = (nom: string, valeur: string): void => {
      if (cible.getPropertyValue(nom) !== valeur) cible.setProperty(nom, valeur);
    };
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const haut = roue.getBoundingClientRect().top + window.scrollY;
    // La zone de la roue contient aussi autre chose que le canvas (bandeau, boutons) : on le retranche.
    const boite = roue.getBoundingClientRect().height;
    const toile = roue.querySelector('canvas')?.getBoundingClientRect().height ?? boite;
    const hors = boite - toile;
    // La roue ne descend pas sous 8 rem (roue.css) : si l'espace manque, c'est le tiroir qui cède,
    // jusqu'à un minimum qui garde la saisie visible ; au-delà il défile à l'intérieur.
    const pourTiroir = Math.floor(window.innerHeight - haut - 8 * rem - hors - 8);
    // Plancher : le titre et la rangée « Commande, Envoyer, Parler » entiers (mesurés), jamais moins de 5 rem.
    const style = getComputedStyle(racine);
    const cadre =
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const plancher = entete.offsetHeight + (parseFloat(style.rowGap) || 0) + rangee.offsetHeight + cadre + 2;
    if (pourTiroir < window.innerHeight * 0.35) {
      poser('--tiroir-max', `${String(Math.ceil(Math.max(5 * rem, plancher, pourTiroir)))}px`);
    }
    else cible.removeProperty('--tiroir-max');
    const libre = Math.floor(window.innerHeight - racine.getBoundingClientRect().height - haut - hors - 8);
    poser('--roue-libre', `${String(Math.max(0, libre))}px`);
  };
  if (typeof ResizeObserver !== 'undefined') {
    const observateur = new ResizeObserver(ajusterRoue);
    observateur.observe(racine);
    observateur.observe(document.body);
  }
  window.addEventListener('resize', ajusterRoue);

  controleur.abonner(rendre);
  ouvrir(options.ouvert ?? false);
  rendre();
  ajusterRoue();
  return racine;
}
