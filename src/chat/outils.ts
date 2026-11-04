/**
 * Outils offerts au chat : une entrée par action cible du corpus `docs/v1.1`. Chaque outil a une
 * description française et un schéma JSON des paramètres (utilisable tel quel comme définition
 * d'outil Ollama : `definitionsOllama`), une validation, et la correspondance vers `src/actions.ts`.
 *
 * Flux : `planifier(decision, etat)` valide les paramètres, résout les noms de personnes en id
 * (sans accents ni casse ; homonyme ou nom absent donne `clarifier`) et calcule la confirmation ;
 * `executerPlan(plan, actions)` exécute ensuite chaque étape par `Actions.executer` seulement :
 * ce fichier n'écrit jamais dans l'état. Un nom reste une donnée, transmise telle quelle, même
 * s'il ressemble à une consigne. La confirmation est calculée ici (`confirmationRequise`), jamais
 * par un modèle ; c'est à l'appelant de la demander avant `executerPlan`.
 */
import type { Actions, CodeRefus, NomAction, Resultat } from '../actions';
import type { Etat } from '../domain/etat';
import { estClarifier, estEtapes, estRefus, formeValide, type Decision, type DecisionAction } from './types';

// --- Schémas ---------------------------------------------------------------

// Note : Ollama ignore `pattern` et `additionalProperties` ; la validation locale (`validerParametres`) suffit.
export interface Propriete {
  readonly type: 'string' | 'boolean' | 'integer';
  readonly description: string;
  readonly enum?: readonly string[];
  /** Expression régulière (source) que la chaîne doit respecter en entier. */
  readonly pattern?: string;
}

export interface SchemaParametres {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, Propriete>>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
}

/** Une étape prête à exécuter : le nom de l'action de `actions.ts` et son appel. */
export interface Etape {
  readonly nom: NomAction;
  executer(actions: Actions): Resultat;
}

export interface Outil {
  readonly nom: string;
  readonly description: string;
  readonly parametres: SchemaParametres;
  /** Noms de personnes à résoudre en id, dans l'ordre attendu par `construire`. */
  noms(params: Readonly<Record<string, unknown>>): string[];
  /** `null` : outil sans exécution (refusé avec le code `indisponible`). */
  construire: ((params: Readonly<Record<string, unknown>>, ids: readonly string[]) => Etape) | null;
}

function etape(nom: NomAction, appel: (actions: Actions) => Resultat): Etape {
  return { nom, executer: appel };
}

const SANS_PARAMETRE: SchemaParametres = { type: 'object', properties: {}, required: [], additionalProperties: false };
const schema = (properties: Record<string, Propriete>): SchemaParametres => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const NOM_PERSONNE: Propriete = { type: 'string', description: 'Nom de la personne, tel qu’il figure dans la liste' };
const COULEUR_HEX = '#[0-9a-fA-F]{6}';

const str = (p: Readonly<Record<string, unknown>>, cle: string): string => String(p[cle]);

export const OUTILS: readonly Outil[] = [
  {
    nom: 'ajouter',
    description: 'Ajoute une personne à la fin de la liste',
    parametres: schema({ nom: { type: 'string', description: 'Nom à ajouter, tel que saisi' } }),
    noms: () => [],
    construire: (p) => etape('ajouter', (a) => a.executer('ajouter', { nom: str(p, 'nom') })),
  },
  {
    nom: 'coller',
    description: 'Ajoute plusieurs personnes (un nom par ligne, virgules et points-virgules acceptés)',
    parametres: schema({ texte: { type: 'string', description: 'Liste de noms à ajouter' } }),
    noms: () => [],
    construire: (p) => etape('coller', (a) => a.executer('coller', { texte: str(p, 'texte') })),
  },
  {
    nom: 'renommer',
    description: 'Renomme une personne de la liste',
    parametres: schema({ nom: NOM_PERSONNE, nouveau: { type: 'string', description: 'Nouveau nom, tel que saisi' } }),
    noms: (p) => [str(p, 'nom')],
    construire: (p, [id]) => etape('renommer', (a) => a.executer('renommer', { id: id ?? '', nom: str(p, 'nouveau') })),
  },
  {
    nom: 'supprimer',
    description: 'Retire une personne de la liste',
    parametres: schema({ nom: NOM_PERSONNE }),
    noms: (p) => [str(p, 'nom')],
    construire: (_p, [id]) => etape('supprimer', (a) => a.executer('supprimer', { id: id ?? '' })),
  },
  {
    nom: 'definirCouleur',
    description: 'Donne une couleur à une personne, sans toucher aux autres',
    parametres: schema({
      nom: NOM_PERSONNE,
      couleur: { type: 'string', description: 'Couleur au format #RRGGBB', pattern: COULEUR_HEX },
    }),
    noms: (p) => [str(p, 'nom')],
    construire: (p, [id]) =>
      etape('definirCouleur', (a) => a.executer('definirCouleur', { id: id ?? '', couleur: str(p, 'couleur') })),
  },
  {
    nom: 'reinitialiserCouleur',
    description: 'Rend à une personne sa couleur par défaut',
    parametres: schema({ nom: NOM_PERSONNE }),
    noms: (p) => [str(p, 'nom')],
    construire: (_p, [id]) => etape('reinitialiserCouleur', (a) => a.executer('reinitialiserCouleur', { id: id ?? '' })),
  },
  {
    nom: 'reinitialiserCouleurs',
    description: 'Rend à toutes les personnes leur couleur par défaut',
    parametres: SANS_PARAMETRE,
    noms: () => [],
    construire: () => etape('reinitialiserCouleurs', (a) => a.executer('reinitialiserCouleurs', {})),
  },
  {
    nom: 'lancer',
    description: 'Lance la roue ; le gagnant est tiré par l’application, jamais par le chat',
    parametres: SANS_PARAMETRE,
    noms: () => [],
    construire: () => etape('lancer', (a) => a.executer('lancer', {})),
  },
  {
    nom: 'afficherCadeauSuivant',
    description: 'Affiche le prochain cadeau à attribuer',
    parametres: SANS_PARAMETRE,
    noms: () => [],
    construire: () => etape('afficherCadeauSuivant', (a) => a.executer('afficherCadeauSuivant', {})),
  },
  {
    nom: 'ajouterCadeau',
    description: 'Ajoute un cadeau à la fin de la liste des cadeaux',
    parametres: schema({ nom: { type: 'string', description: 'Nom du cadeau, tel que saisi' } }),
    noms: () => [],
    construire: (p) => etape('ajouterCadeau', (a) => a.executer('ajouterCadeau', { nom: str(p, 'nom') })),
  },
  {
    nom: 'annulerDernierTirage',
    description: 'Annule le dernier tirage de l’historique',
    parametres: SANS_PARAMETRE,
    noms: () => [],
    construire: () => etape('annulerDernierTirage', (a) => a.executer('annulerDernierTirage', {})),
  },
  {
    nom: 'effacerHistorique',
    description: 'Efface tout l’historique des tirages',
    parametres: SANS_PARAMETRE,
    noms: () => [],
    construire: () => etape('effacerHistorique', (a) => a.executer('effacerHistorique', {})),
  },
  {
    nom: 'retirerGagnants',
    description: 'Coche ou décoche « Retirer les gagnants de la roue »',
    parametres: schema({ actif: { type: 'boolean', description: 'Vrai pour retirer les gagnants de la roue' } }),
    noms: () => [],
    construire: (p) =>
      etape('definirRetirerGagnants', (a) => a.executer('definirRetirerGagnants', { valeur: p['actif'] === true })),
  },
  {
    nom: 'basculerRendu',
    description: 'Choisit le rendu de la roue : relief (3d) ou plat (2d)',
    parametres: schema({ mode: { type: 'string', description: 'Rendu voulu', enum: ['2d', '3d'] } }),
    noms: () => [],
    construire: (p) => etape('basculerRendu', (a) => a.executer('basculerRendu', { mode: p['mode'] === '2d' ? '2d' : '3d' })),
  },
  {
    nom: 'couperSon',
    description: 'Coupe ou rétablit le son',
    parametres: schema({ coupe: { type: 'boolean', description: 'Vrai pour couper le son, faux pour le rétablir' } }),
    noms: () => [],
    construire: (p) => etape('couperSon', (a) => a.executer('couperSon', { coupe: p['coupe'] === true })),
  },
  {
    nom: 'exporter',
    description: 'Télécharge la liste, les cadeaux et l’historique dans un fichier',
    parametres: SANS_PARAMETRE,
    noms: () => [],
    construire: () => etape('exporter', (a) => a.executer('exporter', {})),
  },
  {
    nom: 'modeProjection',
    description: 'Active ou désactive le mode projection (pas encore disponible)',
    parametres: schema({ actif: { type: 'boolean', description: 'Vrai pour activer le mode projection' } }),
    noms: () => [],
    construire: null,
  },
];

const PAR_NOM: ReadonlyMap<string, Outil> = new Map(OUTILS.map((o) => [o.nom, o]));

/** Définitions au format d'outils d'Ollama (`/api/chat`, champ `tools`). */
export function definitionsOllama(): { type: 'function'; function: { name: string; description: string; parameters: SchemaParametres } }[] {
  return OUTILS.map((o) => ({
    type: 'function',
    function: { name: o.nom, description: o.description, parameters: o.parametres },
  }));
}

// --- Validation ------------------------------------------------------------

/** Message d'erreur si les paramètres ne respectent pas le schéma, `null` sinon. */
export function validerParametres(schemaOutil: SchemaParametres, params: unknown): string | null {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return 'paramètres : objet attendu';
  const valeurs = params as Record<string, unknown>;
  for (const cle of Object.keys(valeurs)) {
    if (!Object.hasOwn(schemaOutil.properties, cle)) return `paramètre inconnu : ${cle}`;
  }
  for (const cle of schemaOutil.required) {
    if (!Object.hasOwn(valeurs, cle)) return `paramètre manquant : ${cle}`;
  }
  for (const [cle, propriete] of Object.entries(schemaOutil.properties)) {
    if (!Object.hasOwn(valeurs, cle)) continue;
    const valeur = valeurs[cle];
    const typeOk =
      propriete.type === 'string'
        ? typeof valeur === 'string'
        : propriete.type === 'boolean'
          ? typeof valeur === 'boolean'
          : Number.isInteger(valeur);
    if (!typeOk) return `${cle} : type ${propriete.type} attendu`;
    if (propriete.enum && !propriete.enum.includes(valeur as string)) return `${cle} : valeur hors de la liste`;
    if (propriete.pattern && !new RegExp(`^(?:${propriete.pattern})$`).test(valeur as string)) {
      return `${cle} : format invalide`;
    }
  }
  return null;
}

// --- Noms ------------------------------------------------------------------

/** Forme de comparaison d'un nom : sans accents, sans casse, espaces réduits. */
export function formeComparable(nom: string): string {
  return nom.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/gu, ' ');
}

function distance(a: string, b: string): number {
  let ligne = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const suivante = [i];
    for (let j = 1; j <= b.length; j++) {
      suivante[j] = Math.min(
        (ligne[j] ?? 0) + 1,
        (suivante[j - 1] ?? 0) + 1,
        (ligne[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    ligne = suivante;
  }
  return ligne[b.length] ?? 0;
}

/** Noms de la liste proches d'un nom absent : l'un contient l'autre (3 lettres au moins), ou 1 faute (2 au-delà de 5 lettres). */
function voisins(nom: string, etat: Etat): string[] {
  const cible = formeComparable(nom);
  const vus = new Set<string>();
  const proches: string[] = [];
  for (const p of etat.participants) {
    const forme = formeComparable(p.nom);
    if (vus.has(forme)) continue;
    const contenu = Math.min(forme.length, cible.length) >= 3 && (forme.includes(cible) || cible.includes(forme));
    const seuil = Math.max(forme.length, cible.length) > 5 ? 2 : 1;
    if (contenu || distance(forme, cible) <= seuil) {
      vus.add(forme);
      proches.push(p.nom);
    }
  }
  return proches;
}

// --- Plan ------------------------------------------------------------------

export type Plan =
  | { readonly genre: 'etapes'; readonly etapes: readonly Etape[]; readonly confirmation: boolean }
  | { readonly genre: 'clarifier'; readonly candidats: readonly string[] }
  | { readonly genre: 'refuser'; readonly code: string };

const refuser = (code: string): Plan => ({ genre: 'refuser', code });

function etapesDe(decision: Decision): readonly DecisionAction[] {
  if (estEtapes(decision)) return decision.actions;
  if (estRefus(decision) || estClarifier(decision)) return [];
  return [decision as DecisionAction];
}

/** Vrai pour `effacerHistorique`, `reinitialiserCouleurs` et plusieurs suppressions de personnes. */
export function confirmationRequise(decision: Decision): boolean {
  if (!formeValide(decision)) return false;
  const etapes = etapesDe(decision);
  const suppressions = etapes.filter((e) => e.action === 'supprimer').length;
  return suppressions >= 2 || etapes.some((e) => e.action === 'effacerHistorique' || e.action === 'reinitialiserCouleurs');
}

/** Actions qui font disparaître ou changer le nom visé : une autre étape sur la même personne n'aurait plus de sens. */
const CHANGE_LA_CIBLE: ReadonlySet<string> = new Set(['supprimer', 'renommer']);

/**
 * Valide la décision (forme comprise : la sortie d'un modèle n'est pas fiable) et la transforme en
 * plan. Les noms sont résolus contre `etat.participants` :
 * - plusieurs personnes du même nom donnent `clarifier`, sauf la demande explicite de chacune
 *   (« supprime les deux Marie » : autant d'étapes `supprimer` que d'homonymes, rien d'autre) ;
 * - deux étapes sur la même personne, dont une la supprime ou la renomme, sont refusées
 *   (`conflit-etapes`).
 */
export function planifier(decision: Decision, etat: Etat): Plan {
  if (!formeValide(decision)) return refuser('forme-invalide');
  if (estEtapes(decision) && decision.actions.length === 0) return refuser('incompris');
  if (estRefus(decision)) return refuser(decision.code ?? 'incompris');
  if (estClarifier(decision)) {
    return { genre: 'clarifier', candidats: decision.candidats };
  }
  const demandes: { outil: Outil; params: Readonly<Record<string, unknown>> }[] = [];
  for (const appel of etapesDe(decision)) {
    const outil = PAR_NOM.get(appel.action);
    if (!outil) return refuser('action-inconnue');
    const params = appel.params ?? {};
    if (validerParametres(outil.parametres, params) !== null) return refuser('parametres-invalides');
    if (outil.construire === null) return refuser('indisponible');
    demandes.push({ outil, params });
  }

  // Outils des étapes qui visent chaque nom, pour distinguer « les deux Marie » de « Marie ».
  const visees = new Map<string, string[]>();
  for (const { outil, params } of demandes) {
    for (const nom of outil.noms(params)) {
      const forme = formeComparable(nom);
      visees.set(forme, [...(visees.get(forme) ?? []), outil.nom]);
    }
  }
  const utilises = new Map<string, string[]>();
  const etapes: Etape[] = [];
  for (const { outil, params } of demandes) {
    const ids: string[] = [];
    for (const nom of outil.noms(params)) {
      const forme = formeComparable(nom);
      const trouves = etat.participants.filter((p) => formeComparable(p.nom) === forme);
      if (trouves.length === 0) {
        const proches = voisins(nom, etat);
        return proches.length > 0 ? { genre: 'clarifier', candidats: proches } : refuser('nom-absent');
      }
      let choisi = trouves[0];
      if (trouves.length > 1) {
        const outils = visees.get(forme) ?? [];
        if (outils.length !== trouves.length || outils.some((o) => o !== 'supprimer')) {
          return { genre: 'clarifier', candidats: trouves.map((p) => p.nom) };
        }
        choisi = trouves.find((p) => !utilises.has(p.id));
      }
      if (!choisi) return refuser('nom-absent');
      const avant = utilises.get(choisi.id) ?? [];
      if (avant.length > 0 && [...avant, outil.nom].some((o) => CHANGE_LA_CIBLE.has(o))) return refuser('conflit-etapes');
      utilises.set(choisi.id, [...avant, outil.nom]);
      ids.push(choisi.id);
    }
    // `construire` n'est jamais null ici : testé plus haut.
    etapes.push(outil.construire?.(params, ids) as Etape);
  }
  return { genre: 'etapes', etapes, confirmation: confirmationRequise(decision) };
}

// --- Exécution -------------------------------------------------------------

export interface ResultatExecution {
  readonly resultats: readonly Resultat[];
  /** Code du premier refus d'`actions.ts`, sinon `null`. En cas de refus, aucune étape n'a été appliquée. */
  readonly refus: CodeRefus | null;
}

/**
 * Exécute le plan en tout ou rien, par `Actions.executer` seulement : les étapes sont d'abord
 * essayées à blanc (`Actions.essayer`, copie de l'état) ; au premier refus, rien n'est appliqué et
 * `resultats` s'arrête à l'étape refusée ; sinon elles sont appliquées dans l'ordre.
 */
export function executerPlan(etapes: readonly Etape[], actions: Actions): ResultatExecution {
  const essai = actions.essayer();
  const simules: Resultat[] = [];
  for (const e of etapes) {
    const resultat = e.executer(essai);
    simules.push(resultat);
    if (!resultat.ok) return { resultats: simules, refus: resultat.code };
  }
  return { resultats: etapes.map((e) => e.executer(actions)), refus: null };
}
