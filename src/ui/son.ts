/** Son Web Audio sans fichier : cliquetis de la roue et fanfare d'annonce (F16). */

interface ParamAudio {
  value: number;
  setValueAtTime(valeur: number, instant: number): unknown;
  linearRampToValueAtTime(valeur: number, instant: number): unknown;
}
export interface NoeudAudio {
  connect(destination: unknown): unknown;
  disconnect(): void;
}
export interface OscillateurAudio extends NoeudAudio {
  type: string;
  frequency: ParamAudio;
  onended: (() => void) | null;
  start(instant: number): void;
  stop(instant: number): void;
}
export interface GainAudio extends NoeudAudio {
  gain: ParamAudio;
}
/** Sous-ensemble de `AudioContext` utilisé ici, pour pouvoir injecter un faux contexte. */
export interface ContexteAudio {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  createOscillator(): OscillateurAudio;
  createGain(): GainAudio;
  resume(): Promise<void>;
}

export interface OptionsSon {
  /** Renvoie un contexte, ou null si l'audio est indisponible. Peut lever. */
  creerContexte?: () => ContexteAudio | null;
  /** Horloge en millisecondes. */
  maintenant?: () => number;
}

export interface Son {
  /** À appeler sur un geste utilisateur : crée le contexte, ou le reprend s'il n'est pas actif. */
  preparer(): void;
  /**
   * `franchis` : secteurs franchis depuis la dernière image (0 à 1 000) ; un seul clic, plafonné.
   * `cliquetis` et `fanfare` sont sans effet tant que le contexte n'est pas `running` : la reprise
   * est asynchrone, donc une fanfare dans le même tour que le premier `preparer()` reste muette.
   */
  cliquetis(franchis: number): void;
  fanfare(): void;
  couper(coupe: boolean): void;
  estCoupe(): boolean;
}

/** Au plus 20 cliquetis par seconde. */
export const INTERVALLE_CLIQUETIS_MS = 50;
export const VOLUME_MAITRE = 0.15;
export const DUREE_FANFARE_S = 1.2;
const DUREE_CLIC_S = 0.025;
/** Do, mi, sol, do aigu. */
const NOTES_FANFARE: readonly number[] = [523.25, 659.25, 783.99, 1046.5];
const PAS_NOTE_S = 0.15;
const DUREE_NOTE_S = 0.3;

function contexteParDefaut(): ContexteAudio | null {
  const Ctor = (globalThis as { AudioContext?: new () => ContexteAudio }).AudioContext;
  return Ctor ? new Ctor() : null;
}

export function creerSon(options: OptionsSon = {}): Son {
  const creerContexte = options.creerContexte ?? contexteParDefaut;
  const maintenant = options.maintenant ?? (() => performance.now());
  let contexte: ContexteAudio | null = null;
  let maitre: GainAudio | null = null;
  let horsService = false;
  let coupe = false;
  let dernierClic = Number.NEGATIVE_INFINITY;
  const actifs = new Set<OscillateurAudio>();

  function deconnecter(noeud: NoeudAudio): void {
    try {
      noeud.disconnect();
    } catch {
      /* déjà déconnecté */
    }
  }

  function jouer(ctx: ContexteAudio, sortie: GainAudio, freq: number, debut: number, duree: number, type: string, crete: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, debut);
    gain.gain.linearRampToValueAtTime(crete, debut + Math.min(0.01, duree / 2));
    gain.gain.linearRampToValueAtTime(0, debut + duree);
    osc.connect(gain);
    gain.connect(sortie);
    actifs.add(osc);
    osc.onended = () => {
      actifs.delete(osc);
      deconnecter(osc);
      deconnecter(gain);
    };
    osc.start(debut);
    osc.stop(debut + duree);
  }

  function sansEffet(action: () => void): void {
    if (horsService) return;
    try {
      action();
    } catch {
      horsService = true;
    }
  }

  function appliquerCoupure(): void {
    if (!maitre) return;
    maitre.gain.value = coupe ? 0 : VOLUME_MAITRE;
    if (!coupe) return;
    for (const osc of [...actifs]) {
      actifs.delete(osc);
      try {
        osc.stop(0);
      } catch {
        /* déjà arrêté */
      }
      deconnecter(osc);
    }
  }

  return {
    preparer() {
      sansEffet(() => {
        if (!contexte) {
          const neuf = creerContexte();
          if (!neuf) {
            horsService = true;
            return;
          }
          contexte = neuf;
          maitre = neuf.createGain();
          maitre.connect(neuf.destination);
          appliquerCoupure();
        }
        if (contexte.state !== 'running') contexte.resume().catch(() => undefined);
      });
    },
    cliquetis(franchis) {
      if (coupe || !contexte || !maitre || !(franchis > 0) || contexte.state !== 'running') return;
      const t = maintenant();
      if (t - dernierClic < INTERVALLE_CLIQUETIS_MS) return;
      dernierClic = t;
      const [ctx, sortie] = [contexte, maitre];
      sansEffet(() => jouer(ctx, sortie, 1800, ctx.currentTime, DUREE_CLIC_S, 'square', 0.4));
    },
    fanfare() {
      if (coupe || !contexte || !maitre || contexte.state !== 'running') return;
      const [ctx, sortie] = [contexte, maitre];
      sansEffet(() => {
        const debut = ctx.currentTime;
        NOTES_FANFARE.forEach((f, i) => {
          const dernier = i === NOTES_FANFARE.length - 1;
          const duree = dernier ? DUREE_FANFARE_S - i * PAS_NOTE_S : DUREE_NOTE_S;
          jouer(ctx, sortie, f, debut + i * PAS_NOTE_S, duree, 'triangle', 0.5);
        });
      });
    },
    couper(valeur) {
      coupe = valeur;
      sansEffet(appliquerCoupure);
    },
    estCoupe: () => coupe,
  };
}
