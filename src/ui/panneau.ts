/**
 * Panneau des participants (F1 à F4, F8). Tout passe par la table d'actions ; rien n'est rendu en
 * HTML : les noms n'atteignent le DOM que par `value`, `textContent` ou des attributs (N2).
 * La liste est mise à jour ligne par ligne (clé = id du participant) : une frappe ou un ajout ne
 * reconstruit jamais les 1 000 lignes, et le focus reste dans sa ligne.
 */
import type { Actions, NomAction, ParametresActions, Resultat } from '../actions';
import type { Etat, Participant } from '../domain/etat';
import { compterDoublons, compterTronques, estTronque } from '../domain/normalisation';
import { couleursParDefaut, couleurTexte } from '../domain/palette';
import { TEXTS } from '../texts';
import type { Roue } from './roue';
import './panneau.css';

interface Ligne {
  readonly el: HTMLLIElement;
  readonly nom: HTMLInputElement;
  readonly couleur: HTMLInputElement;
  readonly defaut: HTMLButtonElement;
  readonly supprimer: HTMLButtonElement;
  participant: Participant | null;
  rang: number;
  hex: string;
}

type RoueVerrou = Pick<Roue, 'ecouter' | 'enRotation'>;

function creer<K extends keyof HTMLElementTagNameMap>(
  balise: K,
  classe: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(balise);
  el.className = classe;
  parent?.append(el);
  return el;
}

function champ(classe: string, parent: HTMLElement): HTMLInputElement {
  const el = creer('input', classe, parent);
  el.type = 'text';
  el.autocomplete = 'off';
  el.spellcheck = false;
  return el;
}

function bouton(classe: string, texte: string, parent: HTMLElement): HTMLButtonElement {
  const el = creer('button', `panneau__bouton ${classe}`.trim(), parent);
  el.type = 'button';
  el.textContent = texte;
  return el;
}

function etiquette(texte: string, idCible: string, parent: HTMLElement): void {
  const el = creer('label', 'panneau__etiquette', parent);
  el.htmlFor = idCible;
  el.textContent = texte;
}

let compteurId = 0;
const idUnique = (base: string): string => `${base}-${String((compteurId += 1))}`;

export interface Panneau {
  /**
   * Valide le renommage en cours de saisie. À appeler avant un lancement : au toucher, la rotation
   * part au `pointerup`, avant le `mousedown` de compatibilité qui fait sortir du champ.
   */
  validerSaisie(): void;
}

export function creerPanneau(conteneur: HTMLElement, actions: Actions, roue: RoueVerrou): Panneau {
  const racine = creer('section', 'panneau', conteneur);
  const titre = creer('h2', 'panneau__titre', racine);
  titre.id = idUnique('panneau-titre');
  titre.textContent = TEXTS.panneauTitre;
  racine.setAttribute('aria-labelledby', titre.id);

  // --- Ajout d'un nom (F1) ---
  const formAjout = creer('form', 'panneau__formulaire', racine);
  const idAjout = idUnique('ajout');
  etiquette(TEXTS.ajoutLibelle, idAjout, formAjout);
  const rangee = creer('div', 'panneau__rangee', formAjout);
  const champAjout = champ('panneau__champ', rangee);
  champAjout.id = idAjout;
  const boutonAjout = bouton('', TEXTS.ajoutBouton, rangee);
  boutonAjout.type = 'submit';
  const aideLongueur = creer('p', 'panneau__aide', formAjout);
  aideLongueur.id = idUnique('aide-longueur');
  aideLongueur.textContent = TEXTS.longueurMax;
  champAjout.setAttribute('aria-describedby', aideLongueur.id);

  // --- Collage d'une liste (F1) ---
  const formCollage = creer('form', 'panneau__formulaire', racine);
  const idCollage = idUnique('collage');
  etiquette(TEXTS.collageLibelle, idCollage, formCollage);
  const aideCollage = creer('p', 'panneau__aide', formCollage);
  aideCollage.id = idUnique('aide-collage');
  aideCollage.textContent = TEXTS.collageAide;
  const zone = creer('textarea', 'panneau__texte', formCollage);
  zone.id = idCollage;
  zone.spellcheck = false;
  zone.rows = 4;
  zone.setAttribute('aria-describedby', aideCollage.id);
  const boutonCollage = bouton('', TEXTS.collageBouton, formCollage);
  boutonCollage.type = 'submit';

  // --- Compteur, doublons, statut ---
  const compteur = creer('p', 'panneau__compteur', racine);
  const doublons = creer('p', 'panneau__doublons', racine);
  doublons.hidden = true;
  const statut = creer('p', 'panneau__statut', racine);
  statut.setAttribute('role', 'status');

  // --- Liste et couleurs (F4) ---
  const boutonCouleurs = bouton('', TEXTS.couleursTout, racine);
  const vide = creer('p', 'panneau__vide', racine);
  vide.textContent = TEXTS.listeVide;
  const liste = creer('ul', 'panneau__liste', racine);
  liste.setAttribute('role', 'list');
  liste.setAttribute('aria-label', TEXTS.listeLibelle);

  const lignes = new Map<string, Ligne>();
  let verrouille = false;
  let minuteurStatut = 0;

  /** Message du statut, relu même s'il est identique au précédent. */
  function annoncer(message: string, immediat = false): void {
    window.clearTimeout(minuteurStatut);
    if (immediat) {
      statut.textContent = message;
      return;
    }
    statut.textContent = '';
    minuteurStatut = window.setTimeout(() => {
      statut.textContent = message;
    }, 30);
  }

  /** Exécute une action ; en cas de refus, explique pourquoi. */
  function executer<N extends NomAction>(nom: N, params: ParametresActions[N]): Resultat {
    const r = actions.executer(nom, params);
    if (!r.ok) annoncer(TEXTS.refus[r.code]);
    return r;
  }

  // --- Lignes ---
  function creerLigne(): Ligne {
    const el = creer('li', 'ligne');
    const nom = champ('ligne__nom', el);
    const couleur = creer('input', 'ligne__couleur', el);
    couleur.type = 'color';
    const defaut = bouton('ligne__defaut', '↺', el);
    const supprimer = bouton('ligne__supprimer', '✕', el);
    if (verrouille) verrouillerLigne(nom, couleur, defaut, supprimer, true);
    return { el, nom, couleur, defaut, supprimer, participant: null, rang: -1, hex: '' };
  }

  function majLigne(ligne: Ligne, p: Participant, rang: number, hex: string): void {
    const precedent = ligne.participant;
    ligne.participant = p;
    if (precedent?.nom !== p.nom) {
      if (ligne.nom.value !== p.nom) ligne.nom.value = p.nom;
      ligne.couleur.setAttribute('aria-label', TEXTS.couleurLibelle(p.nom));
      ligne.defaut.setAttribute('aria-label', TEXTS.couleurDefautLibelle(p.nom));
      ligne.defaut.title = TEXTS.couleurDefautLibelle(p.nom);
      ligne.supprimer.setAttribute('aria-label', TEXTS.supprimerLibelle(p.nom));
      ligne.supprimer.title = TEXTS.supprimerLibelle(p.nom);
    }
    if (ligne.rang !== rang) {
      ligne.rang = rang;
      ligne.nom.setAttribute('aria-label', TEXTS.nomLibelle(rang + 1));
    }
    if (ligne.hex !== hex) {
      ligne.hex = hex;
      ligne.couleur.value = hex;
      ligne.nom.style.backgroundColor = hex;
      ligne.nom.style.color = couleurTexte(hex);
    }
    ligne.el.dataset['id'] = p.id;
    ligne.defaut.hidden = p.couleur === null;
  }

  function synchroniser(etat: Etat, precedent: Etat | null): void {
    const ps = etat.participants;
    if (precedent?.participants !== ps) {
      const ids = new Set(ps.map((p) => p.id));
      // Retirer d'abord les lignes disparues : une suppression ne déplace alors aucune autre ligne.
      for (const [id, ligne] of lignes) {
        if (!ids.has(id)) {
          ligne.el.remove();
          lignes.delete(id);
        }
      }
      const defauts = couleursParDefaut(ps.length);
      let curseur = liste.firstElementChild;
      ps.forEach((p, i) => {
        let ligne = lignes.get(p.id);
        if (!ligne) {
          ligne = creerLigne();
          lignes.set(p.id, ligne);
        }
        if (ligne.el === curseur) curseur = curseur.nextElementSibling;
        else liste.insertBefore(ligne.el, curseur);
        majLigne(ligne, p, i, p.couleur ?? (defauts[i] as string));
      });
    }
    compteur.textContent = TEXTS.compteur(ps.length);
    vide.hidden = ps.length > 0;
    const nbDoublons = compterDoublons(ps.map((p) => p.nom));
    doublons.hidden = nbDoublons === 0;
    if (nbDoublons > 0) doublons.textContent = TEXTS.doublons(nbDoublons);
  }

  // --- Verrou F8 ---
  function verrouillerLigne(
    nom: HTMLInputElement,
    couleur: HTMLInputElement,
    defaut: HTMLButtonElement,
    supprimer: HTMLButtonElement,
    v: boolean,
  ): void {
    nom.readOnly = v;
    nom.setAttribute('aria-disabled', String(v));
    for (const b of [couleur, defaut, supprimer]) b.setAttribute('aria-disabled', String(v));
  }

  /**
   * Ni `disabled` ni `fieldset disabled` : ils feraient perdre le focus à un champ actif. Les
   * champs passent en lecture seule, les boutons en `aria-disabled` ; l'action refuse de toute façon.
   */
  function appliquerVerrou(v: boolean): void {
    if (verrouille === v) return;
    verrouille = v;
    racine.dataset['verrou'] = String(v);
    for (const c of [champAjout, zone]) {
      c.readOnly = v;
      c.setAttribute('aria-disabled', String(v));
    }
    for (const b of [boutonAjout, boutonCollage, boutonCouleurs]) b.setAttribute('aria-disabled', String(v));
    for (const l of lignes.values()) verrouillerLigne(l.nom, l.couleur, l.defaut, l.supprimer, v);
    annoncer(v ? TEXTS.statutVerrou : TEXTS.statutDeverrou, true);
  }

  roue.ecouter('debut', () => {
    appliquerVerrou(true);
  });
  roue.ecouter('fin', () => {
    appliquerVerrou(roue.enRotation);
  });

  // --- Interactions ---
  const ligneDe = (cible: EventTarget | null): Ligne | null => {
    const id = (cible as HTMLElement | null)?.closest<HTMLElement>('li.ligne')?.dataset['id'];
    return id === undefined ? null : (lignes.get(id) ?? null);
  };

  /** Phrase d'état après un ajout : nombre ajouté, et noms raccourcis s'il y en a. */
  function messageAjout(avant: number, apres: number, tronques: number): string {
    const base = TEXTS.statutAjoute(apres - avant);
    return tronques > 0 ? `${base} ${TEXTS.statutTronques(tronques)}` : base;
  }

  formAjout.addEventListener('submit', (e) => {
    e.preventDefault();
    const avant = actions.magasin.lire().participants.length;
    const saisie = champAjout.value;
    if (!executer('ajouter', { nom: saisie }).ok) return;
    champAjout.value = '';
    annoncer(messageAjout(avant, actions.magasin.lire().participants.length, estTronque(saisie) ? 1 : 0));
    champAjout.focus();
  });

  formCollage.addEventListener('submit', (e) => {
    e.preventDefault();
    const avant = actions.magasin.lire().participants.length;
    const texte = zone.value;
    if (!executer('coller', { texte }).ok) return;
    zone.value = '';
    annoncer(messageAjout(avant, actions.magasin.lire().participants.length, compterTronques(texte)));
  });

  boutonCouleurs.addEventListener('click', () => {
    if (executer('reinitialiserCouleurs', {}).ok) annoncer(TEXTS.statutCouleurs);
  });

  /** Valide le champ d'une ligne : il montre ensuite le nom retenu, normalisé ou rétabli. */
  function validerRenommage(ligne: Ligne): void {
    const avant = ligne.participant;
    const saisie = ligne.nom.value;
    // Déjà validé (`validerSaisie` avant le lancement, puis sortie du champ) : pas de refus à annoncer.
    if (!avant || saisie === avant.nom) return;
    const r = executer('renommer', { id: avant.id, nom: saisie });
    if (r.ok) annoncer(estTronque(saisie) ? TEXTS.statutTronques(1) : TEXTS.statutRenomme);
    ligne.nom.value = (ligne.participant ?? avant).nom;
  }

  /** Renommage validé (sortie du champ ou Entrée) : un seul recalcul, pas un par frappe. */
  liste.addEventListener('change', (e) => {
    const ligne = ligneDe(e.target);
    if (ligne && e.target === ligne.nom) validerRenommage(ligne);
  });

  liste.addEventListener('keydown', (e) => {
    const ligne = ligneDe(e.target);
    if (!ligne?.participant || e.target !== ligne.nom) return;
    if (e.key === 'Escape') ligne.nom.value = ligne.participant.nom;
  });

  liste.addEventListener('input', (e) => {
    const ligne = ligneDe(e.target);
    if (!ligne?.participant || e.target !== ligne.couleur) return;
    const r = executer('definirCouleur', { id: ligne.participant.id, couleur: ligne.couleur.value });
    // Refus : le sélecteur revient à la couleur affichée.
    if (!r.ok) ligne.couleur.value = ligne.hex;
  });

  liste.addEventListener('click', (e) => {
    const ligne = ligneDe(e.target);
    if (!ligne?.participant) return;
    const cible = e.target as HTMLElement;
    if (cible === ligne.couleur) {
      // Verrouillé : le sélecteur natif ne s'ouvre pas.
      if (verrouille) {
        e.preventDefault();
        annoncer(TEXTS.refus['rotation-en-cours']);
      }
      return;
    }
    const { id, nom } = ligne.participant;
    if (cible === ligne.defaut) {
      if (executer('reinitialiserCouleur', { id }).ok) ligne.couleur.focus();
    } else if (cible === ligne.supprimer) {
      const voisine = ligne.el.nextElementSibling ?? ligne.el.previousElementSibling;
      if (!executer('supprimer', { id }).ok) return;
      annoncer(TEXTS.statutSupprime(nom));
      const prochain = voisine instanceof HTMLElement ? ligneDe(voisine) : null;
      (prochain?.nom ?? champAjout).focus();
    }
  });

  // Les boutons `aria-disabled` restent cliquables : un clic pendant le verrou est expliqué.
  for (const b of [boutonAjout, boutonCollage, boutonCouleurs]) {
    b.addEventListener('click', (e) => {
      if (verrouille) {
        e.preventDefault();
        annoncer(TEXTS.refus['rotation-en-cours']);
      }
    });
  }

  actions.magasin.abonner((etat, precedent) => {
    synchroniser(etat, precedent);
  });
  synchroniser(actions.magasin.lire(), null);
  appliquerVerrou(roue.enRotation);

  return {
    validerSaisie() {
      const ligne = ligneDe(document.activeElement);
      if (ligne && document.activeElement === ligne.nom) validerRenommage(ligne);
    },
  };
}
