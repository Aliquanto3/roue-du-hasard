import { describe, expect, it } from 'vitest';
import type { Enregistrement, Micro, ResultatMicro } from './micro';
import type { ClientStt, ResultatStt } from './stt';
import { TEXTES_CHAT } from './textes';
import { creerVoix, type EtatVoix, type Transcription } from './voix';

function montage(opts: { micro?: Micro; stt?: ResultatStt } = {}) {
  const wav = new Blob(['wav']);
  const journal: string[] = [];
  const etats: EtatVoix[] = [];
  const refus: string[] = [];
  const dictees: Transcription[] = [];
  let arrets = 0;
  let annulations = 0;
  let finir: (r: ResultatMicro) => void = () => undefined;
  const enregistrement: Enregistrement = {
    resultat: new Promise((ok) => {
      finir = ok;
    }),
    arreter: () => {
      arrets++;
      finir({ ok: true, wav });
    },
    annuler: () => {
      annulations++;
    },
  };
  let indicesVus: readonly string[] = [];
  const stt: ClientStt = {
    transcrire: (_w, o) => {
      indicesVus = o?.indices ?? [];
      journal.push('stt');
      return Promise.resolve(opts.stt ?? { ok: true, texte: 'Ajoute Léa', brut: ' Ajoute Léa.', dureeMs: 120 });
    },
  };
  const voix = creerVoix({
    micro: opts.micro ?? { demarrer: () => Promise.resolve({ ok: true, enregistrement }) },
    stt,
    indices: () => ['Léa', 'Bob'],
    surEtat: (e) => etats.push(e),
    surRefus: (m) => refus.push(m),
    surTranscription: (t) => dictees.push(t),
  });
  return { voix, etats, refus, dictees, journal, arrets: () => arrets, annulations: () => annulations, indices: () => indicesVus };
}

const tick = (): Promise<void> => new Promise((ok) => setTimeout(ok, 0));

describe('voix', () => {
  it('appui puis relâchement : écoute, transcription, texte rendu avec le brut et la durée', async () => {
    const m = montage();
    const p = m.voix.demarrer();
    await tick();
    expect(m.voix.etat()).toBe('ecoute');
    m.voix.arreter();
    await p;
    expect(m.etats).toEqual(['ecoute', 'transcription', 'repos']);
    expect(m.dictees).toEqual([{ texte: 'Ajoute Léa', brut: ' Ajoute Léa.', dureeMs: 120 }]);
    expect(m.indices()).toEqual(['Léa', 'Bob']);
    expect(m.refus).toEqual([]);
  });

  it('relâché avant l’ouverture du micro : l’enregistrement s’arrête aussitôt', async () => {
    const m = montage();
    const p = m.voix.demarrer();
    m.voix.arreter();
    await p;
    expect(m.arrets()).toBe(1);
    expect(m.dictees).toHaveLength(1);
  });

  it('micro refusé : message de refus, retour au repos, aucun appel STT', async () => {
    const m = montage({ micro: { demarrer: () => Promise.resolve({ ok: false, erreur: 'micro-refuse' }) } });
    await m.voix.demarrer();
    expect(m.refus).toEqual([TEXTES_CHAT.voixRefus['micro-refuse']]);
    expect(m.voix.etat()).toBe('repos');
    expect(m.journal).toEqual([]);
  });

  it('STT absent : le message cite npm run stt', async () => {
    const m = montage({ stt: { ok: false, erreur: 'stt-absent' } });
    const p = m.voix.demarrer();
    await tick();
    m.voix.arreter();
    await p;
    expect(m.refus).toHaveLength(1);
    expect(m.refus[0]).toContain('npm run stt');
    expect(m.dictees).toEqual([]);
    expect(m.voix.etat()).toBe('repos');
  });

  it('transcription vide : refus « rien entendu », rien dans le champ', async () => {
    const m = montage({ stt: { ok: true, texte: '', brut: '[BLANK_AUDIO]', dureeMs: 80 } });
    const p = m.voix.demarrer();
    await tick();
    m.voix.arreter();
    await p;
    expect(m.refus).toEqual([TEXTES_CHAT.voixRefus.vide]);
    expect(m.dictees).toEqual([]);
  });

  it('annuler pendant l’écoute : aucun message, aucune transcription', async () => {
    const m = montage();
    const p = m.voix.demarrer();
    await tick();
    m.voix.annuler();
    expect(m.annulations()).toBe(1);
    expect(m.voix.etat()).toBe('repos');
    await Promise.race([p, tick()]);
    expect(m.refus).toEqual([]);
    expect(m.dictees).toEqual([]);
  });

  it('un second appui pendant la prise est ignoré', async () => {
    const m = montage();
    const p = m.voix.demarrer();
    await tick();
    await m.voix.demarrer();
    m.voix.arreter();
    await p;
    expect(m.dictees).toHaveLength(1);
  });
});
