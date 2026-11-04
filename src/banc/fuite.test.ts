// @vitest-environment node
/**
 * Garde-fou de séparation des lots (docs/v1.1/README.md, « Règle de séparation ») : les règles de
 * `src/chat/regles.ts` ne doivent contenir aucun mot (chaîne ou expression régulière) qui n'apparaît
 * que dans des commandes du lot `test`.
 *
 * Critère : on extrait des littéraux de chaînes et d'expressions régulières leurs suites de lettres
 * (sans accents ni casse) d'au moins 4 lettres ; les mots courts (articles, pronoms, prépositions)
 * sont donc admis d'office. Un mot ou un radical est « attesté » si un mot d'une commande `dev` le
 * commence. Un mot non attesté en `dev` mais présent dans une commande `test` est une fuite, sauf s'il
 * figure dans `EXCEPTIONS`, avec sa justification.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lireCorpus, lireCorpusDuLot } from './cli';

/** Mots admis bien qu'absents de `dev` : une justification par mot. */
const EXCEPTIONS: Readonly<Record<string, string>> = {
  plait: "« s'il te plaît » : politesse prévue par le README (normalisation des formules de politesse)",
  vous: 'pronom : vouvoiement prévu par la story (verbes à toutes les personnes)',
  plus: 'adverbe de négation (« ne … plus »), mot outil et non vocabulaire d’une commande',
  deux: 'README, « Homonymes » : « supprime les deux Marie » est une demande explicite des deux homonymes',
  violet: 'README, table indicative des couleurs (rouge, bleu, vert, orange, rose, violet, noir, blanc)',
};

const mots = (texte: string): string[] =>
  texte
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((m) => m.length >= 4);

/**
 * Parcourt la source et rend le texte des chaînes (avec au moins un espace, une apostrophe ou un
 * échappement : une chaîne d'un seul mot collé est un nom d'action, un code ou un chemin, pas du
 * vocabulaire) et des expressions régulières, sans les échappements (\b, \w, \p{L}).
 */
function litteraux(source: string): string[] {
  const sortie: string[] = [];
  const motsClesAvantRegex = /[(,=:|&!{;[?\s]/;
  let precedent = '';
  let i = 0;
  while (i < source.length) {
    const c = source.charAt(i);
    const suite = source.charAt(i + 1);
    if (c === '/' && suite === '/') {
      while (i < source.length && source.charAt(i) !== '\n') i++;
      continue;
    }
    if (c === '/' && suite === '*') {
      const fin = source.indexOf('*/', i + 2);
      i = fin < 0 ? source.length : fin + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < source.length && source.charAt(j) !== c) j += source.charAt(j) === '\\' ? 2 : 1;
      const corps = source.slice(i + 1, j);
      if (!/^[\w:.\-/]+$/.test(corps)) sortie.push(corps);
      i = j + 1;
      precedent = c;
      continue;
    }
    const apresMotCle = /(?:^|[^\w$])(?:return|typeof|case|else|in|of|void|throw|new)\s*$/.test(source.slice(Math.max(0, i - 12), i));
    if (c === '/' && (precedent === '' || motsClesAvantRegex.test(precedent) || apresMotCle)) {
      let j = i + 1;
      let classe = false;
      while (j < source.length && (classe || source.charAt(j) !== '/')) {
        const d = source.charAt(j);
        if (d === '\\') j++;
        else if (d === '[') classe = true;
        else if (d === ']') classe = false;
        j++;
      }
      sortie.push(source.slice(i + 1, j));
      i = j + 1;
      precedent = '/';
      continue;
    }
    if (!/\s/.test(c)) precedent = c;
    i++;
  }
  return sortie.map((l) => l.replace(/\\./g, ' ').replace(/\{[^}]*\}/g, ' '));
}


describe('séparation des lots : regles.ts', () => {
  const corpus = lireCorpus();
  const vocabulaire = (lot: 'dev' | 'test' | 'test2'): string[] =>
    lireCorpusDuLot(lot).filter((l) => l.lot === lot).flatMap((l) => mots(l.commande));
  const dev = vocabulaire('dev');
  const test = vocabulaire('test');
  const test2 = vocabulaire('test2');
  const source = readFileSync(new URL('../chat/regles.ts', import.meta.url), 'utf8');
  const attesteEn = (lexique: readonly string[], radical: string): boolean => lexique.some((m) => m.startsWith(radical));

  it('aucun mot des règles ne vient seulement du lot test', () => {
    const radicaux = [...new Set(litteraux(source).flatMap(mots))];
    const fuites = radicaux.filter(
      (r) => !attesteEn(dev, r) && attesteEn(test, r) && !Object.hasOwn(EXCEPTIONS, r),
    );
    expect(fuites).toEqual([]);
  });

  it('aucun mot des règles ne vient seulement du lot test2 (lot tenu à l’écart)', () => {
    const radicaux = [...new Set(litteraux(source).flatMap(mots))];
    const fuites = radicaux.filter(
      (r) => !attesteEn(dev, r) && attesteEn(test2, r) && !Object.hasOwn(EXCEPTIONS, r),
    );
    expect(fuites).toEqual([]);
  });

  it('les tests unitaires des règles ne reprennent aucune commande exacte du lot test', () => {
    const forme = (s: string): string =>
      s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const exactes = new Set(
      [...corpus.filter((l) => l.lot === 'test'), ...lireCorpusDuLot('test2')].map((l) => forme(l.commande)),
    );
    const tests = readFileSync(new URL('../chat/regles.test.ts', import.meta.url), 'utf8');
    const reprises = litteraux(tests)
      .flatMap((l) => l.split('\n'))
      .map(forme)
      .filter((f) => f !== '' && exactes.has(f));
    expect(reprises).toEqual([]);
  });

  it('le détecteur voit les littéraux et ignore les commentaires', () => {
    const exemple = "// ignoré zzzun\nconst a = /\\bzzzdeux\\w+/; const b = 'zzztrois quatre'; /* zzzcinq */";
    const lus = litteraux(exemple).flatMap(mots);
    expect(lus).toContain('zzzdeux');
    expect(lus).toContain('zzztrois');
    expect(lus).not.toContain('zzzun');
    expect(lus).not.toContain('zzzcinq');
  });

  it('chaque exception est justifiée et encore utile', () => {
    for (const [mot, motif] of Object.entries(EXCEPTIONS)) {
      expect(motif.length).toBeGreaterThan(10);
      expect(litteraux(source).flatMap(mots).includes(mot)).toBe(true);
    }
  });
});
