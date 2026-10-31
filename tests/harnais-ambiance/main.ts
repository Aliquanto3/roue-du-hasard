import { creerConfettis } from '../../src/ui/confettis';
import { creerSon } from '../../src/ui/son';

/** Sondes pour l'E2E, posées sur le vrai AudioContext que `creerSon` crée par son chemin par défaut. */
const sondes = {
  contexte: null as AudioContext | null,
  analyseur: null as AnalyserNode | null,
  oscillateurs: 0,
  termines: 0,
};
class ContexteSonde extends AudioContext {
  constructor() {
    super();
    // Tout ce que le son envoie à la sortie passe par l'analyseur.
    const analyseur = this.createAnalyser();
    analyseur.connect(this.destination);
    Object.defineProperty(this, 'destination', { value: analyseur });
    sondes.contexte = this;
    sondes.analyseur = analyseur;
  }
  override createOscillator(): OscillatorNode {
    const osc = super.createOscillator();
    sondes.oscillateurs++;
    osc.addEventListener('ended', () => sondes.termines++);
    return osc;
  }
}
globalThis.AudioContext = ContexteSonde;

(globalThis as unknown as { ambiance: unknown }).ambiance = {
  etat: () => sondes.contexte?.state ?? 'absent',
  oscillateurs: () => sondes.oscillateurs,
  termines: () => sondes.termines,
  /** Amplitude crête du signal en sortie, sur les derniers échantillons. */
  pic: () => {
    if (!sondes.analyseur) return 0;
    const echantillons = new Float32Array(sondes.analyseur.fftSize);
    sondes.analyseur.getFloatTimeDomainData(echantillons);
    return echantillons.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
  },
};

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
