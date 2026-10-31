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
| V2b | 3.1a · 3.2a | 3.1a ← 1.2 ; 3.2a ← 1.1 |
| V3 | 2.2 | 2.2 ← 2.1 |
| V4 | 2.3 | 2.3 ← 2.2 |

## Sprint 2 — Ambiance et livraison

| Vague | Stories en parallèle | Après |
|---|---|---|
| V4b | 2.4 | 2.4 ← 2.3 |
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
- 2026-10-31 10:33 · 2.1 · dev · fini, PR #5 ouverte · 2defe9c
- 2026-10-31 10:34 · 2.1 · décision · verif-front sans outils Playwright dans sa session : captures faites par l'orchestrateur, à signaler à Anaël ·
- 2026-10-31 10:34 · 2.1 · décision · captures à 10 et 1 000 noms, 320 et 1366 px : sans erreur ni défilement horizontal ; moiré à 1 000 noms et libellés tête en bas sur la moitié gauche à soumettre à la recette ·
- 2026-10-31 10:39 · 2.1 · second-avis · 2 medium, 6 low · 2defe9c
- 2026-10-31 10:39 · run · décision · vérifications navigateur faites dans Chrome (Claude in Chrome) par l'orchestrateur, à la place de verif-front, à la demande d'Anaël ·
- 2026-10-31 10:42 · 2.1 · décision · vérifiée dans Chrome : arrêt exact à 10 et 1 000 noms, 5,8 s, second lancement refusé, clavier, clic, 1 nom, nom hostile, console sans erreur ; contour de focus à reprendre en 2.2 ·
- 2026-10-31 10:42 · run · décision · à la demande d'Anaël, modules autonomes 3.1a et 3.2a avancés en V2b, branchement maintenu en V5 ·
- 2026-10-31 10:42 · 3.1a · dev · lancé ·
- 2026-10-31 10:42 · 3.2a · dev · lancé ·
- 2026-10-31 10:42 · run · décision · demande d'Anaël : effet 3D avec bascule, ajouté en F20 et story 2.4 (V4b), relief par défaut en canvas 2D, à valider à la recette ·
- 2026-10-31 10:44 · run · décision · chat SLM local cadré pour la V1.1, hors run (docs/v1.1-chat-slm.md) ; table d'actions src/actions.ts à prévoir dès la 2.2 ·
- 2026-10-31 10:45 · 3.2a · dev · fini, PR #6 ouverte · 7bf1df5
- 2026-10-31 10:46 · 3.1a · dev · fini, PR #7 ouverte · 04e7c25
- 2026-10-31 10:59 · 3.2a · second-avis · 6 medium, 8 low · 7bf1df5
- 2026-10-31 11:00 · 2.1 · review · 3 medium et 3 low corrigés, orientation des libellés reportée à la recette · 7889a9c
- 2026-10-31 11:00 · 2.1 · CI · verte, 9 jobs sur 9 · 7889a9c
- 2026-10-31 11:00 · 2.1 · fusion · PR #5 fusionnée · c15c345
- 2026-10-31 11:00 · 2.2 · dev · lancé ·
