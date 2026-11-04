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
- **Poste (Anaël, 2026-11-04) : le run se poursuit sur le PC 2** (RTX 3060 Laptop 6 Go, Windows 11), GPU disponible. Le PC 1 (RTX 3050 8 Go) sert aux bancs SLM d'Anaël : plus aucun développement ni inférence sur ce poste-là. Voir « Passation vers le PC 2 ».
- Suite complète : la CI de branche (3 OS × 3 moteurs) ; en local, lint, types, tests unitaires ciblés et au plus un fichier E2E.
- Modèles de décision (Anaël, 2026-11-04) : petits modèles, à faire tenir avec le SLM et le STT dans les 6 Go du PC 2 ; mémoire mesurée, pas supposée. llama-server autorisé (Julia-1, Laya). Modèles de voix autorisés.
- Git : le mode auto refuse les push forcés. Jamais de rebase d'une branche poussée : intégrer `main` par `git merge origin/main`, push normal.
- Contrat partagé fixé par 5.1, à ne pas changer sans décision : tout le code du chat dans `src/chat/` ; types `Decision` (même forme que `attendu` du corpus), `EtatChat`, `Etage` dans `src/chat/types.ts` ; cascade dans `src/chat/cascade.ts`, où chaque étage s'ajoute par une ligne d'enregistrement ; textes du chat dans `src/chat/textes.ts`. `src/main.ts` n'importe jamais `src/chat/` : seule l'édition chat (`src/main-chat.ts`, 5.4) le fait.
- `roue.html` inchangé dans sa promesse N1 : CSP stricte, aucun code du chat (contrôlé par `check:size`). L'édition chat est servie sur `http://localhost:5200` (`npm run chat`), `OLLAMA_ORIGINS=http://localhost:5200`, jamais `null`.
- Le modèle ne désigne jamais le gagnant ; noms = données ; confirmation calculée par l'application, pas par le modèle.
- Corpus : règles écrites sur le lot `dev` seulement. Le lot `test` a été lu pendant la 5.3 : son score est optimiste. Mesure de référence de l'essai 5.8 sur `test2` (`docs/v1.1/corpus-test2.jsonl`, 91 lignes), relu par Anaël avant l'essai ; personne n'écrit de règle d'après `test2` (garde-fou `src/banc/fuite.test.ts`, base figée `fuite-base-test2.json`, jamais régénérée).
- Releases : `v1.0.0` après la recette d'Anaël (4.2), `v1.1.0` chat écrit (5.9), `v1.2.0` supports et projection (7.3), `v1.3.0` voix (6.4). Topic `status-*` et `portfolio.json` mis à jour à chaque release.
- État du run hors des PR de story (PR `chore/etat-run-*`). `git worktree prune` avant chaque lancement.
- Arrêts pour Anaël : recette V1.0 avant le tag ; GPU disponible (5.8, 5.10, 6.1) ; recette du chat (5.9) ; enregistrements audio (6.4) ; recette téléphone et projecteur (7.3) ; seuil de déploiement du chat.

## Passation vers le PC 2 (2026-11-04)

État de `main` : V1.0 prête (release en attente de la recette), chat écrit complet (5.1 à 5.7, 5.10 étape A, lot `test2`), CI 3 OS × 3 moteurs (7.2). `roue.html` 75 Ko, `roue-chat.html` environ 150 Ko sur 200 Ko.

Ordre de reprise :
1. **7.1 (PR #37, branche `story/7-1-mode-projection`, 3433fb6)** : CI rouge après l'intégration de 7.2, à cause du bouton « Projection » (+52 px et un arrêt de tabulation en plus) :
   - `panneau.spec.ts:233` (parcours au clavier, 9 jobs) : l'ordre de tabulation attendu ne connaît pas le bouton ;
   - `recette.spec.ts:121` (macOS Chromium) : positions décalées ;
   - `chat-panneau.spec.ts:67` (568 px, Ubuntu) : recouvrement roue et tiroir, le calcul `--roue-libre` / `--tiroir-max` de 7.2 doit compter le bouton dans « ce que la zone de la roue contient hors canvas » ;
   - `projection.spec.ts:268` (320 px, Firefox macOS et un job Windows).
   Corriger le code d'abord ; second avis Haiku ; fusion sur CI verte (9 jobs).
2. **GPU, 5.10 étape B** : appel réel de `/v1/systemone` sur `tev1:0.8b` (Ollama), contrat constaté, `ADAPTATEUR_SYSTEMONE` ajusté, seuil réglé, contrat documenté (`docs/specs/5.10-etage-decision.md`). Installer llama-server, essayer Julia-1 et Laya. Ne citer dans ce dépôt public aucune source interne d'un autre projet.
3. **Relecture de `test2` par Anaël** (étape humaine), puis **5.8** : banc sur `test2` (et `test`, noté optimiste) pour règles seules, règles + décision, règles + SLM (Nemotron-3.5-Bolt-E4B, `lfm3:1.7b` avec et sans réflexion, `lfm2.5:8b` témoin) ; mémoire mesurée sur 6 Go, combinaisons comprises ; rapport `docs/v1.1/essai-moteurs.md` ; cascade par défaut et seuil de déploiement proposés à Anaël.
4. **Vérification Chrome** de l'édition chat (5.5, 5.7, 7.1) sur la page réelle (`npm run build`, `npm run chat`, `http://localhost:5200`), reportée faute de GPU sur le PC 1.
5. **4.2 (PR #25)** après la recette d'Anaël : `git merge origin/main` (conflit attendu dans `release.yml`, qui publie aussi `roue-chat.html`), puis les commandes de la spec `docs/specs/4.2-distribution.md` (Pages, tag `v1.0.0`, topic `status-deployed`), puis `portfolio.json` si la description change.
6. **5.9** (recette du chat, `v1.1.0`), **voix 6.1 à 6.4** (`v1.3.0`), **7.3** (recette appareils, `v1.2.0`), selon les retours d'Anaël.

À savoir :
- Flaky d'un pixel sous Firefox Linux : `recette.spec.ts:245` (424 contre 423), repassé vert à la relance.
- Le plus petit écran sans recouvrement roue et tiroir est 568×480 ; 568×320 est impossible avec la roue à 8 rem : à juger en recette 7.3.
- `roue-chat.html` approche de la limite de 200 Ko : surveiller pour la voix.

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
- 2026-11-04 06:39 · 5.5 · dev · main intégrée sans conflit, 5 parcours E2E réactivés · e417ebf
- 2026-11-04 06:47 · 5.5 · CI · rouge : 3 E2E du panneau (320 px, homonyme, refus en rotation) ; correction demandée, un seul fichier E2E permis en local · e417ebf
- 2026-11-04 06:48 · 7.2 · dev · lancé (matrice 3 OS × 3 moteurs, fusion différée après 5.7 pour garder des CI courtes) ·
- 2026-11-04 06:48 · run · décision · exception à la règle des bancs : un seul fichier E2E en local pour diagnostiquer la 5.5 ·
- 2026-11-04 06:52 · 5.5 · review · 3 E2E corrigés (tiroir 35 dvh en colonne, clarification d'homonymes identiques sans boucle, code verrouille traduit) · 4230e47
- 2026-11-04 07:00 · 5.5 · CI · verte · 4230e47
- 2026-11-04 07:00 · 5.5 · fusion · PR #32 fusionnée · 914b195
- 2026-11-04 07:00 · 5.7 · dev · lancé (avec code explicite de raisonIndisponible et moteur slm au banc) ·
- 2026-11-04 07:12 · 5.7 · dev · fini, PR #36 ouverte ; roue-chat.html 145 Ko (était 75), raccourci Alt+Maj+I, export roue-inspection relu par le banc (--corpus) · c6f6ebd
- 2026-11-04 07:12 · 5.7 · second-avis · lancé ·
- 2026-11-04 07:16 · 5.7 · second-avis · 1 medium (décision corrigée non enregistrée après clarification), 10 low ; medium et 5 low en correction, mesure de la taille demandée · c6f6ebd
- 2026-11-04 07:20 · 5.7 · review · medium et 5 low corrigés ; roue-chat.html 146,6 Ko (main 125,4 Ko), roue.html 75 Ko inchangé · c46d8c9
- 2026-11-04 07:27 · 5.7 · CI · verte · c46d8c9
- 2026-11-04 07:27 · 5.7 · fusion · PR #36 fusionnée ; chat écrit complet sans GPU · 63d50d4
- 2026-11-04 07:27 · 7.1 · dev · lancé (Opus) ·
- 2026-11-04 07:31 · 7.2 · dev · matrice 3 OS × 3 moteurs en place, 6 jobs sur 9 verts, job le plus long 7,2 min ; Ubuntu : roue et tiroir du chat se recouvrent à 320 px (défaut de 5.5, polices Linux), correction robuste demandée ; tolérances élargies (sonde de couleur, seuil relief hors Windows, attente des confettis) · PR #35
- 2026-11-04 07:31 · 7.2 · CI · rouge (3 jobs Ubuntu) · PR #35
- 2026-11-04 07:35 · 7.1 · dev · fini, PR #37 ouverte ; banc règles dev 96/96 (modeProjection 2/2) ; roue.html 78,5 Ko, roue-chat.html 150,2 Ko ; iPhone à vérifier en 7.3 · b0cc756
- 2026-11-04 07:35 · 7.1 · second-avis · lancé ·
- 2026-11-04 07:38 · 7.1 · second-avis · 3 medium (spécificité CSS face au tiroir du chat, Échap sans Keyboard Lock, +52 px face au correctif 7.2), 3 low ; 2 medium et 2 low en correction, le 3e vérifié à la fusion avec 7.2 · b0cc756
- 2026-11-04 07:42 · 7.1 · review · 2 medium et 2 low corrigés (sélecteur plus fort en projection, Échap sans Keyboard Lock reste en pleine fenêtre) ; fusion après 7.2 pour passer la CI à 9 jobs · 56c1814
- 2026-11-04 07:49 · 7.2 · review · recouvrement corrigé par mesure de l'espace libre (--roue-libre, ResizeObserver) ; chat-panneau vert sur 9 jobs · 3e37433
- 2026-11-04 07:49 · 7.2 · CI · rouge : focus de la fenêtre d'inspection (5.7) sous Firefox et WebKit ; correction confiée à l'agent 5.7 sur la branche 7.2 · 3e37433
- 2026-11-04 07:52 · run · décision · Anaël : lot test2 tenu à l'écart des règles (relu par Anaël avant 5.8) ; installation de llama-server et essai de Julia-1 et Laya ; téléchargement des modèles de voix autorisés ·
- 2026-11-04 07:52 · run · décision · Anaël : suite des développements sur le PC 2 (RTX 3060 Laptop 6 Go, GPU disponible) pendant ses bancs sur ce PC ; passation après fusion de 7.2 et 7.1 ·
- 2026-11-04 07:52 · 5.8 · dev · lot test2 lancé (agent sans accès aux règles) ·
- 2026-11-04 07:58 · 7.2 · CI · verte sur 9 jobs, job le plus long 7,5 min ; focus de l'inspection corrigé (toggle des details sous Firefox et WebKit, déclencheur explicite sous WebKit) · d40f9b2
- 2026-11-04 07:58 · 7.2 · second-avis · lancé ·
- 2026-11-04 08:00 · 5.8 · dev · lot test2 écrit : 83 lignes, 14 catégories, chaque action au moins 3 fois, refuser 24 % ; fuite.test échoue sur 19 mots antérieurs au lot : base figée des mots des règles demandée · 89189ea
- 2026-11-04 08:01 · 7.2 · second-avis · 1 medium (recouvrement possible sous 128 px d'espace libre), 7 low ; medium, filtre du favicon et timeout des jobs en correction · d40f9b2
- 2026-11-04 08:01 · 5.8 · dev · base figée des mots des règles (226 mots, regles.ts dcfc48a) ; fuite.test vert ; PR #38 · 53725aa
- 2026-11-04 08:01 · 5.8 · second-avis · lot test2 lancé (justesse des attendus) ·
- 2026-11-04 08:05 · 5.8 · second-avis · test2 : aucun attendu faux ; 3 medium (base figée vue comme angle mort, rejeté ; régénération sans verrou ; verrouillage peu couvert), 6 low ; compléments demandés · 53725aa
- 2026-11-04 08:06 · 5.8 · review · test2 complété : 91 lignes, 9 en rotation, refuser 27 %, régénération de la base verrouillée · cbf4214
- 2026-11-04 08:14 · 5.8 · CI · verte · cbf4214
- 2026-11-04 08:14 · 5.8 · fusion · lot test2, PR #38 fusionnée (relecture d'Anaël avant l'essai) · 278507c
- 2026-11-04 08:48 · 7.2 · review · tiroir borné (--tiroir-max, minimum 5 rem), cas 568×480 ajouté (568×320 impossible avec la roue à 8 rem, à voir en recette 7.3) ; flaky d'un pixel sous Firefox Linux sur recette.spec.ts:245 · c465917
- 2026-11-04 08:48 · 7.2 · CI · verte sur 9 jobs · c465917
- 2026-11-04 08:48 · 7.2 · fusion · PR #35 fusionnée · e39589b
- 2026-11-04 08:48 · 7.1 · décision · main fusionnée dans la branche par l'orchestrateur, sans conflit, 754 tests unitaires verts ; CI sur 9 jobs lancée · 3433fb6
- 2026-11-04 09:00 · 7.1 · CI · rouge sur 9 jobs après intégration de 7.2 (bouton Projection : tabulation, positions, recouvrement à 568 px) ; correction confiée au PC 2 · 3433fb6
- 2026-11-04 09:00 · run · décision · passation vers le PC 2 : état poussé, prompt de reprise donné à Anaël ; fin du travail sur le PC 1 ·
- 2026-11-04 09:04 · run · décision · reprise sur le PC 2 : main f11aef4, npm ci, Ollama 0.40.13 (OLLAMA_ORIGINS localhost:5200), GPU 0/6144 Mo ; tev1:0.8b, lfm3:1.7b et lfm2.5:8b (étiquettes exactes) en téléchargement ; llama-server absent ; Anaël donne le feu vert au run autonome ·
- 2026-11-04 09:04 · 7.1 · dev · lancé (Opus, correction du code après 7.2 sur la branche existante) · 3433fb6
- 2026-11-04 09:04 · 5.10 · dev · étape B lancée (contrat réel tev1:0.8b, mesure GPU, llama-server, Julia-1 et Laya) ·
- 2026-11-04 · 7.1 · dev · fini : rangée .page__commandes (réglages et projection), tabulation réalignée, test 320 px en repli sans Fullscreen · e6fcad6
- 2026-11-04 · 7.1 · second-avis · 1 medium (3e ligne à 320 px, tiroir fermé), 2 low · e6fcad6
- 2026-11-04 · 7.1 · CI · rouge 5/9 : chat-panneau.spec.ts:87 à 568 px sous Ubuntu (rangée repliée, polices Linux) ; instables Firefox recette:245 et ambiance:51 ; correction demandée (bouton sans hauteur ajoutée) · e6fcad6
- 2026-11-04 · main · CI · rouge sur 2 instables Firefox (recette:245, ambiance:51), verte à la relance · f11aef4
- 2026-11-04 · 5.10 · dev · étape B finie, PR #41 : contrat réel constaté (answers par id, choice, probabilities, confidence, noul), seuilDecision 0,6 (tev1 dev 42/96, plancher 26) ; mémoire mesurée tev1 1369 Mo, Julia-1 187 Mo, Laya 529 Mo ; Julia-1 et Laya au plancher, non retenus ; llama-server b12100 installé · 7086df4
- 2026-11-04 · 5.10 · second-avis · 2 high (options partielles rejetées, seuil unique appliqué au noul : « supprime Paul » clarifié à tort), 2 low · 7086df4
- 2026-11-04 · 5.10 · dev · corrections : Object.hasOwn, seuilAmbigu distinct (0,9 provisoire, banc dev à refaire GPU libre), choice = argmax, confidence contrôlée · 6da4efe
- 2026-11-04 · 5.10 · review · lancée (Opus, OptionsEtages touché) · 6da4efe
- 2026-11-04 · 6.1 · dev · lancé (spec docs/specs/6.1-essai-stt.md écrite par l'orchestrateur ; GPU réservé à 6.1) ·
