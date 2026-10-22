# MiniBCR

Un scanner de cartes de visite open source, en français, entièrement exécuté
dans le navigateur. Site statique compatible avec GitHub Pages, sans compte,
sans API de traitement ni clé secrète.

## Fonctionnalités

- Capture avec la caméra de l'appareil, après autorisation, dans une vue occupant
  l'écran avec l'image entière (sans recadrage), ou import d'une photo.
- Reconnaissance locale du texte français/anglais avec Tesseract.js / WebAssembly.
- Deux lectures comparées : image originale et image agrandie avec contraste
  normalisé, niveaux de gris et inversion des cartes sombres. Redressement des
  lignes par Tesseract, segmentation adaptée aux cartes et aux blocs de texte.
  Recherche du sens de lecture à 90°, 180° et 270° si la lecture est insuffisante.
- Suggestions de prénom, nom, organisation, fonction, téléphones, e-mails, site
  et adresse. **Vérification humaine nécessaire** : l'OCR et les heuristiques
  peuvent se tromper, particulièrement sur les noms, logos et mises en page complexes.
- Photo et texte original visibles pendant la correction, rotation et nouvelle analyse.
- Coordonnées tolérant les espaces parasites autour des points, du `@` et du
  protocole d'un site ; correction `O/0`, `I/1` uniquement dans les numéros étiquetés.
  Détection des noms aidée par la taille des lignes et les e-mails quand disponibles.
  Une nouvelle analyse conserve les champs corrigés ou vidés à la main.
- Carnet avec recherche, modification, sélection, suppression et alerte de doublon
  sur e-mail ou téléphone identique.
- Export vCard 3.0 `.vcf` d'un contact, d'une sélection ou du carnet complet.
- Sauvegarde automatique du carnet et d'un brouillon dans IndexedDB.
- Interface mobile avec navigation Scanner, Catalogue et Historique.
- Catalogue visuel des cartes avec recherche, tri et filtre des fiches avec photo.
- Recadrage à quatre coins, correction de perspective et rotation de la photo.
  Détection de bords proposée lorsque le fond est suffisamment distinct : toujours
  vérifier et ajuster les coins à la main. Proportions libres, carte standard ou carrée.
- Retouche douce de la lumière en couleur pour conserver le design, avec aperçu
  et possibilité de désactiver la retouche. L'original reste disponible pour un autre cadrage.
- Fiche détaillée avec photo téléchargeable, coordonnées et historique des changements.
- Historique local des scans enregistrés, ajouts, modifications, retouches, suppressions
  et restaurations. Une ancienne fiche sans historique n'a pas d'événements inventés.
- Sauvegarde et restauration `.json` du catalogue complet, avec photos et historique.
  À la restauration, les identifiants déjà présents sont conservés et les nouvelles
  fiches sont ajoutées. Une sauvegarde incompatible ou invalide est refusée avant écriture.
- Effacement des contacts, photos, historique et brouillon depuis l'interface.
- PWA installable avec icône sur l'écran d'accueil et ouverture dans une fenêtre dédiée.
- Application et catalogue accessibles hors connexion après une première ouverture
  réussie de la version publiée. Téléchargement explicite du moteur pour scanner
  également sans réseau. La taille réelle du pack est affichée avant téléchargement.
- Mise à jour proposée à l'utilisateur, sans rechargement automatique de sa fiche.

## Installer sur téléphone

Publier la version construite sur une URL **HTTPS**, par exemple GitHub Pages.
Le bouton **Installer l'app** explique le parcours adapté au navigateur :

- Android / Chrome : utiliser le bouton d'installation si proposé, ou le menu
  du navigateur « Installer l'application » / « Ajouter à l'écran d'accueil ».
- iPhone / Safari : Partager → Sur l'écran d'accueil, puis activer « Ouvrir comme
  app web » si proposé et confirmer Ajouter.

L'icône ouvre MiniBCR en mode `standalone`. Le navigateur décide quand proposer
son dialogue natif : l'app ne peut pas forcer l'installation. Les instructions
manuelles restent disponibles quand ce dialogue n'existe pas.

Après la première ouverture en ligne, l'interface est mise en cache. Depuis
**Installer l'app**, cliquer **Préparer le scan hors connexion** pour télécharger
les fichiers OCR. Attendre le message **Scan hors connexion prêt** avant de couper
le réseau. Le catalogue reste consultable sans ce téléchargement supplémentaire.

L'installation n'est pas une sauvegarde. Selon le téléphone et le navigateur,
l'app installée peut avoir un stockage distinct du site ouvert dans un onglet :
exporter le catalogue complet depuis le site, puis le restaurer dans l'app si nécessaire.
Les installations natives sur appareils physiques restent à vérifier.

Sources : [installation PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable),
[ajout à l'écran d'accueil iPhone](https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios).

## Développement

Node.js 22.12+ ou 24 recommandé.

```sh
npm ci
npm run dev
```

Le script prépare les fichiers OCR depuis les dépendances npm dans `public/ocr/`.
Les moteurs, workers, fichiers de langue et notices sont servis par le site
lui-même. Aucun CDN, outil d'analyse ou police distante n'est utilisé à l'exécution.
La première analyse doit télécharger plusieurs Mo si le pack OCR n'a pas déjà été
préparé. Le service worker est activé uniquement dans la version construite ; le
serveur de développement Vite garde son fonctionnement normal sans cache PWA.
La caméra nécessite HTTPS ou `localhost`. Le micro n'est jamais demandé.

```sh
npm test
npm run build
npm run preview
```

Le script de construction génère le service worker et une liste exacte des fichiers
statiques. Le cache est limité à cette liste : aucun contact ni photo n'est mis dans
le cache réseau, les données personnelles restent dans IndexedDB. Le pack OCR est
versionné par le contenu de ses fichiers. La mise à jour du site attend une action
sur « Mettre à jour » ; le catalogue et le brouillon ne sont pas effacés.

Pour tester la PWA, utiliser `npm run build && npm run preview`. `localhost` permet
les essais sur l'ordinateur. L'adresse `127.0.0.1` de l'ordinateur ne permet pas à
un téléphone d'y accéder : un déploiement HTTPS est nécessaire pour les essais mobiles.

Le dossier `dist/` est autonome et peut être servi par tout hébergeur statique.
Les chemins relatifs fonctionnent également sous `/MiniBCR/`.

## GitHub Pages

Le dépôt de travail a actuellement une origine Gitea. Pour publier sur GitHub,
créer ou utiliser un dépôt GitHub et y pousser le projet. Dans **Settings → Pages**,
choisir **GitHub Actions** comme source. Le workflow fourni construit et publie
`dist/` lors d'un push sur `main`, ou par déclenchement manuel.

Vérifier l'URL du lien « Open source » dans `index.html` si le dépôt change.
Le workflow est fourni ; aucune publication n'est faite par la création des fichiers.

## Sauvegarde et confidentialité

Les photos et les données extraites ne sont pas envoyées à un serveur de traitement.
L'hébergeur reçoit les requêtes habituelles pour télécharger le site et le moteur.
Le carnet, les photos associées et le brouillon sont conservés uniquement dans
IndexedDB, pour cette origine, ce navigateur et cet appareil. Les saisies du
brouillon sont sauvegardées après 250 ms et à la fermeture de la fiche.

Le stockage évolue automatiquement de la version 1 à la version 2 en conservant
les fiches et photos existantes. Chaque fiche retouchée conserve `sourceImage`
(original), `image` (version choisie) et `photoEdits` (coins, rotation, proportions,
réglage de lumière). Les événements d'historique sont enregistrés dans la même
transaction que l'ajout, la modification ou la suppression de leur fiche.

Cette version est une application web adaptée aux téléphones. La sauvegarde
`.json` est destinée à conserver les images et à transférer le catalogue entre
navigateurs. L'import est limité à 120 Mo, 5 000 fiches et 50 000 événements.
Le `.vcf` conserve son rôle d'import dans Contacts et ne contient pas les photos.
Les sauvegardes complètes contiennent des données personnelles : les conserver
dans un emplacement privé. Aucun chiffrement supplémentaire n'est appliqué.

Ce stockage n'est ni chiffré par l'application ni une sauvegarde garantie : effacement
des données du site, navigation privée, quotas ou éviction par le navigateur peuvent
le supprimer. Exporter régulièrement le carnet. En cas d'échec de sauvegarde, un
message persistant signale le mode temporaire ; l'export reste accessible.
Éviter d'ouvrir plusieurs onglets pour modifier le même carnet : pas de synchronisation
temps réel entre onglets. L'effacement du carnet ne supprime pas les fichiers `.vcf`
déjà téléchargés, ni les contacts déjà importés dans une autre application.

L'import dans Contacts dépend du système : télécharger le `.vcf`, puis l'ouvrir ou
l'importer depuis l'application Contacts. Aucun ajout automatique universel n'est
promis. Les photos servent à la vérification locale et ne sont pas incluses dans
l'export, pour conserver un fichier léger.

## Tests navigateur

```sh
npx playwright install chromium
npm run test:e2e
```

Pour utiliser Chrome déjà installé : `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`.
Les tests utilisent uniquement des cartes et contacts fictifs. Ils couvrent notamment
la persistance après rechargement, les brouillons, les exports, l'effacement, les
erreurs de stockage, la caméra simulée et l'OCR réel sans connexion à un service tiers.
Une vérification sur de vrais téléphones iOS/Android reste nécessaire pour évaluer
la qualité des prises de vue et l'import dans les applications natives.

Les comparatifs OCR de quatre cartes fictives (claire, petits caractères peu
contrastés, sombre et tournée à 90°) figurent dans `docs/evidence/ocr-*-comparison.json`.
Ils comparent les mêmes modèles avec l'ancienne lecture unique et le nouveau
pipeline. Ils ne donnent pas un taux général de précision sur des cartes réelles.
La comparaison de plusieurs lectures augmente le temps d'analyse ; elle reste annulable.

## Licence

MIT pour MiniBCR. Tesseract.js, son moteur et les données de langue conservent
leurs licences respectives ; les notices disponibles dans les paquets sont copiées
dans `ocr/` lors de la construction.
