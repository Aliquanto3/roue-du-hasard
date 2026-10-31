import { creerActions, creerMagasin } from './actions';
import { TEXTS } from './texts';
import { creerAnnonce, type Annonce } from './ui/annonce';
import { creerCadeaux } from './ui/cadeaux';
import { creerHistorique } from './ui/historique';
import { creerPanneau } from './ui/panneau';
import { creerRoue, type Roue } from './ui/roue';
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

  const magasin = creerMagasin();
  // Roue, panneau et annonce sont créés après la table d'actions, qui ne les lit qu'à l'exécution.
  const actions = creerActions({
    magasin,
    enRotation: () => roue.enRotation,
    lancer: (index) => {
      // Une modification de la même tâche doit atteindre la roue avant le départ, pas à l'arrêt.
      pousserNoms();
      void roue.lancer(index);
    },
    annonce: {
      ouverte: () => annonce.ouverte(),
      ouvrir: (info) => {
        annonce.ouvrir(info);
      },
      fermer: (options) => {
        annonce.fermer(options);
      },
    },
  });
  const roue: Roue = creerRoue(zoneRoue, {
    surDemande: () => {
      panneau.validerSaisie();
      const r = actions.executer('lancer', {});
      if (!r.ok) annonce.dire(TEXTS.refus[r.code]);
    },
  });

  // Un seul recalcul de la roue par salve de modifications (collage, rafale de couleurs).
  let planifie = false;
  const pousserNoms = (): void => {
    if (!planifie) return;
    planifie = false;
    roue.definirNoms(magasin.lire().participants.map(({ nom, couleur }) => ({ nom, couleur })));
  };
  magasin.abonner((etat, precedent) => {
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

  const panneau = creerPanneau(zonePanneau, actions, roue);
  creerCadeaux({ panneau: zonePanneau, roue: zoneRoue, page }, actions, roue);
  creerHistorique(zonePanneau, actions, roue);
  const annonce: Annonce = creerAnnonce(root, {
    actions,
    arriere: page,
    focusParDefaut: () => roue.bouton,
    avantLancement: () => {
      panneau.validerSaisie();
    },
    // 3.2 : brancher ici la fanfare et les confettis (`celebration: (info, mouvementReduit) => …`).
  });
  root.dataset['ready'] = 'true';
  return roue;
}

const root = document.getElementById('app');
if (root) render(root);
