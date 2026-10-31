import { TEXTS } from './texts';

export function render(root: HTMLElement): void {
  root.textContent = TEXTS.ready;
  root.dataset['ready'] = 'true';
}

const root = document.getElementById('app');
if (root) render(root);
