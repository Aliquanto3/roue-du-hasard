# Run autonome — Roue du hasard V1

Spécification : `docs/spec.md`. Stories : `docs/stories.md`. Statut : `_bmad-output/implementation-artifacts/sprint-status.yaml`.

## Périmètre

| Périmètre | Epics | Note |
|---|---|---|
| Dans le run | Epics 1 à 4 | V1 complète, jusqu'à la release |

Au plus 2 stories en développement à la fois

## Sprint 1 — Socle et roue

| Vague | Stories en parallèle | Après |
|---|---|---|
| V0 | 1.1 ★ | |
| V1 | 1.2 · 1.3 | 1.2 ← 1.1 ; 1.3 ← 1.1 |
| V2 | 2.1 ★ | 2.1 ← 1.2 ; 2.1 ← 1.3 |
| V3 | 2.2 | 2.2 ← 2.1 |
| V4 | 2.3 | 2.3 ← 2.2 |

## Sprint 2 — Ambiance et livraison

| Vague | Stories en parallèle | Après |
|---|---|---|
| V5 | 3.1 · 3.2 | 3.1 ← 2.3 ; 3.2 ← 2.3 |
| V6 | 3.3 | 3.3 ← 3.2 |
| V7 | 4.1 | 4.1 ← 3.1 ; 4.1 ← 3.3 |
| V8 | 4.2 (mixte) | 4.2 ← 4.1 |

## Règles

- Enchaînement par story : `dev-story`, `second-avis`, `reviewer`, puis fusion quand la CI de branche est verte.
- Sonnet pour le développement, sauf 2.1 sur Opus (géométrie et animation, cas de bord peu visibles aux tests).
- `verif-front` (expérimental) après `dev-story` et avant `second-avis`, pour les stories d'interface 2.1 à 3.3, si Chromium est installé ; sinon le signaler une fois et continuer sans.
- Contrats partagés fixés par 1.2 et 1.3 : `src/domain/` avant toute interface, textes dans `src/texts.ts`.
- Arrêts pour Anaël : recette humaine de la 4.2 (esthétique, son, téléphone réel, projection), avant le tag `v1.0.0`.
- État du run hors des PR de story (PR `chore/etat-run`).

- Dépôt autorisé par Anaël le 2026-10-31 : `Aliquanto3/roue-du-hasard`, public, hors `ai-portfolio`, versionné en SemVer. Le créer au début de la 1.1.

## Journal

- 2026-10-31 · cadrage · décision · spec, stories et plan de run rédigés ·
