/**
 * Page de test de la roue, hors du fichier livré. Paramètres d'URL :
 * `n` (noms initiaux), `duree` (ms forcées), `source=milieu` (arrêt au milieu du secteur).
 */
import { indexApresRotation, tirerIndex, type Source } from '../../src/domain/tirage';
import { creerRoue, type NomRoue, type ResultatLancer, type Roue } from '../../src/ui/roue';
import { couleursSecteurs } from '../../src/ui/roue-rendu';

const params = new URLSearchParams(location.search);
const duree = params.get('duree');
const source: Source | undefined = params.get('source') === 'milieu' ? () => 2 ** 31 : undefined;
const racine = document.getElementById('app') as HTMLElement;

const journal = { demandes: 0, debuts: 0, fins: 0, franchis: 0, appelsSecteur: 0 };

const roue: Roue = creerRoue(racine, {
  surDemande: () => {
    journal.demandes++;
    void roue.lancer(tirerIndex(roue.nombre));
  },
  source,
  dureeMs: duree ? Number(duree) : undefined,
});
roue.ecouter('debut', () => journal.debuts++);
roue.ecouter('fin', () => journal.fins++);
roue.ecouter('secteur', (e) => {
  journal.franchis += e.franchis;
  journal.appelsSecteur++;
});

let noms: NomRoue[] = [];

const nomsDe = (n: number): NomRoue[] =>
  Array.from({ length: n }, (_, i) => ({ nom: `Nom ${String(i)}`, couleur: null }));

/** Remplace la liste et renvoie la durée du pré-rendu, en ms. */
function definir(liste: NomRoue[]): number {
  noms = liste;
  const t0 = performance.now();
  roue.definirNoms(liste);
  return performance.now() - t0;
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

const harnais = {
  roue,
  journal,
  definir,
  definirN: (n: number): number => definir(nomsDe(n)),
  lancer: (i: number): Promise<ResultatLancer> => roue.lancer(i),
  couleurAttendue: (i: number): [number, number, number] => rgb(couleursSecteurs(noms)[i] as string),
  indexSousPointeur: (): number => indexApresRotation(roue.rotation, noms.length),
  /** Couleur du canvas juste sous la pointe du pointeur. */
  pixelPointe(): [number, number, number, number] {
    const { canvas } = roue;
    const x = Number(canvas.dataset['sondeX']);
    const y = Number(canvas.dataset['sondeY']);
    const data = (canvas.getContext('2d') as CanvasRenderingContext2D).getImageData(x, y, 1, 1).data;
    return [data[0] as number, data[1] as number, data[2] as number, data[3] as number];
  },
  /** Intervalles entre images, en ms, jusqu'à la fin de la rotation en cours. */
  async intervallesImages(): Promise<number[]> {
    const intervalles: number[] = [];
    let avant = performance.now();
    while (roue.enRotation) {
      await new Promise((suite) => requestAnimationFrame(suite));
      const t = performance.now();
      intervalles.push(t - avant);
      avant = t;
    }
    return intervalles;
  },
};

export type Harnais = typeof harnais;
(window as unknown as { harnais: Harnais }).harnais = harnais;

const n = params.get('n');
if (n) harnais.definirN(Number(n));
