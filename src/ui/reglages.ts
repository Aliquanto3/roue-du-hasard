/** Réglages près de la roue : relief 2D/3D (F20) et coupure du son (F16). Tout passe par la table d'actions. */
import type { Actions } from '../actions';
import type { Etat } from '../domain/etat';
import { TEXTS } from '../texts';
import { annonceur, bouton, creer } from './dom';
import './reglages.css';

export function creerReglages(conteneur: HTMLElement, actions: Actions): void {
  const racine = creer('div', 'reglages', conteneur);
  racine.setAttribute('role', 'group');
  racine.setAttribute('aria-label', TEXTS.reglages.groupe);
  const boutonRelief = bouton('reglages__bouton', '', racine);
  const boutonSon = bouton('reglages__bouton', '', racine);
  const statut = creer('p', 'visuellement-cache', racine);
  statut.setAttribute('role', 'status');
  const annoncer = annonceur(statut);

  function synchroniser(etat: Etat): void {
    boutonRelief.textContent = TEXTS.reglages.relief(etat.relief);
    boutonSon.textContent = TEXTS.reglages.son(etat.sonCoupe);
  }

  boutonRelief.addEventListener('click', () => {
    const relief = !actions.magasin.lire().relief;
    if (actions.executer('basculerRendu', { mode: relief ? '3d' : '2d' }).ok) annoncer(TEXTS.reglages.statutRelief(relief));
  });
  boutonSon.addEventListener('click', () => {
    const coupe = !actions.magasin.lire().sonCoupe;
    if (actions.executer('couperSon', { coupe }).ok) annoncer(TEXTS.reglages.statutSon(coupe));
  });

  actions.magasin.abonner(synchroniser);
  synchroniser(actions.magasin.lire());
}
