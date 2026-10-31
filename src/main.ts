import { creerActions, creerMagasin } from './actions';
import { retirerDernierGagnant } from './domain/etat';
import { couleursParDefaut } from './domain/palette';
import { creerPersistance } from './domain/persistance';
import { restaurer, sauvegarder } from './domain/sauvegarde';
import { TEXTS } from './texts';
import { creerAnnonce, type Annonce } from './ui/annonce';
import { creerCadeaux } from './ui/cadeaux';
import { creerConfettis } from './ui/confettis';
import { creerDonnees } from './ui/donnees';
import { telechargerExport } from './ui/echange';
import { creerHistorique } from './ui/historique';
import { creerPanneau } from './ui/panneau';
import { creerReglages } from './ui/reglages';
import { creerRoue, type Roue } from './ui/roue';
import { creerSon } from './ui/son';
import './ui/page.css';

export function render(root: HTMLElement): Roue {
  const page = document.createElement('div');
  page.className = 'page';
  const titre = document.createElement('h1');
  titre.className = 'page__titre';
  titre.textContent = TEXTS.title;
  const zoneRoue = document.createElement('div');
  zoneRoue.className = 'page__roue';
  const zonePanneau = document.createElement('div');
  zonePanneau.className = 'page__panneau';
  page.append(titre, zoneRoue, zonePanneau);
  root.append(page);
  const zoneConfettis = document.createElement('div');
  zoneConfettis.className = 'confettis';
  zoneConfettis.setAttribute('aria-hidden', 'true');
  root.append(zoneConfettis);

  // F14 : l'accès à `window.localStorage` peut lever (stockage bloqué) ; la persistance le tolère.
  const persistance = creerPersistance(() => window.localStorage);
  const magasin = creerMagasin(restaurer(persistance) ?? undefined);
  const son = creerSon();
  const confettis = creerConfettis(zoneConfettis);
  son.couper(magasin.lire().sonCoupe);
  // Un contexte audio ne démarre que sur un geste : le premier appui ou la première touche suffit,
  // ce qui couvre aussi l'attribution sans rotation. Le lancement le refait explicitement.
  for (const evenement of ['pointerdown', 'keydown']) {
    document.addEventListener(
      evenement,
      () => {
        son.preparer();
      },
      { capture: true },
    );
  }

  // Roue, panneau et annonce sont créés après la table d'actions, qui ne les lit qu'à l'exécution.
  const actions = creerActions({
    magasin,
    enRotation: () => roue.enRotation,
    lancer: (index) => {
      // Une modification de la même tâche doit atteindre la roue avant le départ, pas à l'arrêt.
      pousserNoms();
      confettis.arreter();
      void roue.lancer(index);
    },
    telecharger: (etat) => {
      telechargerExport(etat, document);
    },
    annonce: {
      ouverte: () => annonce.ouverte(),
      ouvrir: (info) => {
        annonce.ouvrir(info);
      },
      fermer: (options) => {
        confettis.arreter();
        annonce.fermer(options);
      },
    },
  });
  const roue: Roue = creerRoue(zoneRoue, {
    relief: magasin.lire().relief,
    surDemande: () => {
      son.preparer();
      panneau.validerSaisie();
      const r = actions.executer('lancer', {});
      if (!r.ok) annonce.dire(TEXTS.refus[r.code]);
    },
  });
  roue.definirNoms(magasin.lire().participants.map(({ nom, couleur }) => ({ nom, couleur })));

  // Un seul recalcul de la roue par salve de modifications (collage, rafale de couleurs).
  let planifie = false;
  const pousserNoms = (): void => {
    if (!planifie) return;
    planifie = false;
    roue.definirNoms(magasin.lire().participants.map(({ nom, couleur }) => ({ nom, couleur })));
  };
  // Une seule sauvegarde par salve de modifications ; l'avis n'est affiché qu'une fois.
  let sauvegardePlanifiee = false;
  let avise = false;
  const sauver = (): void => {
    sauvegardePlanifiee = false;
    // Annonce ouverte : le retrait du gagnant (F19) est sauvegardé tout de suite, car l'annonce ne l'est pas.
    // Sans effet si l'option est décochée ou le gagnant déjà retiré ; « Annuler » le remet grâce à la trace.
    const etat = annonce.ouverte() ? retirerDernierGagnant(magasin.lire()) : magasin.lire();
    if (!sauvegarder(persistance, etat) && !avise) {
      avise = true;
      donnees.avertirSansSauvegarde();
    }
  };
  magasin.abonner((etat, precedent) => {
    if (etat.relief !== precedent.relief) roue.definirRelief(etat.relief);
    if (etat.sonCoupe !== precedent.sonCoupe) son.couper(etat.sonCoupe);
    if (!sauvegardePlanifiee) {
      sauvegardePlanifiee = true;
      queueMicrotask(sauver);
    }
    // Un tirage ou un cadeau ne change pas la roue : pas de nouveau pré-rendu.
    if (planifie || etat.participants === precedent.participants) return;
    planifie = true;
    queueMicrotask(pousserNoms);
  });

  // Le tirage s'enregistre et l'annonce s'ouvre à l'arrêt, sur l'index de l'événement `fin` : le gagnant
  // annoncé, la ligne d'historique et le secteur sous le pointeur sont le même.
  roue.ecouter('fin', ({ index }) => {
    const r = actions.executer('enregistrerTirage', { index });
    if (!r.ok) annonce.dire(TEXTS.refus[r.code]);
  });
  roue.ecouter('secteur', ({ franchis }) => {
    son.cliquetis(franchis);
  });

  const panneau = creerPanneau(zonePanneau, actions, roue);
  creerReglages(zoneRoue, actions);
  creerCadeaux({ panneau: zonePanneau, roue: zoneRoue, page }, actions, roue);
  creerHistorique(zonePanneau, actions, roue);
  const donnees = creerDonnees(zonePanneau, actions, roue);
  const annonce: Annonce = creerAnnonce(root, {
    actions,
    arriere: page,
    focusParDefaut: () => roue.bouton,
    avantLancement: () => {
      son.preparer();
      panneau.validerSaisie();
    },
    celebration: (_info, mouvementReduit) => {
      son.fanfare();
      if (mouvementReduit) return;
      const { participants } = magasin.lire();
      const defauts = couleursParDefaut(participants.length);
      confettis.lancer(participants.map((p, i) => p.couleur ?? defauts[i] ?? '#ffd166'));
    },
  });
  if (!persistance.fonctionne()) {
    avise = true;
    donnees.avertirSansSauvegarde();
  }
  root.dataset['ready'] = 'true';
  return roue;
}

const root = document.getElementById('app');
if (root) render(root);
