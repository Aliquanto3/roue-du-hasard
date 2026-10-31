import { tirerIndex } from './domain/tirage';
import { creerRoue, type Roue } from './ui/roue';

export function render(root: HTMLElement): Roue {
  // Liste temporaire vide : le panneau de la story 2.2 appellera `roue.definirNoms`.
  const roue: Roue = creerRoue(root, {
    surDemande: () => void roue.lancer(tirerIndex(roue.nombre)),
  });
  root.dataset['ready'] = 'true';
  return roue;
}

const root = document.getElementById('app');
if (root) render(root);
