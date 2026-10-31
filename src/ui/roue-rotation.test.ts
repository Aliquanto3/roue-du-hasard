// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { angleArret, indexApresRotation, rotationFinale } from '../domain/tirage';
import {
  creerMoteur,
  deceleration,
  DUREE_FONDU,
  DUREE_MAX,
  DUREE_MIN,
  normaliser,
  planifierRotation,
  rotationAuTemps,
  secteursFranchis,
  TOURS_MAX,
  TOURS_MIN,
  type Horloge,
  type Vue,
} from './roue-rotation';

const fixe = (v: number) => (): number => v;
const MILIEU = 2 ** 31;
const MAX = 2 ** 32 - 1;

/** Horloge double, avancée à la main : images et délais ne partent que sur demande. */
function horlogeDouble() {
  let t = 0;
  let suite = 1;
  const images = new Map<number, () => void>();
  const delais = new Map<number, { rappel: () => void; a: number }>();
  const horloge: Horloge = {
    maintenant: () => t,
    demanderImage(r) {
      images.set(suite, r);
      return suite++;
    },
    annulerImage: (id) => void images.delete(id),
    differer(r, ms) {
      delais.set(suite, { rappel: r, a: t + ms });
      return suite++;
    },
    annulerDelai: (id) => void delais.delete(id),
  };
  return {
    horloge,
    images,
    delais,
    /** Avance le temps et joue une image, si `avecImage`, puis les délais échus. */
    avancer(ms: number, avecImage = true) {
      t += ms;
      if (avecImage) {
        const a = [...images.values()];
        images.clear();
        a.forEach((r) => r());
      }
      for (const [id, d] of [...delais]) {
        if (d.a <= t) {
          delais.delete(id);
          d.rappel();
        }
      }
    },
  };
}

function moteurDeTest(reduit = false, dureeMs?: number) {
  const h = horlogeDouble();
  const vues: Vue[] = [];
  const moteur = creerMoteur({
    horloge: h.horloge,
    source: fixe(MILIEU),
    mouvementReduit: () => reduit,
    surImage: (v) => vues.push(v),
    dureeMs,
  });
  return { h, vues, moteur };
}

describe('deceleration', () => {
  it('borne, décélère et reste monotone', () => {
    expect(deceleration(0)).toBe(0);
    expect(deceleration(1)).toBe(1);
    expect(deceleration(-1)).toBe(0);
    expect(deceleration(2)).toBe(1);
    let avant = 0;
    let pasAvant = Infinity;
    for (let i = 1; i <= 100; i++) {
      const v = deceleration(i / 100);
      expect(v).toBeGreaterThan(avant);
      expect(v - avant).toBeLessThan(pasAvant);
      pasAvant = v - avant;
      avant = v;
    }
  });
});

describe('planifierRotation', () => {
  it('borne la durée et le nombre de tours sur toute la plage de la source', () => {
    const bas = planifierRotation(0, 1, 10, fixe(0));
    expect(bas.duree).toBe(DUREE_MIN);
    expect(bas.tours).toBe(TOURS_MIN);
    const haut = planifierRotation(0, 1, 10, fixe(MAX));
    expect(haut.duree).toBeLessThanOrEqual(DUREE_MAX);
    expect(haut.duree).toBeGreaterThan(DUREE_MAX - 1);
    expect(haut.tours).toBe(TOURS_MAX);
  });
  it('fait au moins 4 tours, sens horaire, depuis tout angle de départ', () => {
    for (const depart of [0, 1, 90, 359.999, 725, -40]) {
      const p = planifierRotation(depart, 3, 7, fixe(0));
      expect(p.depart).toBe(normaliser(depart));
      expect(p.fin - p.depart).toBeGreaterThanOrEqual(4 * 360);
      expect(p.fin - p.depart).toBeLessThan(5 * 360);
    }
  });
  it('vise exactement l’angle du domaine, à tout index', () => {
    for (const n of [2, 3, 10, 200, 1000]) {
      for (const index of [0, n - 1, Math.floor(n / 2)]) {
        const p = planifierRotation(123.4, index, n, fixe(MILIEU));
        expect(p.cible).toBe(rotationFinale(angleArret(index, n, fixe(MILIEU))));
        expect(indexApresRotation(p.cible, n)).toBe(index);
        expect(indexApresRotation(p.fin, n)).toBe(index);
      }
    }
  });
  it('respecte une durée forcée', () => {
    expect(planifierRotation(0, 0, 2, fixe(0), 150).duree).toBe(150);
  });
});

describe('rotationAuTemps', () => {
  const plan = planifierRotation(10, 2, 5, fixe(MILIEU));
  it('part du départ et finit exactement à la fin, même très en retard', () => {
    expect(rotationAuTemps(plan, 0)).toBe(plan.depart);
    expect(rotationAuTemps(plan, plan.duree)).toBe(plan.fin);
    expect(rotationAuTemps(plan, plan.duree * 50)).toBe(plan.fin);
  });
  it('est monotone', () => {
    let avant = plan.depart;
    for (let t = 0; t <= plan.duree; t += 16) {
      const r = rotationAuTemps(plan, t);
      expect(r).toBeGreaterThanOrEqual(avant);
      avant = r;
    }
  });
});

describe('secteursFranchis', () => {
  it('compte les frontières passées', () => {
    expect(secteursFranchis(0, 359, 4)).toBe(3);
    expect(secteursFranchis(0, 360, 4)).toBe(4);
    expect(secteursFranchis(89, 91, 4)).toBe(1);
    expect(secteursFranchis(10, 20, 4)).toBe(0);
    expect(secteursFranchis(0, 1440, 1000)).toBe(4000);
  });
});

describe('creerMoteur', () => {
  it('refuse un second lancement et conserve le premier', async () => {
    const { h, moteur } = moteurDeTest(false, 1000);
    const debuts = vi.fn();
    moteur.ecouter('debut', debuts);
    const p = moteur.lancer(1, 4);
    expect(moteur.enRotation).toBe(true);
    await expect(moteur.lancer(2, 4)).resolves.toEqual({ accepte: false, raison: 'en-rotation' });
    expect(debuts).toHaveBeenCalledTimes(1);
    h.avancer(1000);
    await expect(p).resolves.toMatchObject({ accepte: true, index: 1 });
    expect(moteur.enRotation).toBe(false);
    expect(indexApresRotation(moteur.rotation, 4)).toBe(1);
  });

  it('refuse une liste trop courte et un index invalide sans démarrer', async () => {
    const { moteur } = moteurDeTest();
    await expect(moteur.lancer(0, 1)).resolves.toEqual({ accepte: false, raison: 'trop-peu-de-noms' });
    await expect(moteur.lancer(0, 0)).resolves.toEqual({ accepte: false, raison: 'trop-peu-de-noms' });
    await expect(moteur.lancer(4, 4)).resolves.toEqual({ accepte: false, raison: 'index-invalide' });
    await expect(moteur.lancer(-1, 4)).resolves.toEqual({ accepte: false, raison: 'index-invalide' });
    await expect(moteur.lancer(0.5, 4)).resolves.toEqual({ accepte: false, raison: 'index-invalide' });
    expect(moteur.enRotation).toBe(false);
  });

  it('accepte un nouveau lancement après la fin, en partant de l’angle courant', async () => {
    const { h, vues, moteur } = moteurDeTest(false, 1000);
    const p1 = moteur.lancer(1, 4);
    h.avancer(1000);
    await p1;
    const arret = moteur.rotation;
    vues.length = 0;
    const p2 = moteur.lancer(3, 4);
    h.avancer(1);
    expect(vues[0]?.rotation).toBeGreaterThanOrEqual(arret);
    expect((vues[0]?.rotation ?? 0) - arret).toBeLessThan(30);
    h.avancer(1000);
    await p2;
    expect(indexApresRotation(moteur.rotation, 4)).toBe(3);
  });

  it('agrège le rappel de secteur par image et compte toutes les frontières', async () => {
    const { h, moteur } = moteurDeTest(false, 1000);
    const secteur = vi.fn();
    moteur.ecouter('secteur', secteur);
    const p = moteur.lancer(250, 1000);
    const plan = planifierRotation(0, 250, 1000, fixe(MILIEU), 1000);
    for (let i = 0; i < 10; i++) h.avancer(100);
    await p;
    // 9 images en vol plus l'arrêt : jamais un appel par frontière.
    expect(secteur.mock.calls.length).toBeLessThanOrEqual(10);
    const total = secteur.mock.calls.reduce((s, [e]) => s + (e as { franchis: number }).franchis, 0);
    expect(total).toBe(secteursFranchis(plan.depart, plan.fin, 1000));
    expect(total).toBeGreaterThanOrEqual(4000);
  });

  it('finit au bon angle sans aucune image, par le délai de secours (onglet caché)', async () => {
    const { h, vues, moteur } = moteurDeTest(false, 1000);
    const fin = vi.fn();
    moteur.ecouter('fin', fin);
    const p = moteur.lancer(2, 7);
    h.avancer(1000, false);
    expect(moteur.enRotation).toBe(true);
    h.avancer(250, false);
    await expect(p).resolves.toMatchObject({ accepte: true, index: 2 });
    expect(fin).toHaveBeenCalledTimes(1);
    expect(vues).toEqual([{ rotation: moteur.rotation }]);
    expect(moteur.rotation).toBe(rotationFinale(angleArret(2, 7, fixe(MILIEU))));
  });

  it('une image tardive termine d’un coup, sans double fin, et annule le délai', async () => {
    const { h, moteur } = moteurDeTest(false, 1000);
    const fin = vi.fn();
    moteur.ecouter('fin', fin);
    const p = moteur.lancer(2, 7);
    h.avancer(100000);
    await p;
    expect(fin).toHaveBeenCalledTimes(1);
    expect(h.images.size).toBe(0);
    expect(h.delais.size).toBe(0);
    expect(moteur.rotation).toBeGreaterThanOrEqual(0);
    expect(moteur.rotation).toBeLessThan(360);
  });

  it('mouvement réduit : fondu court, sans tour ni secteur franchi', async () => {
    const { h, vues, moteur } = moteurDeTest(true);
    const secteur = vi.fn();
    moteur.ecouter('secteur', secteur);
    const p = moteur.lancer(5, 10);
    h.avancer(DUREE_FONDU / 2);
    expect(vues[0]?.fondu).toEqual({ depart: 0, progression: 0.5 });
    expect(vues[0]?.rotation).toBe(rotationFinale(angleArret(5, 10, fixe(MILIEU))));
    h.avancer(DUREE_FONDU / 2);
    await p;
    expect(secteur).not.toHaveBeenCalled();
    expect(vues.at(-1)?.fondu).toBeUndefined();
    expect(indexApresRotation(moteur.rotation, 10)).toBe(5);
  });

  it('lit le mouvement réduit à chaque lancement', async () => {
    const h = horlogeDouble();
    let reduit = true;
    const debuts: boolean[] = [];
    const moteur = creerMoteur({
      horloge: h.horloge,
      source: fixe(0),
      mouvementReduit: () => reduit,
      surImage: () => undefined,
    });
    moteur.ecouter('debut', (e) => debuts.push(e.reduit));
    const p1 = moteur.lancer(0, 2);
    h.avancer(DUREE_FONDU);
    await p1;
    reduit = false;
    const p2 = moteur.lancer(1, 2);
    h.avancer(DUREE_MAX);
    await p2;
    expect(debuts).toEqual([true, false]);
  });

  it('une erreur d’écouteur ne bloque ni la fin ni la promesse', async () => {
    const trace = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { h, moteur } = moteurDeTest(false, 100);
    moteur.ecouter('fin', () => {
      throw new Error('écouteur');
    });
    const p = moteur.lancer(1, 2);
    h.avancer(100);
    await expect(p).resolves.toMatchObject({ accepte: true });
    expect(moteur.enRotation).toBe(false);
    expect(trace).toHaveBeenCalledTimes(1);
    trace.mockRestore();
  });

  it('un écouteur désabonné n’est plus appelé', async () => {
    const { h, moteur } = moteurDeTest(false, 100);
    const fin = vi.fn();
    moteur.ecouter('fin', fin)();
    const p = moteur.lancer(1, 2);
    h.avancer(100);
    await p;
    expect(fin).not.toHaveBeenCalled();
  });
});
