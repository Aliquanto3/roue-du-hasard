// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { creerActions, creerMagasin, type Actions } from '../actions';
import { creerCascade } from './cascade';
import { creerInspection } from './inspection';
import { avisIndisponibilite, creerControleur, modeleIndisponible, type Controleur } from './controleur';
import { TEXTES_CHAT } from './textes';
import type { Decision, DecisionAction, EtatChat, Etage, RaisonIndisponible } from './types';

interface Banc {
  c: Controleur;
  actions: Actions;
  noms(): string[];
  historique(): number;
  rotation: { active: boolean };
  vus: EtatChat[];
}

/** Étage scripté : rend la décision associée à la commande (frontière externe : le moteur de décision). */
function etageScripte(
  script: Record<string, Decision>,
  vus: EtatChat[],
  lent: { attente: Promise<void> | null },
): Etage {
  return {
    nom: 'regles',
    async decider(commande, etat, signal) {
      vus.push(etat);
      if (lent.attente) await lent.attente;
      if (signal.aborted) return null;
      const decision = script[commande];
      return decision ? { decision, trace: { entree: commande, sortie: null } } : null;
    },
  };
}

function banc(script: Record<string, Decision>, noms: readonly string[] = [], extra: Etage[] = []): Banc {
  const magasin = creerMagasin();
  const rotation = { active: false };
  const actions = creerActions({
    magasin,
    enRotation: () => rotation.active,
    lancer: () => {
      rotation.active = true;
    },
    tirer: () => 0,
  });
  for (const nom of noms) actions.executer('ajouter', { nom });
  const vus: EtatChat[] = [];
  const lent: { attente: Promise<void> | null } = { attente: null };
  const cascade = creerCascade({
    etages: [etageScripte(script, vus, lent), ...extra],
  });
  const c = creerControleur({
    cascade,
    actions,
    enRotation: () => rotation.active,
  });
  return {
    c,
    actions,
    noms: () => magasin.lire().participants.map((p) => p.nom),
    historique: () => magasin.lire().historique.length,
    rotation,
    vus,
  };
}

const appel = (action: string, params: Record<string, unknown> = {}): DecisionAction => ({ action, params });
const textes = (b: Banc): string[] => b.c.etat().messages.map((m) => m.texte);

describe('controleur du panneau', () => {
  it('plan à étapes sans confirmation : exécuté tout de suite', async () => {
    const b = banc({ 'ajoute Léo': appel('ajouter', { nom: 'Léo' }) });
    await b.c.envoyer('ajoute Léo');
    expect(b.noms()).toEqual(['Léo']);
    expect(textes(b)).toEqual(['ajoute Léo', TEXTES_CHAT.fait]);
    expect(b.c.etat().attente).toBeNull();
    expect(b.c.etat().occupe).toBe(false);
  });

  it('plan à confirmation : carte, puis exécution à la confirmation', async () => {
    const b = banc(
      {
        'efface tout': {
          actions: [appel('supprimer', { nom: 'Ana' }), appel('supprimer', { nom: 'Bob' })],
        },
      },
      ['Ana', 'Bob', 'Cy'],
    );
    await b.c.envoyer('efface tout');
    expect(b.noms()).toEqual(['Ana', 'Bob', 'Cy']);
    expect(b.c.etat().attente).toEqual({
      genre: 'confirmer',
      recapitulatif: ['Supprimer : Ana', 'Supprimer : Bob'],
    });
    expect(textes(b).at(-1)).toBe(TEXTES_CHAT.confirmer);
    b.c.confirmer();
    expect(b.noms()).toEqual(['Cy']);
    expect(textes(b).at(-1)).toBe(TEXTES_CHAT.fait);
    expect(b.c.etat().attente).toBeNull();
  });

  it('confirmation refusée : rien ne change', async () => {
    const b = banc({ 'vide l’historique': appel('effacerHistorique') }, ['Ana', 'Bob']);
    await b.c.envoyer('vide l’historique');
    expect(b.c.etat().attente).toEqual({
      genre: 'confirmer',
      recapitulatif: ['Effacer l’historique'],
    });
    b.c.annuler();
    expect(textes(b).at(-1)).toBe(TEXTES_CHAT.commandeAnnulee);
    expect(b.c.etat().attente).toBeNull();
    b.c.confirmer();
    expect(textes(b).at(-1)).toBe(TEXTES_CHAT.commandeAnnulee);
  });

  it('clarifier : candidats en boutons, le choix remplace le nom', async () => {
    const b = banc({ 'supprime Mari': appel('supprimer', { nom: 'Mari' }) }, ['Marie', 'Marion', 'Paul']);
    await b.c.envoyer('supprime Mari');
    expect(b.c.etat().attente).toEqual({
      genre: 'clarifier',
      candidats: ['Marie', 'Marion'],
    });
    expect(textes(b).at(-1)).toBe('De qui parlez-vous : Marie ou Marion ?');
    b.c.choisir('Marion');
    expect(b.noms()).toEqual(['Marie', 'Paul']);
    expect(textes(b).at(-1)).toBe(TEXTES_CHAT.fait);
    expect(b.c.etat().attente).toBeNull();
  });

  it('clarifier sur des homonymes identiques : un seul bouton, puis message d’ambiguïté', async () => {
    const b = banc({ 'supprime Marie': appel('supprimer', { nom: 'Marie' }) }, ['Marie', 'Marie']);
    await b.c.envoyer('supprime Marie');
    expect(b.c.etat().attente).toEqual({
      genre: 'clarifier',
      candidats: ['Marie'],
    });
    b.c.choisir('Marie');
    expect(b.noms()).toEqual(['Marie', 'Marie']);
    expect(textes(b).at(-1)).toBe(TEXTES_CHAT.ambigu);
  });

  it('clarification d’un étage : la commande est reprise avec le nom choisi', async () => {
    const b = banc(
      {
        'supprime la première': {
          action: 'clarifier',
          candidats: ['Ana', 'Bob'],
        },
        'supprime la première Bob': appel('supprimer', { nom: 'Bob' }),
      },
      ['Ana', 'Bob'],
    );
    await b.c.envoyer('supprime la première');
    b.c.choisir('Bob');
    await new Promise((r) => setTimeout(r, 0));
    expect(b.noms()).toEqual(['Ana']);
  });

  it('refus en rotation : même message que l’interface, aucune modification', async () => {
    const b = banc(
      {
        'ajoute Léo': appel('ajouter', { nom: 'Léo' }),
        lance: appel('lancer'),
      },
      ['Ana', 'Bob'],
    );
    await b.c.envoyer('lance');
    expect(b.rotation.active).toBe(true);
    await b.c.envoyer('ajoute Léo');
    expect(b.noms()).toEqual(['Ana', 'Bob']);
    expect(textes(b).at(-1)).toBe('Rotation en cours : la liste ne peut pas être modifiée.');
  });

  it('refus du lancement avec moins de 2 noms et du tirage de cadeaux épuisés', async () => {
    const b = banc({ lance: appel('lancer') }, ['Ana']);
    await b.c.envoyer('lance');
    expect(textes(b).at(-1)).toBe('Il faut au moins deux noms pour lancer la roue.');
    expect(b.rotation.active).toBe(false);
  });

  it('codes de l’étage règles : verrou de rotation et lancement à moins de 2 noms', async () => {
    const b = banc(
      {
        'lance la roue': { action: 'refuser', code: 'verrouille' },
        tourne: { action: 'refuser', code: 'indisponible' },
      },
      ['Ana'],
    );
    await b.c.envoyer('lance la roue');
    expect(textes(b).at(-1)).toBe('Rotation en cours : la liste ne peut pas être modifiée.');
    await b.c.envoyer('tourne');
    expect(textes(b).at(-1)).toBe('Il faut au moins deux noms pour lancer la roue.');
  });

  it('refus d’un étage sans message propre : texte dédié, jamais « incompris »', async () => {
    const b = banc({ truque: { action: 'refuser', code: 'truquage' } });
    await b.c.envoyer('truque');
    expect(textes(b).at(-1)).toBe('Le tirage ne se truque pas : la roue décide seule.');
  });

  it('commande non comprise : refus lisible', async () => {
    const b = banc({});
    await b.c.envoyer('blabla');
    expect(textes(b).at(-1)).toBe(TEXTES_CHAT.refusChat('incompris'));
  });

  it('refus d’un étage : le code est traduit', async () => {
    const b = banc({ x: { action: 'refuser', code: 'nom-absent' } });
    await b.c.envoyer('x');
    expect(textes(b).at(-1)).toBe('Je ne trouve personne de ce nom dans la liste.');
  });

  it('un nom hostile reste une donnée, rendue telle quelle dans le fil', async () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const b = banc({ 'ajoute hostile': appel('ajouter', { nom: hostile }) });
    await b.c.envoyer('ajoute hostile');
    expect(b.noms()).toEqual([hostile]);
    const c = banc({
      'supprime hostile': appel('supprimer', { nom: hostile }),
      'ajoute hostile': appel('ajouter', { nom: hostile }),
    });
    await c.c.envoyer('ajoute hostile');
    await c.c.envoyer('ajoute hostile');
    await c.c.envoyer('supprime hostile');
    expect(c.c.etat().attente).toEqual({
      genre: 'clarifier',
      candidats: [hostile],
    });
    expect(textes(c).at(-1)).toBe(`De qui parlez-vous : ${hostile} ?`);
  });

  it('une nouvelle commande annule la précédente : sa décision est ignorée', async () => {
    let debloquer = (): void => undefined;
    const attente = new Promise<void>((r) => {
      debloquer = r;
    });
    const vus: EtatChat[] = [];
    const lent = { attente: attente as Promise<void> | null };
    const magasin = creerMagasin();
    const actions = creerActions({
      magasin,
      enRotation: () => false,
      lancer: () => undefined,
      tirer: () => 0,
    });
    const script = {
      premiere: appel('ajouter', { nom: 'Un' }),
      seconde: appel('ajouter', { nom: 'Deux' }),
    };
    const cascade = creerCascade({ etages: [etageScripte(script, vus, lent)] });
    const c = creerControleur({ cascade, actions, enRotation: () => false });
    const p1 = c.envoyer('premiere');
    expect(c.etat().occupe).toBe(true);
    lent.attente = null;
    const p2 = c.envoyer('seconde');
    debloquer();
    await Promise.all([p1, p2]);
    expect(magasin.lire().participants.map((p) => p.nom)).toEqual(['Deux']);
    expect(c.etat().messages.map((m) => m.texte)).toEqual(['premiere', 'seconde', TEXTES_CHAT.fait]);
    expect(c.etat().occupe).toBe(false);
  });

  it('fermer annule la commande en cours et oublie l’attente', async () => {
    let debloquer = (): void => undefined;
    const attente = new Promise<void>((r) => {
      debloquer = r;
    });
    const magasin = creerMagasin();
    const actions = creerActions({
      magasin,
      enRotation: () => false,
      lancer: () => undefined,
      tirer: () => 0,
    });
    const cascade = creerCascade({
      etages: [etageScripte({ a: appel('ajouter', { nom: 'Un' }) }, [], { attente })],
    });
    const c = creerControleur({ cascade, actions, enRotation: () => false });
    const p = c.envoyer('a');
    c.fermer();
    expect(c.etat().occupe).toBe(false);
    debloquer();
    await p;
    expect(magasin.lire().participants).toHaveLength(0);
    expect(c.etat().messages.map((m) => m.texte)).toEqual(['a']);
  });

  it('l’état du chat est reconstruit à chaque commande depuis le domaine', async () => {
    const b = banc(
      {
        'ajoute Cy': appel('ajouter', { nom: 'Cy' }),
        noop: { action: 'refuser' },
      },
      ['Ana', 'Bob'],
    );
    await b.c.envoyer('ajoute Cy');
    await b.c.envoyer('noop');
    expect(b.vus[0]).toEqual({
      noms: ['Ana', 'Bob'],
      cadeaux: [],
      rotation: false,
      historique: [],
    });
    expect(b.vus[1]?.noms).toEqual(['Ana', 'Bob', 'Cy']);
    expect(b.vus[1]?.historique).toEqual([{ commande: 'ajoute Cy', reponse: TEXTES_CHAT.fait }]);
  });

  it('prochainCadeau est cadeaux[attribues] et rotation vient de la roue', async () => {
    const magasin = creerMagasin();
    const rotation = { active: true };
    const actions = creerActions({
      magasin,
      enRotation: () => rotation.active,
      lancer: () => undefined,
      tirer: () => 0,
    });
    rotation.active = false;
    actions.executer('ajouterCadeau', { nom: 'bougie' });
    actions.executer('ajouterCadeau', { nom: 'plaid' });
    rotation.active = true;
    const vus: EtatChat[] = [];
    const c = creerControleur({
      cascade: creerCascade({
        etages: [etageScripte({}, vus, { attente: null })],
      }),
      actions,
      enRotation: () => rotation.active,
    });
    await c.envoyer('?');
    expect(vus[0]).toMatchObject({
      cadeaux: ['bougie', 'plaid'],
      rotation: true,
      prochainCadeau: 'bougie',
    });
  });

  it('l’historique ne garde que les 3 derniers échanges', async () => {
    const b = banc({ a: { action: 'refuser' } });
    for (let i = 0; i < 5; i++) await b.c.envoyer('a');
    expect(b.vus[4]?.historique).toHaveLength(3);
  });

  it('afficher le cadeau suivant répond avec le libellé', async () => {
    const b = banc({ suivant: appel('afficherCadeauSuivant') }, ['Ana']);
    await b.c.envoyer('suivant');
    expect(textes(b).at(-1)).toBe(TEXTES_CHAT.cadeauSuivant(null));
  });

  describe('avis d’indisponibilité', () => {
    const slm = (etat: string): Etage & { etat(): string } => ({
      nom: 'slm',
      etat: () => etat,
      decider: () => Promise.resolve(null),
    });

    it('affiché une seule fois, avec la consigne Ollama', async () => {
      const b = banc({}, [], [slm('indisponible')]);
      expect(b.c.etat().avis).toBeNull();
      await b.c.envoyer('a');
      const avis = b.c.etat().avis;
      expect(avis).toBe(TEXTES_CHAT.avisIndisponible);
      expect(avis).toContain('OLLAMA_ORIGINS=http://localhost:5200');
      await b.c.envoyer('b');
      expect(b.c.etat().avis).toBe(avis);
      // Jamais dans le fil : une erreur à chaque message serait du bruit.
      expect(textes(b).filter((t) => t === avis)).toEqual([]);
    });

    it('absent quand le modèle est disponible ou inconnu', async () => {
      const b = banc({}, [], [slm('disponible')]);
      await b.c.envoyer('a');
      expect(b.c.etat().avis).toBeNull();
      expect(modeleIndisponible([slm('inconnu')])).toBe(false);
    });

    it('ignore les étages sans `etat` et ceux qui ne sont ni SLM ni décision', () => {
      const sansEtat: Etage = {
        nom: 'slm',
        decider: () => Promise.resolve(null),
      };
      const autre: Etage & { etat(): string } = {
        ...slm('indisponible'),
        nom: 'regles',
      };
      expect(modeleIndisponible([sansEtat, autre])).toBe(false);
      expect(modeleIndisponible([{ ...slm('indisponible'), nom: 'decision' }])).toBe(true);
    });
  });

  describe('carte de confirmation périmée', () => {
    const supprimeDeux = {
      supprime: { actions: [appel('supprimer', { nom: 'Ana' }), appel('supprimer', { nom: 'Bob' })] },
    };

    it('renommage manuel après la carte : rien n’est supprimé', async () => {
      const b = banc(supprimeDeux, ['Ana', 'Bob', 'Cy']);
      await b.c.envoyer('supprime');
      const id = b.actions.magasin.lire().participants[0]?.id ?? '';
      b.actions.executer('renommer', { id, nom: 'Zoé' });
      b.c.confirmer();
      expect(b.noms()).toEqual(['Zoé', 'Bob', 'Cy']);
      expect(textes(b).at(-1)).toBe(TEXTES_CHAT.confirmationPerimee);
      expect(b.c.etat().attente).toBeNull();
    });

    it('tirage manuel après la carte d’effacement : l’historique est conservé', async () => {
      const b = banc({ vide: appel('effacerHistorique') }, ['Ana', 'Bob']);
      await b.c.envoyer('vide');
      b.actions.executer('enregistrerTirage', { index: 0 });
      expect(b.historique()).toBe(1);
      b.c.confirmer();
      expect(b.historique()).toBe(1);
      expect(textes(b).at(-1)).toBe(TEXTES_CHAT.confirmationPerimee);
    });

    it('carte à jour : exécutée une fois, la double confirmation est sans effet', async () => {
      const b = banc(supprimeDeux, ['Ana', 'Bob', 'Cy']);
      await b.c.envoyer('supprime');
      b.c.confirmer();
      b.c.confirmer();
      expect(b.noms()).toEqual(['Cy']);
      expect(textes(b)).toEqual(['supprime', TEXTES_CHAT.confirmer, TEXTES_CHAT.fait]);
    });

    it('nouvelle commande avec une carte ouverte : carte annulée avec un message', async () => {
      const b = banc({ ...supprimeDeux, 'ajoute Léo': appel('ajouter', { nom: 'Léo' }) }, ['Ana', 'Bob', 'Cy']);
      await b.c.envoyer('supprime');
      await b.c.envoyer('ajoute Léo');
      expect(textes(b)).toEqual([
        'supprime',
        TEXTES_CHAT.confirmer,
        TEXTES_CHAT.confirmationAbandonnee,
        'ajoute Léo',
        TEXTES_CHAT.fait,
      ]);
      expect(b.c.etat().attente).toBeNull();
      expect(b.noms()).toEqual(['Ana', 'Bob', 'Cy', 'Léo']);
    });
  });

  describe('avis d’indisponibilité selon la raison', () => {
    const slmRaison = (raison: RaisonIndisponible): Etage => ({
      nom: 'slm',
      decider: () => Promise.resolve(null),
      ...{ etat: () => 'indisponible', raisonIndisponible: () => raison },
    });

    it('modèle absent : nom du modèle et ollama pull', () => {
      const avis = avisIndisponibilite([slmRaison({ code: 'modele-absent', detail: 'modèle qwen3:4b non installé (404)', modele: 'qwen3:4b' })]);
      expect(avis).toBe(TEXTES_CHAT.avisModeleAbsent('qwen3:4b'));
      expect(avis).toContain('ollama pull qwen3:4b');
      expect(avis).not.toContain('OLLAMA_ORIGINS');
    });

    it('Ollama injoignable ou 403 : consigne OLLAMA_ORIGINS', () => {
      expect(avisIndisponibilite([slmRaison({ code: 'ollama-absent', detail: 'Ollama injoignable : x' })])).toBe(TEXTES_CHAT.avisIndisponible);
      expect(avisIndisponibilite([slmRaison({ code: 'origine-refusee', detail: 'accès refusé (403)' })])).toBe(
        TEXTES_CHAT.avisIndisponible,
      );
    });
  });
});

describe('enregistrement pour la fenêtre d’inspection (5.7)', () => {
  function avecInspection(script: Record<string, Decision>, noms: readonly string[] = []) {
    const magasin = creerMagasin();
    const actions = creerActions({ magasin, enRotation: () => false, lancer: () => undefined, tirer: () => 0 });
    for (const nom of noms) actions.executer('ajouter', { nom });
    const memoire = new Map<string, string>();
    const stockage = {
      getItem: (k: string) => memoire.get(k) ?? null,
      setItem: (k: string, v: string) => void memoire.set(k, v),
      removeItem: (k: string) => void memoire.delete(k),
    };
    const inspection = creerInspection({ stockage: () => stockage });
    const etage: Etage = {
      nom: 'regles',
      decider: (commande) => {
        const decision = script[commande];
        return Promise.resolve(decision ? { decision, trace: { entree: commande, sortie: 'regle-x' } } : null);
      },
    };
    const c = creerControleur({
      cascade: creerCascade({ etages: [etage] }),
      actions,
      enRotation: () => false,
      inspection,
    });
    return { c, inspection, actions };
  }

  it('commande exécutée : une entrée avec étage, règle, plan, exécution et état envoyé', async () => {
    const { c, inspection } = avecInspection({ 'ajoute Léo': appel('ajouter', { nom: 'Léo' }) }, ['Ana']);
    await c.envoyer('ajoute Léo');
    const [e] = inspection.entrees();
    expect(inspection.entrees()).toHaveLength(1);
    expect(e).toMatchObject({
      commande: 'ajoute Léo',
      etage: 'regles',
      decision: { action: 'ajouter', params: { nom: 'Léo' } },
      execution: 'execute',
      plan: { genre: 'etapes', confirmation: false },
    });
    expect(e?.etat.noms).toEqual(['Ana']);
    expect(e?.etages[0]).toMatchObject({ etage: 'regles', regle: 'regle-x' });
  });

  it('commande dictée : la transcription brute et la latence du STT sont dans l’entrée, sinon absentes (6.2)', async () => {
    const { c, inspection, actions } = avecInspection({ 'ajoute Léo': appel('ajouter', { nom: 'Léo' }) });
    await c.envoyer('ajoute Léo', { transcription: { brut: ' Ajoute Léo.\n', latenceMs: 165 } });
    // Nom nouveau dicté : jamais ajouté en silence (6.3, C4).
    expect(actions.magasin.lire().participants).toHaveLength(0);
    c.confirmer();
    await c.envoyer('ajoute Léo');
    const [dictee, tapee] = inspection.entrees();
    expect(dictee?.transcription).toEqual({ brut: ' Ajoute Léo.\n', latenceMs: 165 });
    expect(dictee?.execution).toBe('execute');
    expect(tapee?.transcription).toBeUndefined();
    expect(actions.magasin.lire().participants).toHaveLength(2);
  });

  it('commande dictée, prénom mal entendu sous le seuil : commande corrigée montrée avec confirmation, puis exécutée (6.3)', async () => {
    const { c, inspection, actions } = avecInspection({ 'supprime Thibault': appel('supprimer', { nom: 'Thibault' }) }, ['Thibault', 'Léa']);
    await c.envoyer('supprime Thibaut', { transcription: { brut: 'Supprime Thibaut.', latenceMs: 90 } });
    expect(actions.magasin.lire().participants).toHaveLength(2);
    expect(c.etat().attente).toMatchObject({ genre: 'confirmer', recapitulatif: ['Supprimer : Thibault'] });
    expect(c.etat().messages.at(-1)?.texte).toBe(TEXTES_CHAT.vousVouliezDire(['Thibault'], 'supprime Thibault'));
    c.confirmer();
    expect(actions.magasin.lire().participants.map((p) => p.nom)).toEqual(['Léa']);
    const [e] = inspection.entrees();
    expect(e?.commande).toBe('supprime Thibaut');
    expect(e?.execution).toBe('execute');
    expect(e?.transcription?.corrigee).toBe('supprime Thibault');
    expect(e?.transcription?.corrections).toHaveLength(1);
    expect(e?.transcription?.corrections?.[0]).toMatchObject({ avant: 'Thibaut', apres: 'Thibault', appliquee: false });
  });

  it('commande dictée, prénom mal entendu au-dessus du seuil : corrigée, affichée, exécutée sans question (6.3)', async () => {
    const { c, actions } = avecInspection({ 'supprime Paul': appel('supprimer', { nom: 'Paul' }) }, ['Paul', 'Léa']);
    await c.envoyer('supprime pol', { transcription: { brut: 'supprime pol', latenceMs: 90 } });
    expect(c.etat().attente).toBeNull();
    expect(actions.magasin.lire().participants.map((p) => p.nom)).toEqual(['Léa']);
    expect(c.etat().messages.map((m) => m.texte)).toEqual([
      'supprime pol',
      TEXTES_CHAT.commandeCorrigee('supprime Paul'),
      TEXTES_CHAT.fait,
    ]);
  });

  it('commande dictée avec un nom nouveau : confirmation, annulable, jamais ajouté en silence (6.3)', async () => {
    const { c, actions } = avecInspection({ 'ajoute Camille': appel('ajouter', { nom: 'Camille' }) }, ['Ana']);
    await c.envoyer('ajoute Camille', { transcription: { brut: 'ajoute Camille', latenceMs: 90 } });
    expect(c.etat().messages.at(-1)?.texte).toBe(TEXTES_CHAT.nomNouveau(['Camille']));
    expect(c.etat().attente?.genre).toBe('confirmer');
    c.annuler();
    expect(actions.magasin.lire().participants).toHaveLength(1);
    // Tapée, la même commande s'exécute sans question.
    await c.envoyer('ajoute Camille');
    expect(actions.magasin.lire().participants).toHaveLength(2);
  });

  it('commande dictée : « ajoute » d’un nom déjà dans la liste n’est pas un nom nouveau', async () => {
    const { c } = avecInspection({ 'ajoute Ana': appel('ajouter', { nom: 'Ana' }) }, ['Ana']);
    await c.envoyer('ajoute Ana', { transcription: { brut: 'ajoute Ana', latenceMs: 90 } });
    expect(c.etat().attente).toBeNull();
  });

  it('refus du plan : non exécutée ; commande non comprise : refus, aucun étage', async () => {
    const { c, inspection } = avecInspection({ 'supprime Zed': appel('supprimer', { nom: 'Zed' }) }, ['Ana']);
    await c.envoyer('supprime Zed');
    await c.envoyer('blabla');
    const [a, b] = inspection.entrees();
    expect(a).toMatchObject({ execution: 'non-execute', plan: { genre: 'refuser', detail: 'refus : nom-absent' } });
    expect(b).toMatchObject({ etage: null, execution: 'non-execute', decision: { action: 'refuser', code: 'incompris' } });
  });

  it('confirmation : en attente, puis exécutée ou annulée sur la même entrée', async () => {
    const script = { 'vide tout': appel('effacerHistorique'), rien: appel('effacerHistorique') };
    const { c, inspection } = avecInspection(script, ['Ana']);
    await c.envoyer('vide tout');
    expect(inspection.entrees()[0]?.execution).toBe('attente-confirmation');
    expect(inspection.entrees()[0]?.plan.confirmation).toBe(true);
    c.confirmer();
    expect(inspection.entrees()[0]?.execution).toBe('execute');
    await c.envoyer('rien');
    expect(inspection.entrees()[1]?.execution).toBe('attente-confirmation');
    c.annuler();
    expect(inspection.entrees()[1]?.execution).toBe('annule');
    expect(inspection.entrees()).toHaveLength(2);
  });

  it('nouvelle commande pendant une confirmation : l’ancienne entrée est annulée', async () => {
    const { c, inspection } = avecInspection({
      'vide tout': appel('effacerHistorique'),
      'ajoute Léo': appel('ajouter', { nom: 'Léo' }),
    });
    await c.envoyer('vide tout');
    await c.envoyer('ajoute Léo');
    expect(inspection.entrees().map((e) => e.execution)).toEqual(['annule', 'execute']);
  });

  it('confirmation périmée : non exécutée', async () => {
    const { c, inspection, actions } = avecInspection({ 'vide tout': appel('effacerHistorique') }, ['Ana']);
    await c.envoyer('vide tout');
    actions.executer('ajouter', { nom: 'Bob' });
    c.confirmer();
    expect(inspection.entrees()[0]?.execution).toBe('perime');
  });

  it('clarification : l’entrée porte la décision et le plan réellement exécutés, la clarification est gardée', async () => {
    const { c, inspection } = avecInspection({ 'supprime Mari': appel('supprimer', { nom: 'Mari' }) }, ['Marie', 'Marion']);
    await c.envoyer('supprime Mari');
    expect(inspection.entrees()[0]).toMatchObject({ execution: 'attente-precision', plan: { genre: 'clarifier' } });
    c.choisir('Marion');
    const e = inspection.entrees()[0];
    expect(inspection.entrees()).toHaveLength(1);
    expect(e).toMatchObject({
      decision: { action: 'supprimer', params: { nom: 'Marion' } },
      plan: { genre: 'etapes', detail: '1 étape(s)', confirmation: false },
      execution: 'execute',
      clarification: { decision: { action: 'supprimer', params: { nom: 'Mari' } }, plan: { genre: 'clarifier' } },
    });
    expect(e?.clarification?.plan.detail).toBe('clarifier : Marie, Marion');
  });

  it('nouvelle commande pendant une précision attendue : l’entrée est annulée', async () => {
    const { c, inspection } = avecInspection(
      { 'supprime Mari': appel('supprimer', { nom: 'Mari' }), 'ajoute Léo': appel('ajouter', { nom: 'Léo' }) },
      ['Marie', 'Marion'],
    );
    await c.envoyer('supprime Mari');
    await c.envoyer('ajoute Léo');
    expect(inspection.entrees().map((e) => e.execution)).toEqual(['annule', 'execute']);
  });

  it('panneau fermé pendant une confirmation : entrée annulée', async () => {
    const { c, inspection } = avecInspection({ 'vide tout': appel('effacerHistorique') }, ['Ana']);
    await c.envoyer('vide tout');
    c.fermer();
    expect(inspection.entrees()[0]?.execution).toBe('annule');
  });
});
