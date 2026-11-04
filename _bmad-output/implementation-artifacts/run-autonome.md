# Run autonome — Roue du hasard, suite (V1.0 à V1.3)

Spécification : `docs/spec.md`, `docs/v1.1-chat-slm.md`, `docs/v1.2-supports.md`. Stories : `docs/stories.md`. Statut : `_bmad-output/implementation-artifacts/sprint-status.yaml`. Run V1 terminé : `archive/run-autonome-v1.md`.

## Périmètre

| Périmètre | Epics | Note |
|---|---|---|
| Dans le run | Epics 4 à 7 | Release V1.0 (4.2), chat local V1.1 (5), voix (6), supports et projection V1.2 (7) |

Au plus 2 stories en développement à la fois

## Sprint 3 — Release V1.0 et base du chat

| Vague | Stories en parallèle | Après |
|---|---|---|
| V0 | 4.2 (humaine) · 5.1 ★ | |
| V1 | 5.2 · 5.4 | 5.2 ← 5.1 ; 5.4 ← 5.1 |
| V2 | 5.3 | 5.3 ← 5.2 |

## Sprint 4 — Chat utilisable

| Vague | Stories en parallèle | Après |
|---|---|---|
| V3 | 5.5 ★ · 5.6 | 5.5 ← 5.3 ; 5.5 ← 5.4 ; 5.6 ← 5.1 |
| V3b | 5.10 (mixte) | 5.10 ← 5.6 |
| V4 | 5.7 | 5.7 ← 5.5 ; 5.7 ← 5.6 |
| V5 | 5.8 (mixte) | 5.8 ← 5.7 ; 5.8 ← 5.10 |
| V6 | 5.9 (humaine) | 5.9 ← 5.8 |

## Sprint 5 — Supports et projection (V1.2)

| Vague | Stories en parallèle | Après |
|---|---|---|
| V7 | 7.2 | 7.2 ← 4.2 |
| V8 | 7.1 | 7.1 ← 5.5 |
| V9 | 7.3 (humaine) | 7.3 ← 7.1 ; 7.3 ← 7.2 |

## Sprint 6 — Voix (V1.3)

| Vague | Stories en parallèle | Après |
|---|---|---|
| V10 | 6.1 (mixte) | 6.1 ← 5.4 |
| V11 | 6.2 | 6.2 ← 6.1 ; 6.2 ← 5.5 |
| V12 | 6.3 | 6.3 ← 6.2 |
| V13 | 6.4 (humaine) | 6.4 ← 6.3 |

Le sprint 5 avance pendant les attentes du sprint 4 (GPU, recette) ; l'ordre des vagues n'est pas un ordre strict entre sprints.

## Règles

- Enchaînement par story : `dev-story` (Sonnet), `second-avis` (Haiku), correction des seuls constats medium et high réels par le même agent, fusion quand la CI de branche est verte. `reviewer` (Opus) seulement sur défaut sérieux. Opus pour le développement de 7.1 (plein écran, repli iPhone) et en reprise après deux échecs Sonnet.
- Vérification Chrome de l'orchestrateur sur la page réelle pour les stories d'interface (5.5, 5.7, 7.1, 6.2).
- **GPU indisponible (Anaël, 2026-11-04) : bancs SLM en cours.** Aucun appel d'inférence à Ollama, aucun programme sur la carte graphique, jusqu'à ce qu'Anaël écrive dans cette session que le GPU est disponible. Une étape qui en a besoin passe en `attente humaine`, avec une notification, et le run avance sur le reste. Téléchargements de petits modèles permis (pas d'inférence).
- Pendant les bancs : pas de suite E2E ni de suite complète en local (elles faussent les mesures de vitesse) ; lint, types et tests unitaires ciblés seulement, la CI de branche sert de suite complète.
- Modèles de décision (Anaël, 2026-11-04) : installer de petits modèles pour tester l'étage 2 ; « petit » = tient avec le SLM retenu dans les 8 Go de la RTX 3050 de ce poste, soit environ 4 Go au plus.
- Contrat partagé fixé par 5.1, à ne pas changer sans décision : tout le code du chat dans `src/chat/` ; types `Decision` (même forme que `attendu` du corpus), `EtatChat`, `Etage` dans `src/chat/types.ts` ; cascade dans `src/chat/cascade.ts`, où chaque étage s'ajoute par une ligne d'enregistrement ; textes du chat dans `src/chat/textes.ts`. `src/main.ts` n'importe jamais `src/chat/` : seule l'édition chat (`src/main-chat.ts`, 5.4) le fait.
- `roue.html` inchangé dans sa promesse N1 : CSP stricte, aucun code du chat (contrôlé par `check:size`). L'édition chat est servie sur `http://localhost:5200` (`npm run chat`), `OLLAMA_ORIGINS=http://localhost:5200`, jamais `null`.
- Le modèle ne désigne jamais le gagnant ; noms = données ; confirmation calculée par l'application, pas par le modèle.
- Corpus : règles écrites sur le lot `dev` seulement, mesures sur `test`.
- Releases : `v1.0.0` après la recette d'Anaël (4.2), `v1.1.0` chat écrit (5.9), `v1.2.0` supports et projection (7.3), `v1.3.0` voix (6.4). Topic `status-*` et `portfolio.json` mis à jour à chaque release.
- État du run hors des PR de story (PR `chore/etat-run-*`). `git worktree prune` avant chaque lancement.
- Arrêts pour Anaël : recette V1.0 avant le tag ; GPU disponible (5.8, 5.10, 6.1) ; recette du chat (5.9) ; enregistrements audio (6.4) ; recette téléphone et projecteur (7.3) ; seuil de déploiement du chat.

## Journal

- 2026-11-04 05:30 · run · décision · Anaël valide le plan : édition chat servie sur localhost, voix dans le run, portfolio dès maintenant ; étage 2 dans le run avec petits modèles de décision à installer ·
- 2026-11-04 05:30 · run · décision · GPU indisponible (bancs SLM d'Anaël) jusqu'à son signal ; pas de suite locale lourde pendant les bancs ·
- 2026-11-04 05:30 · run · décision · le run V1 notait « hors ai-portfolio » : Anaël l'y ajoute ·
- 2026-11-04 05:34 · run · décision · portfolio : entrée ajoutée (Aliquanto3/Aliquanto3 PR #4 fusionnée), topics ai-portfolio et status-test posés ·
- 2026-11-04 05:34 · 5.1 · dev · lancé ·
- 2026-11-04 05:34 · 4.2 · dev · lancé (préparation, sans tag ni Pages) ·
- 2026-11-04 05:36 · 4.2 · dev · fini, PR #25 ouverte ; release.yml utilise --generate-notes, notes posées par gh release edit après le tag · 7e4a75f
- 2026-11-04 05:38 · 4.2 · second-avis · 3 medium, 3 low ; 2 medium en correction (Chrome à préciser, notes lues par release.yml) ; lien Pages mort réglé par l'ordre fusion, Pages et tag après recette · 7e4a75f
- 2026-11-04 05:38 · 4.2 · review · 2 medium corrigés (Chrome précisé, release.yml lit docs/notes/<tag>.md) ; PR #25 gardée ouverte jusqu'à la recette, puis fusion, Pages et tag ensemble · 8987b5d
- 2026-11-04 05:38 · 4.2 · attente humaine · recette V1.0 d'Anaël (esthétique et son) ·
- 2026-11-04 05:39 · 5.1 · dev · fini, PR #26 ouverte ; contrat : ETAGES_ENREGISTRES (cascade.ts), planifier puis executerPlan (outils.ts), nom absent sans voisin = refuser nom-absent · 75f0e27
- 2026-11-04 05:41 · 5.1 · second-avis · 3 medium (même personne visée deux fois, plan non transactionnel, décision acceptée après abort), 4 low ; medium et 3 low de contrat en correction · 75f0e27
- 2026-11-04 05:42 · run · fusion · plan du run, PR #24 fusionnée, CI verte · fcffb14
- 2026-11-04 05:43 · 5.1 · dev · corrections faites : conflit-etapes, plan tout ou rien par Actions.essayer(), abort revérifié, forme-invalide, étages en fabriques · 0c81c9b
- 2026-11-04 05:43 · 5.1 · review · lancée (Opus, contrat partagé et actions.ts touchés) ·
- 2026-11-04 05:46 · 5.1 · review · 1 medium corrigé (essai à blanc qui reprenait la rotation réelle), 2 low non corrigés (noms résolus contre l'état d'avant le plan) · 94535ec
- 2026-11-04 05:49 · run · décision · Anaël demande les parallélisations à faible risque : 5.2 et 5.4 lancées depuis la branche 5.1 revue (94535ec), rebase sur main après fusion de la PR #26 ; 5.6 en attente d'une place ·
- 2026-11-04 05:49 · 5.2 · dev · lancé ·
- 2026-11-04 05:49 · 5.4 · dev · lancé ·
- 2026-11-04 05:52 · 5.4 · dev · fini, PR #27 ouverte (contient 5.1 jusqu'au rebase) ; roue.html 75 026 o, roue-chat.html 75 197 o · 7109ebe
- 2026-11-04 05:52 · 5.4 · second-avis · lancé ·
- 2026-11-04 05:53 · 5.6 · dev · lancé (place libérée par la fin du dev de 5.4) ·
- 2026-11-04 05:53 · 5.2 · dev · fini, PR #28 ouverte ; plancher refuse-tout dev 26/96, test 32/126, égal à verifier_corpus.py · bb9e23e
- 2026-11-04 05:53 · 5.2 · second-avis · lancé ·
- 2026-11-04 05:54 · 5.1 · CI · verte · 94535ec
- 2026-11-04 05:54 · 5.1 · fusion · PR #26 fusionnée · 5ce0355
- 2026-11-04 05:56 · 5.6 · dev · fini, PR #29 ouverte ; à trancher : prochain cadeau et historique hors du contrat EtatChat · d86f347
- 2026-11-04 05:56 · 5.6 · second-avis · lancé ·
- 2026-11-04 05:56 · 5.3 · dev · lancé, depuis la branche 5.2 (bb9e23e) ·
- 2026-11-04 05:56 · 5.10 · décision · recherche préalable du contrat System One et des petits modèles de décision (lookup, sans GPU) ·
- 2026-11-04 05:56 · 5.2 · second-avis · 2 medium (candidats de clarifier non vérifiés, rappel sans précision), 6 low ; medium, comparaison après planifier et essai du script en correction · bb9e23e
- 2026-11-04 05:56 · 5.10 · décision · /v1/systemone servi par Ollama (tev1) ou llama-server ; candidats sous 1 Go : tev1 0.8b, Julia-1, Laya, aux mesures antérieures faibles ; contrat choice et score jamais éprouvé. 5.10 en deux temps : client sur serveur simulé et téléchargements (sans GPU), puis contrat réel après le signal GPU. Sources internes d'un autre dépôt, à ne pas citer dans ce dépôt public ·
- 2026-11-04 05:57 · 5.4 · second-avis · 2 medium (roue-chat.html publié sur Pages, origine 127.0.0.1 refusée par Ollama), 5 low ; medium en correction, avec contrôle du Host · 7109ebe
- 2026-11-04 05:57 · 5.6 · second-avis · 4 medium (délimiteur non neutralisé, étages recréés à chaque commande, raison du null perdue, historique jamais transmis), 4 low · d86f347
- 2026-11-04 05:57 · run · décision · contrat de cascade étendu : creerCascade (instances durables), raison du passage de main dans la trace, prochainCadeau et historique dans EtatChat ; transmis à 5.3 ; correction 5.6 avec Object.hasOwn dans outils.ts ·
- 2026-11-04 05:58 · 5.4 · review · 2 medium corrigés (Pages limité à index.html avec contrôle, Host vérifié : 302 de 127.0.0.1 vers localhost, 421 sinon), rebasée sur main · 6922757
- 2026-11-04 05:58 · 5.2 · review · 2 medium et 2 low corrigés (candidats attendus, précision par action, score après planifier, script vérifié sous Windows) · ad3455e
- 2026-11-04 06:02 · 5.6 · dev · corrections faites : creerCascade, PasseMain avec raison, prochainCadeau et historique dans EtatChat, délimiteurs échappés, Object.hasOwn · 34e6ff8
- 2026-11-04 06:02 · 5.6 · review · lancée (Opus, contrat étendu et injection) ·
- 2026-11-04 06:02 · 5.10 · dev · étape A lancée (client sur serveur simulé, pull de tev1 0.8b sans inférence) ·
- 2026-11-04 06:05 · 5.6 · review · 1 medium corrigé (historique hors du bloc de données, nouveau canal d'injection), 2 low acceptés ou reportés à 5.5 · 36dd230
- 2026-11-04 06:05 · 5.2 · CI · verte · ad3455e
- 2026-11-04 06:05 · 5.2 · fusion · PR #28 fusionnée · ba89fa4
- 2026-11-04 06:06 · 5.4 · CI · verte · 6922757
- 2026-11-04 06:06 · 5.4 · fusion · PR #27 fusionnée · 387a15b
- 2026-11-04 06:07 · 5.10 · dev · étape A finie, PR #30 ouverte (empilée sur 5.6) ; tev1:0.8b téléchargé (833 Mo), sans inférence ; Julia-1 et Laya non installés (llama-server : décision d'Anaël) · 3e7d275
- 2026-11-04 06:07 · 5.10 · second-avis · lancé ·
- 2026-11-04 06:08 · 5.3 · dev · fini, PR #31 ouverte ; règles seules : dev 94/96, test 103/126 (81,7 %, plancher 25,4 %), 21 null et 9 décisions fausses en test · 338dd76
- 2026-11-04 06:08 · 5.3 · second-avis · lancé (fuite du lot test, erreurs dangereuses) ·
- 2026-11-04 06:09 · 5.10 · second-avis · 4 medium (citation par sous-chaîne, choix parmi des noms non cités, noms non échappés dans les options, probabilités non contrôlées), 4 low ; medium en correction · 3e7d275
- 2026-11-04 06:09 · run · décision · contrat : toute décision de la cascade passe par planifier avant exécution (à appliquer par 5.5) ·
- 2026-11-04 06:12 · 5.3 · second-avis · 5 high (fuite du lot test dans les règles et les tests, Anne vers Hanne, négation inversée, renommages multiples), 3 medium, 3 low ; en correction avec garde-fou de fuite automatique · 338dd76
- 2026-11-04 06:12 · run · décision · score test des règles déclaré optimiste ; proposition à Anaël : nouveau lot tenu à l'écart (test2) écrit par un agent qui ne voit pas regles.ts, pour l'essai 5.8 ·
- 2026-11-04 06:12 · 5.6 · CI · verte · 36dd230
- 2026-11-04 06:12 · 5.6 · fusion · PR #29 fusionnée · 77814c3
- 2026-11-04 06:14 · 5.10 · review · 4 medium corrigés (noms entiers, nom-non-cite, options neutralisées, probabilités contrôlées), rebasée sur main, moteur decision au banc ; slm encore dans MOTEURS_A_VENIR, à brancher avant 5.8 · 9302e74
- 2026-11-04 06:14 · 5.5 · dev · lancé (base main 77814c3 ; E2E en fixme si 5.3 pas encore fusionnée) ·
- 2026-11-04 06:21 · 5.3 · review · fuite purgée (garde-fou src/banc/fuite.test.ts), 6 défauts corrigés ; test 98/126 (77,8 %, déclaré optimiste), 42 null, 4 fausses ; push forcé refusé par le mode auto : commit poussé sur story/5-3-etage-regles-v2, PR #33 remplace #31 · 0480f18
- 2026-11-04 06:21 · 5.5 · dev · fini, PR #32 ouverte ; E2E des parcours en fixme jusqu'à la fusion de 5.3 ; main.ts exporte application ; modeleDecision ajouté aussi par 5.10 (conflit attendu) · f31dcd7
- 2026-11-04 06:21 · 5.5 · décision · vérification Chrome reportée au signal GPU (Chrome compose sur la carte) ·
- 2026-11-04 06:21 · 5.10 · CI · rouge : E2E edition-chat attend un nombre d'étages exact ; correctif d'une ligne demandé · 9302e74
- 2026-11-04 06:22 · 5.10 · CI · correctif du test poussé sans force · d0c53c7
- 2026-11-04 06:22 · 5.3 · CI · correctif du test poussé sans force sur la branche v2 · 12f60ad
- 2026-11-04 06:24 · 5.5 · second-avis · 3 medium (confirmation périmée, regex data-chat rejetée, tiroir qui cache la roue sur téléphone), 3 low ; 2 medium et l'avis 404 en correction · f31dcd7
- 2026-11-04 06:26 · 5.5 · review · 2 medium corrigés (empreinte de l'état et planifier rejoué à la confirmation, tiroir sans recouvrement), avis 404 distinct ; code de raison explicite reporté à 5.7 · 4fb6220
- 2026-11-04 06:31 · 5.10 · CI · verte · d0c53c7
- 2026-11-04 06:31 · 5.10 · fusion · PR #30 fusionnée (étape A) · 76738d5
- 2026-11-04 06:31 · 5.3 · décision · main fusionnée dans la branche v2 par l'orchestrateur (conflits de liste d'étages : règles, décision, SLM), 397 tests ciblés verts · a300422
- 2026-11-04 06:38 · 5.3 · CI · verte · a300422
- 2026-11-04 06:38 · 5.3 · fusion · PR #33 fusionnée · 24f383b
- 2026-11-04 06:38 · 5.5 · dev · intégration de main et réactivation des E2E demandées ·
