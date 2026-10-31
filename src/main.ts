import { creerActions, creerMagasin } from './actions';
import { TEXTS } from './texts';
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
  // La roue est créée après la table d'actions, qui ne lit `roue` qu'à l'exécution.
  const actions = creerActions({
    magasin,
    enRotation: () => roue.enRotation,
    lancer: (index) => {
      // Une modification de la même tâche doit atteindre la roue avant le départ, pas à l'arrêt.
      pousserNoms();
      void roue.lancer(index);
    },
  });
  const roue: Roue = creerRoue(zoneRoue, {
    surDemande: () => {
      panneau.validerSaisie();
      void actions.executer('lancer', {});
    },
  });

  // Un seul recalcul de la roue par salve de modifications (collage, rafale de couleurs).
  let planifie = false;
  const pousserNoms = (): void => {
    if (!planifie) return;
    planifie = false;
    roue.definirNoms(magasin.lire().participants.map(({ nom, couleur }) => ({ nom, couleur })));
  };
  magasin.abonner(() => {
    if (planifie) return;
    planifie = true;
    queueMicrotask(pousserNoms);
  });

  const panneau = creerPanneau(zonePanneau, actions, roue);
  root.dataset['ready'] = 'true';
  return roue;
}

const root = document.getElementById('app');
if (root) render(root);
