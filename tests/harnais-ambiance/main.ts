import { creerConfettis } from '../../src/ui/confettis';
import { creerSon } from '../../src/ui/son';

const son = creerSon();
const zone = document.getElementById('zone');
const etat = document.getElementById('etat');
if (!zone || !etat) throw new Error('harnais incomplet');
const confettis = creerConfettis(zone);

document.getElementById('clic')?.addEventListener('click', () => {
  son.preparer();
  // Rafale comme un tour de roue à 1 000 noms : un seul clic par fenêtre de 50 ms.
  for (let i = 0; i < 30; i++) son.cliquetis(1000);
  etat.textContent = 'clic';
});
document.getElementById('fanfare')?.addEventListener('click', () => {
  son.preparer();
  son.fanfare();
  etat.textContent = 'fanfare';
});
document.getElementById('confettis')?.addEventListener('click', () => {
  confettis.lancer(['#ff5a5f', '#ffd166', '#06d6a0', '#118ab2']);
  etat.textContent = 'confettis';
});
document.getElementById('couper')?.addEventListener('click', () => {
  son.couper(!son.estCoupe());
  etat.textContent = son.estCoupe() ? 'coupe' : 'actif';
});
