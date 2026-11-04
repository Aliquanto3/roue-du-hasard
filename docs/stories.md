# Stories V1

Référence : `docs/spec.md`. Chaque story livre ses tests. Lint, types et tests ciblés sont verts avant la revue.

## Epic 1 — Socle et domaine

- **1.1 Socle du dépôt** : Vite + TS strict + singlefile, ESLint, Vitest, Playwright, CI trois OS, contrôle de taille (N3), CSP (N1), workflow Pages et workflow de release, `CLAUDE.md` à jour. *Fini quand* : une page vide construite en un fichier passe la CI et ne fait aucune requête en `file://`.
- **1.2 Domaine état et tirage** : modèle participants / cadeaux / historique, normalisation F1 à F3, tirage F5 et F6 (générateur injectable), persistance F14 tolérante aux pannes, schéma JSON F15. *Fini quand* : tests §7 verts, dont le χ².
- **1.3 Domaine couleurs** : palette, attribution avec contrainte de voisinage, choix du texte, validateur de la spec §5. *Fini quand* : test N de 2 à 200 vert.

## Epic 2 — La roue utilisable

- **2.1 ★ Roue canvas et rotation** : rendu pré-calculé, séparateurs sombres, libellés adaptatifs, bandeau F10, animation F6 à F8, `prefers-reduced-motion`, performance N7. *Fini quand* : l'angle d'arrêt est vérifié à 2, 3, 10, 200 noms et le rendu reste fluide à 100 noms.
- **2.2 Panneau de configuration et mise en page** : saisie, collage, couleurs F1 à F4, verrouillage pendant la rotation, mise en page N4, thèmes. *Fini quand* : parcours saisie puis lancement vert sur 320 et 1920 px.
- **2.3 Annonce et historique** : annonce F9, `aria-live`, cadeaux F11 et F12, historique et annulation F13, option de retrait F19. *Fini quand* : parcours complet avec et sans cadeaux vert.

- **2.4 Relief de la roue** : F20, rendu relief pré-calculé et bascule 2D / 3D mémorisée dans le panneau. *Fini quand* : l'arrêt reste exact dans les deux rendus, les contrastes des libellés sont tenus et le rendu reste fluide à 100 noms.

## Epic 3 — Ambiance et échange

- **3.1 Import / export** : interface de F15, avis de stockage F14. *Fini quand* : aller-retour exact, fichiers invalides refusés sans perte d'état, nom hostile (`<img onerror>`) rendu en texte.
- **3.2 Son et confettis** : F16 et F17, coupure mémorisée, désactivation en mouvement réduit.
- **3.3 Mode projection** : reportée en V1.2 (F18), reprise en 7.1.

## Epic 4 — Livraison

- **4.1 Recette automatisée** : matrice §9 sous Windows et Chromium, axe-core, absence de réseau, `file://` et stockage bloqué.
- **4.2 Distribution** : README français pour novices, lignes de commande réelles, QR code, activation de Pages, tag `v1.0.0` avec `roue.html` et notes, topic `status-deployed` si le projet est exposé. Préparation par l'agent (version, notes, README, workflows) ; activation de Pages et tag par l'orchestrateur après la recette d'Anaël (esthétique et son).

## Epic 5 — Chat local (V1.1)

Référence : `docs/v1.1-chat-slm.md`, corpus `docs/v1.1/`. Tout le code dans `src/chat/`, jamais importé par `src/main.ts`. Aucun test ne demande Ollama ni GPU : serveurs simulés.

- **5.1 ★ Outils et contrat du chat** : `src/chat/types.ts` (`Decision` de même forme que `attendu` du corpus, `EtatChat`, `Etage` : `decider(commande, etat, signal)` qui rend une décision avec sa trace ou `null` pour passer la main), `src/chat/cascade.ts` (étages dans l'ordre, enregistrement d'une ligne par étage), `src/chat/outils.ts` (actions offertes au chat avec schéma JSON des paramètres, correspondance avec `src/actions.ts`, résolution nom vers id avec `clarifier` sur homonyme ou nom absent, confirmation calculée ici), `src/chat/textes.ts`. Écarts du corpus réglés : `afficherCadeauSuivant` ajoutée à `actions.ts` (lecture seule), `retirerGagnants` vers `definirRetirerGagnants`, `modeProjection` refusée avec un code « indisponible » jusqu'à 7.1. *Fini quand* : chaque action du corpus a son outil, tests de résolution (homonymes, accents, nom hostile resté donnée), aucune exécution qui contourne `actions.ts`.
- **5.2 Banc d'essai du corpus** : script `npm run banc:chat -- --moteur <nom> --lot dev|test` qui passe chaque ligne du corpus à une cascade et compare à `attendu` (action, paramètres, confirmation). Sortie courte : score par action et par catégorie, plancher « refuse tout », latence médiane et p95 ; détail JSON dans un fichier ignoré par git. *Fini quand* : un moteur factice qui refuse tout donne exactement le plancher affiché par `verifier_corpus.py`.
- **5.3 Étage 1 : règles** : `src/chat/regles.ts`, normalisation (accents, casse, « euh », politesse), verbes et formes courantes, noms comparés à la liste (dont rapprochement phonétique français simple : « mari » donne Marie), extraction littérale des nouveaux noms, plusieurs actions, refus du hors sujet et des injections. Écrites sur le lot `dev` seulement. *Fini quand* : score par action relevé sur `test` et journalisé, aucune action destructive sans confirmation, aucune règle copiée d'une phrase de `test`.
- **5.4 Édition chat servie en local** : second build `dist/roue-chat.html` (entrée `src/main-chat.ts`), CSP propre avec `connect-src` limité à `http://localhost:11434` et `http://127.0.0.1:11434`, script `npm run chat` (serveur Node sans dépendance sur `http://localhost:5200`, fichiers de `dist/` seulement), notice `OLLAMA_ORIGINS=http://localhost:5200`. `check:size` contrôle les deux fichiers et vérifie que `roue.html` ne contient ni code du chat ni `connect-src` ouvert. *Fini quand* : `roue.html` inchangé dans sa CSP et ses tests, `roue-chat.html` chargé sur localhost sans erreur de CSP, release prête à publier les deux fichiers.
- **5.5 ★ Panneau de chat** : zone de saisie et fil de messages rendus en texte (N2), confirmation des actions destructives, mêmes refus et messages que l'interface (rotation, moins de 2 noms), fonctionne avec les règles seules quand aucun modèle ne répond. *Fini quand* : parcours E2E sur l'édition chat (ajout, homonyme clarifié, suppression confirmée, lancement refusé en rotation, nom hostile inerte), 320 et 1920 px.
- **5.6 Client SLM (étage 3)** : `src/chat/slm.ts`, interface mince vers Ollama (`/api/chat` avec outils), contexte minimal (consignes, outils, noms balisés comme données, historique court), réponse validée par le schéma de 5.1, délai maximal, détection d'Ollama absent (chat en règles seules, sans erreur affichée en boucle), réflexion activable. *Fini quand* : tests sur serveur simulé (réponse valide, invalide, délai, absent, tentative d'injection dans un nom).
- **5.10 Étage 2 : modèle de décision** (mixte) : sélection et installation de petits modèles de décision (environ 4 Go au plus), vérification du contrat réel `/v1/systemone` (questions `choice`, `score`, `noul`), `src/chat/decision.ts` (`choice` sur les outils, `choice` sur les noms présélectionnés, seuil de score pour redemander). Appels réels seulement après le signal « GPU disponible ». *Fini quand* : contrat documenté d'après un appel réel, tests sur serveur simulé, étage enregistré dans la cascade.
- **5.7 Fenêtre d'inspection** : masquée, bouton discret et raccourci clavier ; par message : étage décideur, contexte envoyé et sa taille en jetons, coupes, sortie brute (probabilités ou texte et appel d'outil), validation, action, latences ; verdict manuel juste ou erreur, taux par étage et par action, export JSON local, effacement. Tout en texte (N2). *Fini quand* : E2E sur une commande par étage (étages 2 et 3 simulés), export relu par le banc 5.2.
- **5.8 Essai des moteurs** (mixte, GPU) : banc 5.2 sur le lot `test` : règles seules ; règles + décision ; règles + SLM (Nemotron-3.5-Bolt-E4B, `lfm3:1.7b` avec et sans réflexion, `lfm2.5:8b` témoin) ; mémoire relevée sur la RTX 3050 8 Go. *Fini quand* : rapport `docs/v1.1/essai-moteurs.md`, choix de la cascade par défaut et seuil de déploiement proposés à Anaël.
- **5.9 Release V1.1.0** (humaine) : recette du chat par Anaël, version 1.1.0, release avec `roue.html` et `roue-chat.html`, notes, `portfolio.json` mis à jour.

## Epic 6 — Commande vocale (V1.3)

- **6.1 Essai du micro et de la transcription** (mixte) : micro dans Chrome sur l'édition localhost ; moteur STT local servi en localhost (whisper.cpp `small` ou `turbo`, Parakeet TDT 0.6B v3 via sherpa-onnx), téléchargement permis, mesures après « GPU disponible » ; confirmer que Web Speech passe par un service distant. *Fini quand* : choix du moteur, port et commande de lancement documentés, latence et mémoire relevées avec le modèle de chat chargé.
- **6.2 Bouton pour parler** : appui maintenu, enregistrement local, envoi au STT localhost, transcription affichée avant exécution puis passée à la cascade ; `connect-src` élargi au seul port du STT ; audio ni conservé ni envoyé ailleurs. *Fini quand* : E2E avec STT simulé, refus propre sans micro ou sans STT.
- **6.3 Prénoms à l'oral** : indices de la liste connue donnés au STT si possible, rapprochement phonétique de 5.3 sur la transcription, confirmation sous un score seuil, nouveau nom dicté toujours montré pour correction ; inspection : transcription brute, score, correction, latence STT, verdict qui distingue écoute et décision. *Fini quand* : tests sur les lignes « transcription orale » du corpus.
- **6.4 Essai en salle et release V1.3.0** (humaine) : enregistrements d'Anaël avec du bruit de fête, essai, release.

## Epic 7 — Supports et projection (V1.2)

Référence : `docs/v1.2-supports.md`.

- **7.1 Mode projection** (ex-3.3, F18) : plein écran avec repli CSS, contrôles d'édition masqués, Échap ou bouton pour sortir, action `modeProjection` branchée (et son outil du chat), 1920 et 3840 px. Opus.
- **7.2 CI multi-supports** : trois OS et trois moteurs rétablis dans `ci.yml`, défauts connus pris en compte (WebKit sans seuil de temps, Option+Tab, toucher Firefox, `AudioContext` WebKit Windows). *Fini quand* : CI verte sur la matrice complète, durée relevée.
- **7.3 Recette sur appareils et release V1.2.0** (humaine) : téléphone réel (toucher, 30 images/s à 100 noms, son sur iPhone, Pages et QR code), Edge, Firefox, Safari, projecteur.

## Revue

### Passe 1 (2026-10-31, SHA revu 20d792b)

Story 1.1. Base à jour (main 93ff8bd), pas de rebase. Mutation : sans la méta CSP, `check:size` et le E2E CSP échouent.

- Important, medium, second avis, corrigé : CSP non testée. Contrôle dans `check:size` (présence, directives, avant le premier script, donc aussi avant release et Pages) et E2E sur l'événement `securitypolicyviolation`.
- Important, medium, second avis, corrigé : garde externe trop étroit. Il refuse aussi références relatives, `//`, `url()` et API réseau. Le E2E signale aussi un fichier voisin demandé en `file:`, jusque-là filtré.
- Important, medium, orchestrateur, corrigé : CI lancée deux fois par commit de PR (18 jobs). `push` limité à `main`.
- Nit, low, second avis, corrigé : CSP sans `base-uri` ni `form-action`, directives qui n'héritent pas de `default-src`.
- Nit, low, second avis, corrigé : release sans lint, tests ni contrôle tag = version. Ajoutés ; le E2E reste à la CI de `main`.
- Nit, low, second avis, corrigé : `cancel-in-progress` à `false` sur Pages, pour ne pas couper un déploiement en cours.
- Nit, low, second avis, corrigé : `.claude/worktrees/` absent de `.gitignore` ; `.claude/` ignoré par ESLint.
- Nit, low, revue, corrigé : `permissions: contents: read` ajouté à la CI.
- Nit, low, second avis, rejeté : N1 testé au chargement seulement. Il n'y a pas d'autre parcours à ce stade, la story 4.1 les couvre.
