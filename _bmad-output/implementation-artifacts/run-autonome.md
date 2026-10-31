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
- 2026-10-31 09:46 · 1.1 · décision · dépôt public Aliquanto3/roue-du-hasard créé · 93ff8bd
- 2026-10-31 09:46 · 1.1 · dev · lancé ·
- 2026-10-31 09:49 · 1.1 · dev · fini · 20d792b
- 2026-10-31 09:51 · 1.1 · second-avis · 2 medium, 5 low · 20d792b
- 2026-10-31 10:00 · 1.1 · review · 3 medium et 5 low corrigés · e8808a1
- 2026-10-31 10:00 · 1.1 · CI · verte, 9 jobs sur 9 · e8808a1
- 2026-10-31 10:00 · 1.1 · fusion · PR #1 fusionnée · 45cdc97
- 2026-10-31 10:00 · 1.2 · dev · lancé ·
- 2026-10-31 10:00 · 1.3 · dev · lancé ·
- 2026-10-31 10:02 · 1.3 · dev · fini, PR #2 ouverte, écart sur le seuil de la spec · c194574
- 2026-10-31 10:02 · 1.3 · décision · seuil de voisinage lu à une décimale (17,95, mesure 17,96), ordre du tableau conservé, à signaler à Anaël ·
- 2026-10-31 10:03 · 1.3 · dev · fini, correctif du seuil poussé · 370ad40
- 2026-10-31 10:04 · 1.2 · dev · fini, PR #3 ouverte · b395d34
- 2026-10-31 10:06 · 1.3 · second-avis · 1 medium (formulation de la spec), 7 low · 370ad40
- 2026-10-31 10:07 · 1.2 · second-avis · 2 medium, 9 low · b395d34
- 2026-10-31 10:09 · 1.3 · review · 1 medium et 3 low corrigés, 1 low reporté à 3.1 (couleur importée) · 8216a2f
- 2026-10-31 10:12 · 1.2 · review · 3 medium et 1 low corrigés · e9a237f
- 2026-10-31 10:12 · 1.2 · décision · limites d'import (100 000 éléments, 5 M caractères) à retirer en 3.1 pour respecter F2 et F15, avec contrôle de taille du fichier avant lecture ·
- 2026-10-31 10:12 · 1.2 · report · 3.1 : persistance sans double encodage (exporter renvoie une chaîne) ; 2.3 : message après recommencement si tous les noms sont retirés ·
- 2026-10-31 10:12 · 1.3 · CI · verte, 9 jobs sur 9 · 8216a2f
- 2026-10-31 10:12 · 1.3 · fusion · PR #2 fusionnée · 265a70c
- 2026-10-31 10:17 · 1.2 · CI · verte, 9 jobs sur 9 · e9a237f
- 2026-10-31 10:17 · 1.2 · fusion · PR #3 fusionnée · dd33bf8
- 2026-10-31 10:18 · 2.1 · dev · lancé ·
