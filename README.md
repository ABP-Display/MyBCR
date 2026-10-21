# MiniBCR

Un scanner de cartes de visite open source, en français, entièrement exécuté
dans le navigateur. Site statique compatible avec GitHub Pages, sans compte,
sans API de traitement ni clé secrète.

## Fonctionnalités

- Capture avec la caméra de l'appareil, après autorisation, ou import d'une photo.
- Reconnaissance locale du texte français/anglais avec Tesseract.js / WebAssembly.
- Suggestions de prénom, nom, organisation, fonction, téléphones, e-mails, site
  et adresse. **Vérification humaine nécessaire** : l'OCR et les heuristiques
  peuvent se tromper, particulièrement sur les noms, logos et mises en page complexes.
- Photo et texte original visibles pendant la correction, rotation et nouvelle analyse.
- Carnet avec recherche, modification, sélection, suppression et alerte de doublon
  sur e-mail ou téléphone identique.
- Export vCard 3.0 `.vcf` d'un contact, d'une sélection ou du carnet complet.
- Sauvegarde automatique du carnet et d'un brouillon dans IndexedDB.
- Effacement des contacts et du brouillon depuis l'interface.

## Développement

Node.js 22.12+ ou 24 recommandé.

```sh
npm ci
npm run dev
```

Le script prépare les fichiers OCR depuis les dépendances npm dans `public/ocr/`.
Les moteurs, workers, fichiers de langue et notices sont servis par le site
lui-même. Aucun CDN, outil d'analyse ou police distante n'est utilisé à l'exécution.
La première analyse doit télécharger plusieurs Mo ; ce n'est pas une PWA hors ligne.
La caméra nécessite HTTPS ou `localhost`. Le micro n'est jamais demandé.

```sh
npm test
npm run build
npm run preview
```

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

## Licence

MIT pour MiniBCR. Tesseract.js, son moteur et les données de langue conservent
leurs licences respectives ; les notices disponibles dans les paquets sont copiées
dans `ocr/` lors de la construction.
