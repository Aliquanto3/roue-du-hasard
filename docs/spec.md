# Roue du hasard — spécification V1

## 1. Objectif

Désigner au hasard, devant des invités, qui reçoit un cadeau, en faisant tourner une roue portant leurs noms. L'organisateur n'a besoin ni de droits administrateur, ni de compte, ni de compétence technique.

Personas : **l'organisateur** (prépare la liste sur PC ou téléphone, peut ne pas connaître la ligne de commande) et **le public** (regarde, éventuellement sur une télé ou un projecteur).

## 2. Décisions validées

| Sujet | Décision |
|---|---|
| Après un tirage | La personne reste dans la roue et peut regagner, sauf si l'option F19 est cochée. Retrait manuel possible dans la liste |
| Cadeaux | Liste facultative. Sans liste, l'application fonctionne avec les noms seuls |
| Diffusion | Un fichier `roue.html` autonome, et la même page sur GitHub Pages pour les téléphones |
| Ambiance V1 | Son coupable, confettis, plein écran / projection, import / export |

## 3. Exigences fonctionnelles

### Participants
- **F1** Ajouter, renommer, supprimer un nom, et coller une liste d'un coup (un nom par ligne ; virgules et points-virgules acceptés).
- **F2** Aucune limite logicielle sur le nombre de noms. Le lancement exige au moins 2 noms, sinon le bouton est désactivé et un message explique pourquoi.
- **F3** Espaces de début et de fin retirés, lignes vides ignorées, 60 caractères au maximum par nom. Les doublons sont permis (deux « Marie ») avec un avertissement non bloquant ; le nombre de doublons est affiché.
- **F4** Chaque nom a une couleur par défaut (§5) modifiable par un sélecteur natif, avec « Revenir à la couleur par défaut » par nom et pour toute la liste. Une couleur personnalisée qui manque de contraste avec son libellé déclenche seulement le choix automatique du texte noir ou blanc le plus lisible, jamais un refus.

### Roue et tirage
- **F5** Secteurs de taille égale : chaque nom a exactement la même probabilité.
- **F6** Le gagnant est tiré **avant** l'animation avec `crypto.getRandomValues` et un rejet d'échantillonnage (aucun biais de modulo, jamais `Math.random`). L'animation ne fait que conduire la roue au secteur tiré, à une position aléatoire dans ce secteur, jamais sur une frontière.
- **F7** Lancement par le bouton, par la touche Espace ou Entrée quand le focus est sur le bouton, et par un toucher sur la roue. Pas de lancement au glisser en V1.
- **F8** Rotation de 4 à 6 s (au moins 4 tours), décélération naturelle, avec un pointeur fixe en haut. Une seule rotation à la fois ; l'édition de la liste est verrouillée pendant la rotation.
- **F9** À l'arrêt : annonce en grand du nom, de sa couleur et du cadeau s'il existe, avec les boutons « Relancer » et « Fermer ».
- **F10** Si le texte devient illisible à cause du nombre de noms (corps inférieur à 11 px CSS), les libellés ne sont plus dessinés dans les secteurs. Un bandeau sous le pointeur affiche alors en continu le nom du secteur courant. Les noms longs sont tronqués avec « … » dans le secteur, jamais dans l'annonce.

- **F20** Rendu de la roue au choix : relief (par défaut) ou plat, par une bascule mémorisée. Le relief donne un effet 3D vu de face en canvas 2D (ombres, reflet, jante, moyeu et pointeur en volume), sans WebGL ni perspective : le secteur sous le pointeur, les libellés et leur contraste (F4, §5) restent ceux du rendu plat, et N7 reste tenu à 1 000 noms.

### Cadeaux et historique
- **F11** Liste facultative et ordonnée de cadeaux, avec la même saisie que les noms. Chaque tirage attribue le prochain cadeau, annoncé avant le lancement : « Cadeau n° 3 sur 8 : la bougie ».
- **F12** Quand tous les cadeaux sont attribués, le lancement est désactivé et un récapitulatif s'affiche, avec « Recommencer les attributions ».
- **F13** L'historique des tirages (ordre, nom, cadeau, heure) est visible, copiable et effaçable après confirmation. « Annuler le dernier tirage » retire la ligne et rend le cadeau disponible.

- **F19** Case « Retirer les gagnants de la roue », décochée par défaut et mémorisée. Cochée, le gagnant sort de la roue à la fermeture de l'annonce et « Annuler le dernier tirage » l'y remet. S'il reste moins de 2 noms, le lancement est désactivé et un message l'explique ; s'il reste 1 nom et un cadeau, ce nom peut être attribué sans rotation.

### Conservation et échange
- **F14** La configuration et l'historique sont enregistrés automatiquement dans le navigateur. Si le stockage est indisponible (navigation privée, `file://` restreint), l'application fonctionne quand même et affiche un avis discret invitant à exporter.
- **F15** Export dans un fichier JSON versionné, import du même fichier. Un fichier invalide ou d'une version inconnue est refusé avec un message clair, sans toucher à l'état courant. L'import demande confirmation s'il remplace une liste non vide.

### Ambiance
- **F16** Son généré par Web Audio, sans fichier : cliquetis synchronisé sur le passage des secteurs (fréquence plafonnée), fanfare courte à l'annonce. Bouton de coupure toujours visible, choix mémorisé.
- **F17** Confettis à l'annonce, sans bibliothèque externe, en canvas.
- **F18** Mode projection : la roue et l'annonce occupent tout l'écran, avec les contrôles d'édition masqués. Utilise l'API Fullscreen si elle existe, sinon un mode pleine fenêtre en CSS (cas de l'iPhone). Échap ou un bouton pour sortir.

## 4. Exigences non fonctionnelles

- **N1 Confidentialité** : aucune requête réseau après le chargement, ni analytique, ni police ou ressource externe. Politique CSP en méta-balise interdisant toute connexion sortante. Les noms ne quittent jamais l'appareil.
- **N2 Sécurité** : les noms et cadeaux, y compris importés, sont rendus uniquement en texte (`textContent` ou canvas, jamais `innerHTML`).
- **N3 Autonomie** : une version unique en un seul fichier HTML, tout en ligne, moins de 200 Ko, fonctionnant en `file://` et en HTTPS, sans dépendance d'exécution.
- **N4 Responsive** : sans défilement horizontal de 320 px à 3840 px de large, en portrait et en paysage. Roue et panneau côte à côte sur écran large, empilés sur téléphone, roue d'abord. Cibles tactiles d'au moins 44 px. Respect des zones sûres (`safe-area-inset`).
- **N5 Navigateurs** : deux dernières versions de Chrome, Edge, Firefox, Safari (macOS et iOS), Chrome Android.
- **N6 Accessibilité** : WCAG 2.2 AA. Parcours complet au clavier, focus visible, résultat annoncé par `aria-live`, aucun axe bloquant ou sérieux relevé par axe-core. La couleur n'est jamais la seule information : le nom est toujours lisible en toutes lettres (secteur ou bandeau). Avec `prefers-reduced-motion`, la rotation et les confettis sont remplacés par un fondu court vers le secteur gagnant.
- **N7 Performance** : 60 images/s visées sur PC et 30 au minimum sur un téléphone moyen, jusqu'à 1 000 noms (roue pré-rendue dans un canvas hors écran, redessinée seulement à l'édition). Rendu net selon `devicePixelRatio`.
- **N8 Langue** : interface en français. Textes centralisés dans un seul module, sans système de traduction en V1.

## 5. Identité visuelle et couleurs

### Palette par défaut : Okabe-Ito, sept couleurs, dans cet ordre

Choisie par Anaël pour son ton vif et festif, après comparaison avec Tol Muted, plus robuste mais jugée moins festive. Le noir de la palette d'origine est écarté : il sert au texte et aux séparateurs.

| # | Couleur | Texte | Contraste du texte |
|---|---|---|---|
| 1 | `#E69F00` orange | noir `#111111` | 8,4 |
| 2 | `#56B4E9` ciel | noir | 8,2 |
| 3 | `#F0E442` jaune | noir | 14,3 |
| 4 | `#CC79A7` rose | noir | 6,2 |
| 5 | `#009E73` vert | noir | 5,5 |
| 6 | `#D55E00` vermillon | noir | 4,9 |
| 7 | `#0072B2` bleu | blanc | 5,2 |

**Mesures du 2026-10-31**, simulation protanopie, deutéranopie et tritanopie à sévérité 1 (coloraide), en retenant le pire cas sur la vision normale et les trois simulations :

| Palette | ΔE2000 min., toutes paires | ΔE2000 min., voisines dans le meilleur ordre | Couleurs |
|---|---|---|---|
| **Okabe-Ito** (retenue) | **7,9** | **18,0** (17,96 mesuré, arrondi à la décimale) | 7 |
| Tol Muted | 10,4 | 22,7 | 9 |
| Tol Vibrant | 7,5 | 18,1 | 6 |
| Tol Bright | 1,6 | 24,1 | 6 |

La paire la plus proche (orange et rose, 7,9) n'est jamais voisine grâce à la règle d'attribution. Les couleurs se répètent dès 8 noms : les noms écrits en toutes lettres restent la vraie distinction (N6).

### Règles
- **Attribution** : la couleur `i` suit l'ordre du tableau, qui est un cycle où deux voisines gardent un ΔE2000 CVD d'au moins 17,95 (minimum mesuré du cycle : 17,96, affiché 18,0 une fois arrondi à une décimale). Pour tout N, y compris quand N n'est pas multiple de 7, la séquence est ajustée pour que deux secteurs voisins, **y compris le dernier et le premier**, respectent ce seuil. Faisabilité vérifiée pour tout N de 2 à 200 ; un test le garantit.
- **Séparateurs** : trait sombre `#14162B`, de contraste au moins 3,4:1 sur chaque couleur. Le blanc ne convient pas (1,3:1 sur le jaune).
- **Thème** : fond sombre `#14162B` par défaut, qui fait ressortir la roue et convient à la projection. Thème clair si le système le demande. Polices système uniquement (N1).
- **Couleur personnalisée** : réservée au secteur concerné, sans recalcul des autres.

## 6. Diffusion

Sans droits administrateur et sans Node pour l'utilisateur final.

| Usage | Geste |
|---|---|
| Un clic | Télécharger `roue.html` depuis la release GitHub, double-cliquer |
| Une ligne, Windows | `irm https://github.com/Aliquanto3/roue-du-hasard/releases/latest/download/roue.html -OutFile roue.html; start roue.html` |
| Une ligne, macOS / Linux | `curl -fLO https://github.com/Aliquanto3/roue-du-hasard/releases/latest/download/roue.html && open roue.html` (`xdg-open` sous Linux) |
| Téléphone | URL GitHub Pages, avec un QR code dans le README |

Pas d'exécutable `.exe` : non signé, il déclencherait SmartScreen, ce qui est moins simple qu'un fichier HTML.

Conséquence assumée : `roue.html` et GitHub Pages ne partagent pas leurs données. Pour passer une liste du PC au téléphone, on utilise l'export et l'import.

## 7. Technique

- TypeScript strict, Vite, `vite-plugin-singlefile`, sans framework. Node 22 pour le développement seulement.
- `src/domain/` : état, tirage, palette, schéma d'import, en fonctions pures. `src/ui/` : roue canvas, panneaux, annonce, ambiance. `src/texts.ts` : textes.
- Tests : Vitest pour le domaine, Playwright (Chromium, Firefox, WebKit, plus émulations mobiles) pour les parcours, axe-core pour l'accessibilité.
- CI GitHub Actions : lint, types, tests, construction, contrôle de taille, sur Windows, macOS et Ubuntu. Déploiement Pages depuis `main`. Release sur tag `vX.Y.Z` avec `roue.html` en pièce jointe.

### Critères de vérification du hasard
- Test unitaire : sur 1 000 000 de tirages avec 7 noms, test du χ² non rejeté à p = 0,001, à graine de test fixe pour le générateur injecté.
- Test unitaire : pour tout tirage, l'angle d'arrêt tombe dans le secteur gagnant, hors frontières.
- E2E : le nom annoncé est celui du secteur sous le pointeur, vérifié à 2, 3, 10 et 200 noms.

## 8. Hors périmètre V1

Secteurs pondérés, comptes, synchronisation entre appareils, roue du cadeau, traduction, PWA hors ligne, exécutable, lancement au glisser.

## 9. Critères d'acceptation globaux

1. Un novice ouvre `roue.html` en double-cliquant, saisit des noms, lance la roue et lit le gagnant sans aide.
2. Les parcours E2E passent sur les trois moteurs, en 320, 390, 768, 1366, 1920 et 3840 px de large.
3. Aucune requête réseau détectée pendant les parcours, sur le fichier construit.
4. Les parcours passent en `file://` et en HTTPS, stockage disponible ou non.
5. Recette humaine d'Anaël : esthétique, son, téléphone réel, projection.
