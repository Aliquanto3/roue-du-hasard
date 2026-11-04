// Point d'entrée de l'édition chat (`roue-chat.html`) : l'application de `main.ts`, plus le code du chat.
// `main.ts` rend l'application à son import ; il n'importe rien de `src/chat/`.
import { application } from './main';
import { creerCascade, ETAGES_ENREGISTRES } from './chat/cascade';
import { creerControleur } from './chat/controleur';
import { MARQUEUR_CHAT } from './chat/marqueur';
import { creerFenetreInspection } from './chat/fenetre-inspection';
import { creerInspection } from './chat/inspection';
import { creerPanneauChat } from './chat/panneau-chat';
import { lireReglages, type ReglagesChat } from './chat/reglages-chat';
import type { OptionsEtages } from './chat/types';

type Modifiable<T> = { -readonly [K in keyof T]: T[K] };

// Une seule cascade, créée une fois. Les étages lisent `options` à chaque commande : les réglages la
// modifient en place, sans reconstruire la cascade. Vide, un modèle laisse son étage inactif.
const stockage = (): Storage => window.localStorage;
const reglages = lireReglages(stockage);
const options: Modifiable<OptionsEtages> = {};
const appliquer = (r: ReglagesChat): void => {
  if (r.modeleSlm === '') delete options.modele;
  else options.modele = r.modeleSlm;
  if (r.modeleDecision === '') delete options.modeleDecision;
  else options.modeleDecision = r.modeleDecision;
};
appliquer(reglages);
const cascade = creerCascade({ fabriques: ETAGES_ENREGISTRES, options });

const racine = document.getElementById('app');
const app = application;
if (racine && app) {
  racine.dataset['chat'] = `${MARQUEUR_CHAT}:${String(cascade.etages.length)}`;
  const inspection = creerInspection({ stockage });
  const fenetre = creerFenetreInspection(document.body, inspection);
  const controleur = creerControleur({
    inspection,
    cascade,
    actions: app.actions,
    enRotation: () => app.roue.enRotation,
  });
  const zone = racine.querySelector<HTMLElement>('.page__panneau');
  if (zone) {
    const section = creerPanneauChat(zone, {
      controleur,
      reglages,
      surReglages: appliquer,
      stockage,
      inspection: fenetre,
      ouvert: window.matchMedia('(min-width: 52rem)').matches,
    });
    zone.prepend(section);
  }
}
