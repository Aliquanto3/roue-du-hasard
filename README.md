# Roue du hasard

> À retirer à la release : ce README décrit la V1 prévue. La version `v1.0.0` et la page pour téléphone ne sont pas encore publiées : certaines fonctions et les liens ci-dessous ne seront actifs qu'à ce moment-là.

Une roue qui désigne au hasard qui reçoit un cadeau : vous saisissez les noms des invités (et, si vous voulez, la liste des cadeaux), vous lancez la roue, et le gagnant est annoncé en grand avec des confettis. Aucune installation, aucun compte, aucun droit administrateur : un seul fichier `roue.html` suffit.

## Un clic

1. Sur la page de la [dernière release](https://github.com/Aliquanto3/roue-du-hasard/releases/latest), téléchargez le fichier `roue.html` (dans la liste « Assets »). Ne prenez pas les archives « Source code ».
2. Double-cliquez dessus : il s'ouvre dans votre navigateur.

## Une ligne de commande

Si vous préférez le terminal, une seule ligne télécharge le fichier et l'ouvre.

**Windows**, dans PowerShell (appuyez sur la touche Windows, tapez `PowerShell`, puis Entrée ; la commande ne fonctionne pas dans l'invite de commandes) :

```powershell
irm https://github.com/Aliquanto3/roue-du-hasard/releases/latest/download/roue.html -OutFile roue.html; start roue.html
```

**macOS** :

```sh
curl -fLO https://github.com/Aliquanto3/roue-du-hasard/releases/latest/download/roue.html && open roue.html
```

**Linux** (remplacez `open` par `xdg-open`) :

```sh
curl -fLO https://github.com/Aliquanto3/roue-du-hasard/releases/latest/download/roue.html && xdg-open roue.html
```

## Sur téléphone

Ouvrez <https://aliquanto3.github.io/roue-du-hasard/> ou scannez ce code. La page se charge une fois depuis GitHub Pages (connexion nécessaire à ce moment-là) ; ensuite, vos noms ne quittent jamais le téléphone.

![QR code vers https://aliquanto3.github.io/roue-du-hasard/](docs/qr-telephone.svg)

### Passer une liste du PC au téléphone

Le fichier `roue.html` et la page du téléphone ne partagent pas leurs données. Pour transférer une liste :

1. Sur le PC, utilisez l'**export** : l'application enregistre un fichier.
2. Envoyez ce fichier à votre téléphone (messagerie, courriel, câble).
3. Sur le téléphone, utilisez l'**import** et choisissez ce fichier.

Un fichier invalide ou qui ne vient pas de cette application est refusé avec un message clair, sans toucher à votre liste actuelle. Si l'import remplace une liste non vide, l'application demande confirmation.

## Ce que fait l'application

- **Participants** : ajout, renommage et suppression d'un nom, ou collage d'une liste d'un coup (un nom par ligne, virgules et points-virgules acceptés). Les doublons sont permis avec un avertissement, 60 caractères au maximum par nom. Il faut au moins 2 noms pour lancer la roue.
- **Couleurs** : chaque nom reçoit une couleur par défaut, modifiable, avec retour à la couleur par défaut par nom ou pour toute la liste. Le texte reste lisible.
- **Cadeaux** : liste facultative et ordonnée ; chaque tirage attribue le prochain cadeau, annoncé avant le lancement. Une fois tous les cadeaux attribués, un récapitulatif s'affiche.
- **Lancement** : bouton, touche Espace ou Entrée sur le bouton, ou toucher sur la roue. La rotation dure de 4 à 6 secondes.
- **Annonce** : nom, couleur et cadeau du gagnant en grand, avec « Relancer » et « Fermer ».
- **Historique** : ordre, nom, cadeau et heure de chaque tirage ; copiable, effaçable après confirmation, avec « Annuler le dernier tirage ».
- **Retirer les gagnants** : case facultative qui sort le gagnant de la roue.
- **Rendu** : roue en relief ou plate, au choix.
- **Ambiance** : son généré dans le navigateur (avec bouton de coupure) et confettis.
- **Accessibilité** : utilisable au clavier, résultat annoncé aux lecteurs d'écran, animation remplacée par un fondu si votre système demande moins de mouvement.

## Un tirage équitable

Tous les secteurs ont la même taille : chaque nom a exactement la même chance. Le gagnant est tiré **avant** que la roue ne tourne, avec le générateur aléatoire de sécurité du navigateur, sans aucun biais. L'animation se contente de conduire la roue jusqu'au secteur déjà choisi : elle ne décide de rien.

## Vie privée

Les noms ne quittent jamais votre appareil. Une fois la page chargée, l'application n'envoie aucune requête sur le réseau et n'utilise ni statistiques ni ressource externe ; le navigateur lui interdit d'ailleurs toute connexion sortante.

## Si le navigateur bloque le stockage

La liste et l'historique sont enregistrés automatiquement dans le navigateur. En navigation privée, ou si le navigateur bloque le stockage pour un fichier local, l'application fonctionne quand même : elle affiche un avis discret qui vous invite à **exporter** votre liste pour ne pas la perdre.

## Contribuer

Réservé aux développeurs. Il faut Node 22.

```sh
npm ci
npm run lint          # ESLint
npm run typecheck     # types
npm test              # tests unitaires (ciblé : npx vitest run src/<fichier>.test.ts)
npm run build         # produit dist/roue.html
npm run check:size    # taille (moins de 200 Ko) et ressources externes
npm run test:e2e:chromium   # parcours E2E (construit dist/ et dist-harnais/)
```

Détails techniques : le tirage utilise `crypto.getRandomValues` avec rejet d'échantillonnage (jamais `Math.random`), l'export est un fichier JSON versionné, et une politique de sécurité du contenu bloque les connexions sortantes.

Le harnais de la roue se lance avec `npm run harnais` (`http://localhost:5199/?n=10`). La spécification est dans `docs/spec.md`.

## Licence

Apache 2.0 : voir le fichier [LICENSE](LICENSE).
