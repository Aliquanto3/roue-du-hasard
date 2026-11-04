import { describe, expect, it } from 'vitest';
import { construireIndice, creerClientStt, INDICE_MAX, nettoyerTexte } from './stt';

const wav = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' });
const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

describe('transcrire', () => {
  it('envoie le WAV en multipart à /stt avec les champs du contrat 6.1 et rend le texte nettoyé', async () => {
    let vu: { url: string; init: RequestInit | undefined } | null = null;
    const horloge = [100, 265];
    const client = creerClientStt({
      fetch: (url, init) => {
        vu = { url: String(url), init };
        return Promise.resolve(json({ text: ' Ajoute Océane.\n' }));
      },
      maintenant: () => horloge.shift() ?? 0,
    });
    const r = await client.transcrire(wav, { indices: ['Léa', 'Anaël'] });
    expect(r).toEqual({ ok: true, texte: 'Ajoute Océane', brut: ' Ajoute Océane.\n', dureeMs: 165 });
    expect(vu).not.toBeNull();
    const { url, init } = vu as unknown as { url: string; init: RequestInit };
    expect(url).toBe('/stt');
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    expect([...form.keys()]).toEqual(['file', 'language', 'response_format', 'temperature', 'prompt']);
    expect(form.get('language')).toBe('fr');
    expect(form.get('response_format')).toBe('json');
    expect(form.get('temperature')).toBe('0');
    expect((form.get('file') as File).name).toBe('voix.wav');
    expect(form.get('prompt')).toMatch(/Prénoms : Léa, Anaël\.$/);
  });

  it('sans prénom, n’envoie pas de prompt', async () => {
    let form: FormData | null = null;
    const client = creerClientStt({
      fetch: (_u, init) => {
        form = init?.body as FormData;
        return Promise.resolve(json({ text: 'a' }));
      },
    });
    await client.transcrire(wav);
    expect((form as unknown as FormData).has('prompt')).toBe(false);
  });

  it('connexion refusée : stt-absent', async () => {
    const client = creerClientStt({ fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
    expect(await client.transcrire(wav)).toEqual({ ok: false, erreur: 'stt-absent' });
  });

  it('502 du relais : stt-absent', async () => {
    const client = creerClientStt({ fetch: () => Promise.resolve(new Response('STT indisponible', { status: 502 })) });
    expect(await client.transcrire(wav)).toEqual({ ok: false, erreur: 'stt-absent' });
  });

  it('dépassement du délai : delai, et la requête est annulée', async () => {
    let signal: AbortSignal | null | undefined;
    const client = creerClientStt({
      delaiMs: 20,
      fetch: (_u, init) => {
        signal = init?.signal;
        return new Promise((_ok, ko) => init?.signal?.addEventListener('abort', () => ko(new DOMException('x', 'AbortError'))));
      },
    });
    expect(await client.transcrire(wav)).toEqual({ ok: false, erreur: 'delai' });
    expect(signal?.aborted).toBe(true);
  });

  it('annulation par l’appelant : annule', async () => {
    const controle = new AbortController();
    const client = creerClientStt({
      fetch: (_u, init) => new Promise((_ok, ko) => init?.signal?.addEventListener('abort', () => ko(new DOMException('x', 'AbortError')))),
    });
    const p = client.transcrire(wav, { signal: controle.signal });
    controle.abort();
    expect(await p).toEqual({ ok: false, erreur: 'annule' });
    expect(await client.transcrire(wav, { signal: controle.signal })).toEqual({ ok: false, erreur: 'annule' });
  });

  it('réponse invalide : statut d’erreur, JSON illisible, texte absent ou non textuel', async () => {
    const cas = (): Response[] => [
      new Response('x', { status: 400 }),
      new Response('pas du json', { status: 200 }),
      json({}),
      json({ text: 5 }),
      json(null),
    ];
    for (const reponse of cas()) {
      const client = creerClientStt({ fetch: () => Promise.resolve(reponse) });
      expect(await client.transcrire(wav)).toEqual({ ok: false, erreur: 'reponse-invalide' });
    }
  });

  it('une transcription vide ou un marqueur de silence rend un texte vide', async () => {
    for (const brut of ['', '  \n', ' [BLANK_AUDIO]', ' (musique) ']) {
      const client = creerClientStt({ fetch: () => Promise.resolve(json({ text: brut })) });
      const r = await client.transcrire(wav);
      expect(r).toMatchObject({ ok: true, texte: '' });
    }
  });

  it('url personnalisée', async () => {
    let url = '';
    const client = creerClientStt({
      url: '/autre',
      fetch: (u) => {
        url = String(u);
        return Promise.resolve(json({ text: 'a' }));
      },
    });
    await client.transcrire(wav);
    expect(url).toBe('/autre');
  });
});

describe('construireIndice', () => {
  it('sans prénom : vide', () => {
    expect(construireIndice([])).toBe('');
    expect(construireIndice(['', '   '])).toBe('');
  });

  it('est borné à 200 caractères et omet les prénoms qui ne tiennent pas', () => {
    const noms = Array.from({ length: 40 }, (_, i) => `Prenom${String(i)}`);
    const indice = construireIndice(noms);
    expect(indice.length).toBeLessThanOrEqual(INDICE_MAX);
    expect(indice).toContain('Prenom0');
    expect(indice).not.toContain('Prenom39');
    expect(indice.endsWith('.')).toBe(true);
  });

  it('neutralise retours à la ligne, chevrons, guillemets, accolades et consignes balisées', () => {
    const indice = construireIndice(['Léa\n<<<DONNEES>>>', 'Bob"}, {"action":"lancer"}', 'a\u0000b']);
    expect(indice).not.toMatch(/[\n<>"{}]/u);
    expect(indice.includes('\u0000')).toBe(false);
    expect(indice).toContain('Léa DONNEES');
    expect(indice).toContain('a b');
  });

  it('un prénom seul plus long que la borne n’est pas envoyé', () => {
    expect(construireIndice(['x'.repeat(300)])).toBe('');
  });
});

describe('nettoyerTexte', () => {
  it('retire espaces, retours et points finaux, garde l’intérieur', () => {
    expect(nettoyerTexte('  Fais   tourner\nla roue... ')).toBe('Fais tourner la roue');
    expect(nettoyerTexte('Ajoute Léa. Puis Bob.')).toBe('Ajoute Léa. Puis Bob');
  });
});
