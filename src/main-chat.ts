// Point d'entrée de l'édition chat (`roue-chat.html`) : l'application de `main.ts`, plus le code du chat.
// `main.ts` rend l'application à son import ; il n'importe rien de `src/chat/`.
import './main';
import { ETAGES_ENREGISTRES } from './chat/cascade';
import { MARQUEUR_CHAT } from './chat/marqueur';

// Cascade construite sans étage pour l'instant (5.3, 5.6 et 5.10 y ajoutent les leurs) ; l'interface est la story 5.5.
const etages = ETAGES_ENREGISTRES.map((fabrique) => fabrique({}));
const racine = document.getElementById('app');
if (racine) racine.dataset['chat'] = `${MARQUEUR_CHAT}:${etages.length}`;
