import { describe, expect, it } from 'vitest';
import { creerMicro, DUREE_MAX_MS, encoderWav, FREQUENCE_WAV } from './micro';

const lire = async (b: Blob): Promise<DataView> => new DataView(await b.arrayBuffer());
const texte = (v: DataView, debut: number, n: number): string =>
  String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(debut + i)));

describe('encoderWav', () => {
  it('écrit un en-tête WAV PCM 16 bits mono 16 kHz', async () => {
    const blob = encoderWav(new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2]));
    expect(blob.type).toBe('audio/wav');
    const v = await lire(blob);
    expect(blob.size).toBe(44 + 7 * 2);
    expect(texte(v, 0, 4)).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(36 + 14);
    expect(texte(v, 8, 8)).toBe('WAVEfmt ');
    expect(v.getUint32(16, true)).toBe(16);
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint32(28, true)).toBe(32000);
    expect(v.getUint16(32, true)).toBe(2);
    expect(v.getUint16(34, true)).toBe(16);
    expect(texte(v, 36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(14);
  });

  it('convertit les échantillons et écrête hors de [-1 ; 1]', async () => {
    const v = await lire(encoderWav(new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2])));
    const pcm = Array.from({ length: 7 }, (_, i) => v.getInt16(44 + i * 2, true));
    expect(pcm).toEqual([0, 16384, -16384, 32767, -32768, 32767, -32768]);
  });

  it('une durée d’une seconde fait 32 000 octets de données', () => {
    expect(encoderWav(new Float32Array(FREQUENCE_WAV)).size).toBe(44 + 32000);
  });
});

/** Faux flux et faux enregistreur : frontière du navigateur, pas du code du projet. */
function faux() {
  const pistes = [
    {
      arretee: false,
      stop() {
        this.arretee = true;
      },
    },
  ];
  const flux = { getTracks: () => pistes } as unknown as MediaStream;
  const ecouteurs = new Map<string, ((ev: unknown) => void)[]>();
  const enreg = {
    state: 'inactive',
    mimeType: 'audio/webm;codecs=opus',
    start() {
      this.state = 'recording';
    },
    stop() {
      this.state = 'inactive';
      for (const f of ecouteurs.get('dataavailable') ?? []) f({ data: new Blob([new Uint8Array([9, 9])]) });
      for (const f of ecouteurs.get('stop') ?? []) f({});
    },
    addEventListener(nom: string, f: (ev: unknown) => void) {
      ecouteurs.set(nom, [...(ecouteurs.get(nom) ?? []), f]);
    },
  };
  return { pistes, flux, enreg: enreg as unknown as MediaRecorder, brut: enreg };
}

describe('creerMicro', () => {
  it('sans mediaDevices : micro-absent', async () => {
    expect(await creerMicro({ mediaDevices: undefined }).demarrer()).toEqual({ ok: false, erreur: 'micro-absent' });
  });

  it('permission refusée : micro-refuse ; aucun périphérique : micro-absent', async () => {
    const refus = { getUserMedia: () => Promise.reject(new DOMException('no', 'NotAllowedError')) };
    expect(await creerMicro({ mediaDevices: refus }).demarrer()).toEqual({ ok: false, erreur: 'micro-refuse' });
    const absent = { getUserMedia: () => Promise.reject(new DOMException('no', 'NotFoundError')) };
    expect(await creerMicro({ mediaDevices: absent }).demarrer()).toEqual({ ok: false, erreur: 'micro-absent' });
  });

  it('enregistre, convertit, et arrête les pistes', async () => {
    const f = faux();
    let recu: Blob | null = null;
    const micro = creerMicro({
      mediaDevices: { getUserMedia: () => Promise.resolve(f.flux) },
      creerEnregistreur: () => f.enreg,
      convertir: (b) => {
        recu = b;
        return Promise.resolve(new Blob(['wav']));
      },
    });
    const d = await micro.demarrer();
    if (!d.ok) throw new Error('démarrage');
    expect(f.brut.state).toBe('recording');
    d.enregistrement.arreter();
    const r = await d.enregistrement.resultat;
    expect(r.ok).toBe(true);
    expect((recu as unknown as Blob).size).toBe(2);
    expect(f.pistes[0]?.arretee).toBe(true);
  });

  it('s’arrête seul à la durée maximale (15 s)', async () => {
    expect(DUREE_MAX_MS).toBe(15000);
    const f = faux();
    const micro = creerMicro({
      mediaDevices: { getUserMedia: () => Promise.resolve(f.flux) },
      creerEnregistreur: () => f.enreg,
      convertir: () => Promise.resolve(new Blob(['wav'])),
      dureeMaxMs: 15,
    });
    const d = await micro.demarrer();
    if (!d.ok) throw new Error('démarrage');
    expect((await d.enregistrement.resultat).ok).toBe(true);
    expect(f.pistes[0]?.arretee).toBe(true);
  });

  it('échec de conversion : enregistrement-impossible, pistes arrêtées', async () => {
    const f = faux();
    const micro = creerMicro({
      mediaDevices: { getUserMedia: () => Promise.resolve(f.flux) },
      creerEnregistreur: () => f.enreg,
      convertir: () => Promise.reject(new Error('decode')),
    });
    const d = await micro.demarrer();
    if (!d.ok) throw new Error('démarrage');
    d.enregistrement.arreter();
    expect(await d.enregistrement.resultat).toEqual({ ok: false, erreur: 'enregistrement-impossible' });
    expect(f.pistes[0]?.arretee).toBe(true);
  });

  it('annuler jette tout sans conversion', async () => {
    const f = faux();
    let converti = false;
    const micro = creerMicro({
      mediaDevices: { getUserMedia: () => Promise.resolve(f.flux) },
      creerEnregistreur: () => f.enreg,
      convertir: () => {
        converti = true;
        return Promise.resolve(new Blob());
      },
    });
    const d = await micro.demarrer();
    if (!d.ok) throw new Error('démarrage');
    d.enregistrement.annuler();
    expect(await d.enregistrement.resultat).toEqual({ ok: false, erreur: 'enregistrement-impossible' });
    expect(converti).toBe(false);
    expect(f.pistes[0]?.arretee).toBe(true);
  });

  it('enregistreur impossible à créer : pistes arrêtées', async () => {
    const f = faux();
    const micro = creerMicro({
      mediaDevices: { getUserMedia: () => Promise.resolve(f.flux) },
      creerEnregistreur: () => {
        throw new Error('format');
      },
    });
    expect(await micro.demarrer()).toEqual({ ok: false, erreur: 'enregistrement-impossible' });
    expect(f.pistes[0]?.arretee).toBe(true);
  });
});
