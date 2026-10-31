/**
 * Cadeaux (F11, F12) : saisie comme les noms, liste ordonnée, phrase « Cadeau n° 3 sur 8 : la bougie »
 * avant le lancement, attribution sans rotation (F19) et récapitulatif à l'épuisement. Sans cadeau,
 * rien n'apparaît dans la zone de la roue. Tout passe par la table d'actions ; tout est en texte (N2).
 * Ce module explique aussi à la roue pourquoi le lancement est impossible (cadeaux épuisés, plus de noms).
 */
import type { Actions, NomAction, ParametresActions, Resultat } from '../actions';
import { cadeauxEpuises, libelleCadeau, attributionSansRotationPossible, type Etat } from '../domain/etat';
import { estTronque } from '../domain/normalisation';
import { TEXTS } from '../texts';
import { annonceur, bouton, champ, creer, etiquette, idUnique } from './dom';
import type { Roue } from './roue';
import './panneau.css';
import './carte.css';
import './cadeaux.css';

type RoueCadeaux = Pick<Roue, 'ecouter' | 'enRotation' | 'definirExplication' | 'bouton'>;

interface LigneCadeau {
  readonly el: HTMLLIElement;
  readonly etat: HTMLSpanElement;
  readonly nom: HTMLInputElement;
  readonly supprimer: HTMLButtonElement;
  valeur: string | null;
}

export interface ZonesCadeaux {
  /** Colonne du panneau (saisie et liste). */
  readonly panneau: HTMLElement;
  /** Colonne de la roue (récapitulatif, sous la roue). */
  readonly roue: HTMLElement;
  /** Racine de la page, pour réserver la place de la phrase dans la hauteur de la roue. */
  readonly page: HTMLElement;
}

export function creerCadeaux(zones: ZonesCadeaux, actions: Actions, roue: RoueCadeaux): void {
  const racine = creer('section', 'carte cadeaux', zones.panneau);
  const titre = creer('h2', 'panneau__titre', racine);
  titre.id = idUnique('cadeaux-titre');
  titre.textContent = TEXTS.cadeaux.titre;
  racine.setAttribute('aria-labelledby', titre.id);

  const formAjout = creer('form', 'panneau__formulaire', racine);
  const idAjout = idUnique('cadeau-ajout');
  etiquette(TEXTS.cadeaux.ajoutLibelle, idAjout, formAjout);
  const rangee = creer('div', 'panneau__rangee', formAjout);
  const champAjout = champ('panneau__champ', rangee);
  champAjout.id = idAjout;
  const boutonAjout = bouton('', TEXTS.cadeaux.ajoutBouton, rangee);
  boutonAjout.type = 'submit';

  const formCollage = creer('form', 'panneau__formulaire', racine);
  const idCollage = idUnique('cadeau-collage');
  etiquette(TEXTS.cadeaux.collageLibelle, idCollage, formCollage);
  const aideCollage = creer('p', 'panneau__aide', formCollage);
  aideCollage.id = idUnique('aide-cadeaux');
  aideCollage.textContent = TEXTS.cadeaux.collageAide;
  const zone = creer('textarea', 'panneau__texte', formCollage);
  zone.id = idCollage;
  zone.spellcheck = false;
  zone.rows = 3;
  zone.setAttribute('aria-describedby', aideCollage.id);
  const boutonCollage = bouton('', TEXTS.cadeaux.collageBouton, formCollage);
  boutonCollage.type = 'submit';

  const compteur = creer('p', 'carte__compteur', racine);
  const statut = creer('p', 'carte__statut', racine);
  statut.setAttribute('role', 'status');
  const annoncer = annonceur(statut);
  const vide = creer('p', 'carte__vide', racine);
  vide.textContent = TEXTS.cadeaux.vide;
  const liste = creer('ol', 'cadeaux__liste', racine);
  liste.setAttribute('aria-label', TEXTS.cadeaux.listeLibelle);

  // --- Phrase avant le lancement et attribution sans rotation, juste au-dessus du bouton de la roue ---
  const avant = creer('div', 'cadeaux__avant');
  avant.hidden = true;
  const phrase = creer('p', 'cadeaux__prochain', avant);
  const boutonSansRotation = bouton('cadeaux__sans-rotation', '', avant);
  boutonSansRotation.hidden = true;
  roue.bouton.before(avant);

  // --- Récapitulatif à l'épuisement (F12), sous la roue ---
  const recap = creer('section', 'cadeaux__recap', zones.roue);
  recap.hidden = true;
  const titreRecap = creer('h2', 'cadeaux__recap-titre', recap);
  titreRecap.id = idUnique('recap-titre');
  titreRecap.textContent = TEXTS.cadeaux.recapTitre;
  recap.setAttribute('aria-labelledby', titreRecap.id);
  const listeRecap = creer('ul', 'cadeaux__recap-liste', recap);
  const boutonRecommencer = bouton('', TEXTS.cadeaux.recommencer, recap);

  const lignes: LigneCadeau[] = [];
  let verrouille = false;

  function executer<N extends NomAction>(nom: N, params: ParametresActions[N]): Resultat {
    const r = actions.executer(nom, params);
    if (!r.ok) annoncer(TEXTS.refus[r.code]);
    return r;
  }

  function creerLigne(): LigneCadeau {
    const el = creer('li', 'cadeau', liste);
    const etat = creer('span', 'cadeau__etat', el);
    const nom = champ('cadeau__nom', el);
    const supprimer = bouton('ligne__supprimer', '✕', el);
    if (verrouille) verrouillerLigne(nom, supprimer, true);
    return { el, etat, nom, supprimer, valeur: null };
  }

  function verrouillerLigne(nom: HTMLInputElement, supprimer: HTMLButtonElement, v: boolean): void {
    nom.readOnly = v;
    nom.setAttribute('aria-disabled', String(v));
    supprimer.setAttribute('aria-disabled', String(v));
  }

  function synchroniserListe(etat: Etat): void {
    while (lignes.length > etat.cadeaux.length) lignes.pop()?.el.remove();
    etat.cadeaux.forEach((nom, i) => {
      let ligne = lignes[i];
      if (!ligne) {
        ligne = creerLigne();
        lignes.push(ligne);
      }
      if (ligne.valeur !== nom) {
        ligne.valeur = nom;
        if (ligne.nom.value !== nom) ligne.nom.value = nom;
        ligne.supprimer.setAttribute('aria-label', TEXTS.cadeaux.supprimerLibelle(nom));
        ligne.supprimer.title = TEXTS.cadeaux.supprimerLibelle(nom);
      }
      ligne.nom.setAttribute('aria-label', TEXTS.cadeaux.libelleLigne(i + 1));
      const attribue = i < etat.attribues;
      ligne.etat.textContent = attribue ? TEXTS.cadeaux.attribue : i === etat.attribues ? TEXTS.cadeaux.prochain : '';
      ligne.el.dataset['attribue'] = String(attribue);
    });
  }

  function synchroniserRecap(etat: Etat): void {
    const epuise = cadeauxEpuises(etat);
    recap.hidden = !epuise;
    if (!epuise) return;
    const lignesRecap = etat.historique
      .filter((t) => t.cadeau !== null && !t.cadeauSupprime)
      .slice(-etat.attribues);
    listeRecap.replaceChildren(
      ...lignesRecap.map((t) => {
        const li = document.createElement('li');
        li.textContent = TEXTS.cadeaux.recapLigne(t.cadeau ?? '', t.nom);
        return li;
      }),
    );
  }

  /** Dit à la roue pourquoi elle ne peut pas tourner (F12, F19), au lieu d'un refus muet. */
  function expliquerLancement(etat: Etat): void {
    if (cadeauxEpuises(etat)) {
      roue.definirExplication(TEXTS.cadeaux.indiceEpuises, true);
    } else if (etat.participants.length < 2 && etat.historique.some((t) => t.retrait !== null)) {
      roue.definirExplication(TEXTS.cadeaux.indicePlusDeNoms, true);
    } else {
      roue.definirExplication(null);
    }
  }

  function synchroniser(etat: Etat): void {
    synchroniserListe(etat);
    synchroniserRecap(etat);
    expliquerLancement(etat);
    const prochain = libelleCadeau(etat);
    const aDesCadeaux = etat.cadeaux.length > 0;
    vide.hidden = aDesCadeaux;
    compteur.hidden = !aDesCadeaux;
    compteur.textContent = TEXTS.cadeaux.compteur(Math.min(etat.attribues, etat.cadeaux.length), etat.cadeaux.length);
    phrase.hidden = prochain === null;
    if (prochain) phrase.textContent = TEXTS.cadeaux.prochainPhrase(prochain.numero, prochain.total, prochain.nom);
    const seul = etat.participants[0];
    const sansRotation = attributionSansRotationPossible(etat) && seul !== undefined;
    boutonSansRotation.hidden = !sansRotation;
    if (sansRotation) boutonSansRotation.textContent = TEXTS.cadeaux.sansRotation(seul.nom);
    avant.hidden = prochain === null;
    zones.page.classList.toggle('page--cadeaux', prochain !== null);
  }

  function appliquerVerrou(v: boolean): void {
    verrouille = v;
    racine.dataset['verrou'] = String(v);
    for (const c of [champAjout, zone]) {
      c.readOnly = v;
      c.setAttribute('aria-disabled', String(v));
    }
    for (const b of [boutonAjout, boutonCollage, boutonRecommencer, boutonSansRotation]) {
      b.setAttribute('aria-disabled', String(v));
    }
    for (const l of lignes) verrouillerLigne(l.nom, l.supprimer, v);
  }

  roue.ecouter('debut', () => {
    appliquerVerrou(true);
  });
  roue.ecouter('fin', () => {
    appliquerVerrou(roue.enRotation);
  });

  // --- Interactions ---
  formAjout.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!executer('ajouterCadeau', { nom: champAjout.value }).ok) return;
    const tronque = estTronque(champAjout.value);
    champAjout.value = '';
    annoncer(`${TEXTS.cadeaux.statutAjoute(1)}${tronque ? ` ${TEXTS.statutTronques(1)}` : ''}`);
    champAjout.focus();
  });

  formCollage.addEventListener('submit', (e) => {
    e.preventDefault();
    const avantNb = actions.magasin.lire().cadeaux.length;
    if (!executer('collerCadeaux', { texte: zone.value }).ok) return;
    zone.value = '';
    annoncer(TEXTS.cadeaux.statutAjoute(actions.magasin.lire().cadeaux.length - avantNb));
  });

  const rang = (cible: EventTarget | null): number => {
    const li = (cible as HTMLElement | null)?.closest('li.cadeau');
    return li ? lignes.findIndex((l) => l.el === li) : -1;
  };

  function validerRenommage(i: number): void {
    const ligne = lignes[i];
    if (!ligne?.valeur) return;
    const saisie = ligne.nom.value;
    if (saisie !== ligne.valeur) {
      const r = executer('renommerCadeau', { index: i, nom: saisie });
      if (r.ok) annoncer(estTronque(saisie) ? TEXTS.statutTronques(1) : TEXTS.cadeaux.statutRenomme);
    }
    ligne.nom.value = ligne.valeur;
  }

  liste.addEventListener('change', (e) => {
    const i = rang(e.target);
    if (i >= 0 && e.target === lignes[i]?.nom) validerRenommage(i);
  });
  liste.addEventListener('keydown', (e) => {
    const i = rang(e.target);
    const ligne = lignes[i];
    if (ligne?.valeur && e.target === ligne.nom && e.key === 'Escape') ligne.nom.value = ligne.valeur;
  });
  liste.addEventListener('click', (e) => {
    const i = rang(e.target);
    const ligne = lignes[i];
    if (!ligne?.valeur || e.target !== ligne.supprimer) return;
    const nom = ligne.valeur;
    if (!executer('supprimerCadeau', { index: i }).ok) return;
    annoncer(TEXTS.cadeaux.statutSupprime(nom));
    (lignes[i]?.nom ?? lignes[i - 1]?.nom ?? champAjout).focus();
  });

  for (const b of [boutonAjout, boutonCollage]) {
    b.addEventListener('click', (e) => {
      if (verrouille) {
        e.preventDefault();
        annoncer(TEXTS.refus['rotation-en-cours']);
      }
    });
  }

  boutonRecommencer.addEventListener('click', () => {
    if (!executer('recommencerAttributions', {}).ok) return;
    annoncer(TEXTS.cadeaux.statutRecommence);
    roue.bouton.focus();
  });

  boutonSansRotation.addEventListener('click', () => {
    // L'annonce s'ouvre et prend le focus.
    void executer('attribuerSansRotation', {});
  });

  actions.magasin.abonner((etat) => {
    synchroniser(etat);
  });
  synchroniser(actions.magasin.lire());
  appliquerVerrou(roue.enRotation);
}
