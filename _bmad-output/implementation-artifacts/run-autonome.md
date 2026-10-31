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
| V3b | 2.4a · 4.2a | 2.4a ← 2.1 ; 4.2a ← 1.1 |
| V3c | 1.3a | 1.3a ← 1.3 |
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

- Enchaînement allégé par story (Anaël, 2026-10-31) : `dev-story`, `second-avis`, correction des seuls constats medium et high réels par le même agent, puis fusion quand la CI de branche est verte. Plus de `reviewer` sauf défaut sérieux ; constats low ignorés ou reportés. Vérification Chrome de l'orchestrateur sur la page réelle, une fois avant la recette.
- Sonnet pour le développement, sauf 2.1 sur Opus (géométrie et animation, cas de bord peu visibles aux tests).
- `verif-front` (expérimental) après `dev-story` et avant `second-avis`, pour les stories d'interface 2.1 à 3.3, si Chromium est installé ; sinon le signaler une fois et continuer sans.
- Contrats partagés fixés par 1.2 et 1.3 : `src/domain/` avant toute interface, textes dans `src/texts.ts`.
- Arrêts pour Anaël : recette humaine de la 4.2 (esthétique, son, projection, sur son PC), avant le tag `v1.0.0`.
- État du run hors des PR de story (PR `chore/etat-run`).

- Parallélisations à faible risque autorisées par Anaël le 2026-10-31 pour toute la suite du projet, V1.1 comprise, sans redemander : fichiers disjoints, limite de 2 stories en développement maintenue, enchaînement second avis et revue conservé. Le travail V1.1 ne compte pas dans cette limite (Anaël, 2026-10-31), s'il reste dans ses propres fichiers, sans modifier le code V1 ni lancer de suite E2E locale. Restent soumis à Anaël : téléchargements de modèles, essais mobilisant la carte graphique, écrans partagés mis en parallèle.
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
- 2026-10-31 11:01 · 3.1a · second-avis · 2 medium, 7 low · 04e7c25
- 2026-10-31 11:09 · run · décision · V1.1 : fenêtre d'inspection masquée et moteur en cascade règles, System One, SLM à départager par essai (docs/v1.1-chat-slm.md) ·
- 2026-10-31 11:12 · 3.1a · review · 6 low et 1 medium déclassé corrigés, import strict sur les ids · cd6a9bc
- 2026-10-31 11:12 · 3.1a · CI · verte, 9 jobs sur 9 · cd6a9bc
- 2026-10-31 11:12 · 3.1a · fusion · PR #7 fusionnée · f285b62
- 2026-10-31 11:13 · 2.2 · dev · fini, PR #9 ouverte · afd3778
- 2026-10-31 11:14 · 2.2 · décision · vérifiée dans Chrome : collage, doublon signalé, nom hostile inerte, ajout et suppression refusés pendant la rotation, roue fixe au défilement, console sans erreur · afd3778
- 2026-10-31 11:16 · 3.2a · review · 5 medium corrigés, comportement iOS à contrôler en recette · d35753d
- 2026-10-31 11:16 · 3.2a · CI · verte, 9 jobs sur 9 · d35753d
- 2026-10-31 11:16 · 3.2a · fusion · PR #6 fusionnée · c40e353
- 2026-10-31 11:22 · 2.2 · second-avis · 2 medium, 4 low · afd3778
- 2026-10-31 11:32 · run · décision · Anaël autorise les parallélisations à faible risque pour toute la suite, V1.1 comprise ·
- 2026-10-31 11:32 · 2.4a · dev · lancé ·
- 2026-10-31 11:32 · run · décision · corpus de commandes V1.1 lancé en parallèle, hors stories V1 ; 4.2a en attente d'une place ·
- 2026-10-31 11:38 · run · décision · Anaël : la V1.1 hors de la limite de 2 places, dans ses propres fichiers ; place libérée pour 4.2a ·
- 2026-10-31 11:38 · 4.2a · dev · lancé ·
- 2026-10-31 11:40 · 4.2a · dev · fini, PR #10 ouverte · fde567d
- 2026-10-31 11:40 · run · décision · licence absente d'un dépôt public : à trancher par Anaël avant le tag v1.0.0 ·
- 2026-10-31 11:41 · 2.4a · dev · fini, PR #11 ouverte · 7b8bb6a
- 2026-10-31 11:42 · 2.2 · review · 4 corrigés et test clavier WebKit réaligné ; tactile, thème clair et 320 px à revoir en recette · 6b1f12f
- 2026-10-31 11:42 · 2.2 · CI · verte, 9 jobs sur 9 · 6b1f12f
- 2026-10-31 11:42 · 2.2 · fusion · PR #9 fusionnée · fbd68cb
- 2026-10-31 11:42 · 2.4a · décision · vérifiée dans Chrome : relief net, lumière et pointeur en volume, libellés lisibles · 7b8bb6a
- 2026-10-31 11:42 · run · décision · seuil de performance E2E à 1 000 noms instable sous WebKit, à stabiliser en 4.1 ·
- 2026-10-31 11:42 · 2.3 · dev · lancé ·
- 2026-10-31 11:42 · 4.2a · second-avis · 3 medium, 5 low · fde567d
- 2026-10-31 11:42 · run · report · 4.2 : passer package.json en 1.0.0 avant le tag, sinon release.yml refuse ; PAGES_ENABLED à activer ·
- 2026-10-31 11:43 · run · décision · corpus V1.1 fini, PR #12 ouverte, second avis lancé · 7c483a2
- 2026-10-31 11:45 · 2.4a · second-avis · 3 medium, 4 low · 7b8bb6a
- 2026-10-31 11:45 · 2.4a · décision · F20 précisée : relief discret, palette au moins 4,5:1, performance téléphone à contrôler en recette ·
- 2026-10-31 11:52 · run · décision · seuil du test de performance élargi à 400 ms sous WebKit en CI, PR dédiée ; relance du job échoué de la PR #10 ·
- 2026-10-31 11:59 · run · décision · Anaël : cible de performance N7 à 100 noms, sans limite logicielle ; PR #13, avec test de fondu stabilisé ·
- 2026-10-31 11:59 · run · décision · corpus V1.1, second avis : 2 high, 4 medium, 5 low ; revue lancée · 7c483a2
- 2026-10-31 12:05 · run · décision · cible de performance à 100 noms et tests WebKit stabilisés, PR #13 fusionnée, CI verte · 806044d
- 2026-10-31 12:09 · run · décision · Anaël : licence Apache 2.0 ; PR dédiée (LICENSE, package.json, README) après la fusion du README ·
- 2026-10-31 12:10 · run · décision · corpus V1.1 revu : 222 lignes, 96 dev et 126 test, contrôle de quasi-doublons ajouté · 0fdce90
- 2026-10-31 12:13 · run · décision · médiane WebKit CI inchangée à 100 noms (164 ms) : seuil de temps retiré sous ce moteur, Safari réel en recette, PR dédiée ·
- 2026-10-31 12:13 · 2.3 · dev · fini, PR #15 ouverte · 41b97f0
- 2026-10-31 12:16 · 2.3 · décision · vérifiée dans Chrome : annonce, cadeau, focus, aria-live et fond inerte corrects, console sans erreur · 41b97f0
- 2026-10-31 12:16 · 1.3a · dev · lancé ·
- 2026-10-31 12:48 · run · décision · PR #14 (seuil WebKit) et #12 (corpus V1.1) fusionnées, CI vertes ; trois agents calés, repris sans perte ·
- 2026-10-31 12:49 · 1.3a · dev · fini, PR #16 ouverte · 97b20a7
- 2026-10-31 12:49 · 2.4a · review · 3 medium et 5 low corrigés, F20 précisée ; couleurs personnalisées parfois sous 4,5:1 en relief, à voir en recette · eb56414
- 2026-10-31 12:49 · 2.4a · CI · verte, 9 jobs sur 9 · eb56414
- 2026-10-31 12:49 · 2.4a · fusion · PR #11 fusionnée · 8b82325
- 2026-10-31 12:50 · run · décision · à la demande d'Anaël, processus anti-veille lancé pour 8 h, sans changer les réglages système ·
- 2026-10-31 12:51 · 1.3a · second-avis · 1 medium et 3 low ; recoloration à l'ajout admise et écrite en spec, sans revue Opus (2 fichiers, aucun défaut de code) · 97b20a7
- 2026-10-31 12:52 · run · décision · Anaël : V1.0 sous Windows et Chromium seulement, CI à 1 job ; navigateurs, OS et téléphone réel reportés en V1.2 ·
- 2026-10-31 12:52 · run · décision · branchements 3.1 et 3.2 : second avis puis revue Sonnet ; Opus gardé pour 3.3 et 4.1 ·
- 2026-10-31 12:53 · 2.3 · second-avis · 1 medium, 6 low ; correction limitée au focus et à la boîte de confirmation · 41b97f0
- 2026-10-31 12:53 · run · décision · Anaël : processus allégé, sans revue systématique, constats low non traités ; pas de nouveau chantier V1.1 avant la V1 ·
- 2026-10-31 12:55 · 2.3 · dev · corrections ciblées, rebasée sur main · c9b163c
- 2026-10-31 12:55 · 4.2a · review · README simplifié pour novices, PowerShell précisé · ba41c2c
- 2026-10-31 12:55 · 4.2a · CI · verte, 9 jobs sur 9 · ba41c2c
- 2026-10-31 12:55 · 4.2a · fusion · PR #10 fusionnée · 37889fb
- 2026-10-31 12:58 · run · décision · CI à 1 job, PR #17 fusionnée · e22e809
- 2026-10-31 13:05 · 2.3 · CI · verte · 87615d8
- 2026-10-31 13:05 · 2.3 · fusion · PR #15 fusionnée · e726463
- 2026-10-31 13:05 · 1.3a · CI · verte · 15e8f36
- 2026-10-31 13:05 · 1.3a · fusion · PR #16 fusionnée · d7d71cf
- 2026-10-31 13:05 · run · décision · licence Apache 2.0, PR #18 fusionnée · 4378e3d
- 2026-10-31 13:05 · run · décision · 2.4, 3.1 et 3.2 regroupées en un seul agent et une seule PR : mêmes fichiers d'interface, modules déjà revus ·
- 2026-10-31 13:05 · 2.4 · dev · lancé ·
- 2026-10-31 13:05 · 3.1 · dev · lancé ·
- 2026-10-31 13:05 · 3.2 · dev · lancé ·
