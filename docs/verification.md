# Vérifications de MiniBCR

Le 21 octobre 2026, sur Chrome desktop automatisé, avec données fictives :

- `npm test` : 14 tests réussis (extraction, ambiguïté, e-mails et sites espacés,
  téléphones français et internationaux, confusions O/0 et I/1, noms composés,
  ordre nom-prénom, adresses, échappement vCard et repli des lignes Unicode).
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` : les scénarios applicatifs et la suite
  PWA sont décrits ci-dessous.
- Construction de production servie sous `/MiniBCR/`, comme sur GitHub Pages.
- OCR réel français/anglais d'une carte générée : nom, entreprise, e-mail,
  téléphone extraits ; aucune requête HTTP externe observée dans ce parcours.
- Brouillon et carnet retrouvés après rechargement, modification, recherche,
  sélection et contenu du fichier exporté vérifiés.
- Refus de permission et caméra simulée, libération des pistes vidéo,
  annulation OCR, échec de téléchargement et de stockage vérifiés.
- Vue caméra à 390×844, 844×390 et 1440×900 : dialogue aux dimensions de l'écran,
  vidéo non recadrée, quatre repères de couleur visibles et commandes à l'intérieur
  de la fenêtre. Fermeture, Échap et capture arrêtent les pistes du flux simulé.
- Relancer l'OCR conserve une organisation corrigée et une fonction volontairement
  laissée vide par l'utilisateur.
- Effacement normal et effacement refusé par le stockage vérifiés.
- Valeurs HTML affichées comme du texte, sans injection dans la liste.
- Rendu relu à 390×844 et 1440×900 ; aucun débordement horizontal détecté.
- Audit initial Lighthouse mobile sur le serveur de développement : accessibilité 100,
  bonnes pratiques 100, SEO 100. Rapport conservé dans `evidence/lighthouse.json`.
  Ce résultat automatisé ne remplace pas un audit manuel exhaustif.

Les captures et observations se trouvent dans `evidence/`. Les textes de contacts
et la carte qui y apparaissent sont fictifs. Les tests ne valident pas la qualité
OCR sur une collection représentative de cartes imprimées.

## Comparatif OCR synthétique

Même modèle français/anglais et même extraction actuelle pour interpréter les textes
des deux pipelines. La référence reproduit l'ancien OCR : image limitée à 2000 px,
une seule lecture en mode texte dispersé, sans préparation ni redressement automatique.
Le nouveau pipeline compare la lecture originale et une lecture avec préparation,
et recherche le sens de lecture si nécessaire. Aucun service distant utilisé.

| Carte fictive | Champs exacts avec l'ancien OCR | Champs exacts après correction |
| --- | --- | --- |
| Claire | 7 / 7 | 7 / 7 |
| Petits caractères, faible contraste | 4 / 7 | 7 / 7 |
| Fond sombre | 7 / 7 | 7 / 7 |
| Tournée à 90° | 0 / 7 | 7 / 7 |

Les champs comparés sont prénom, nom, organisation, fonction, téléphone, e-mail
et site. Les rapports `evidence/ocr-*-comparison.json` contiennent les sorties
textuelles et les valeurs attendues. Ce petit corpus de quatre images synthétiques
montre des régressions évitées et deux améliorations ciblées ; il ne démontre pas
une précision générale de 100 %, ni une qualité garantie sur des photos réelles.

Sources techniques consultées : [qualité des images Tesseract](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html),
[FAQ Tesseract.js et origine des modèles](https://github.com/naptha/tesseract.js/blob/master/docs/faq.md),
ainsi que l'implémentation locale de `rotateAuto` dans Tesseract.js 7.

Restent à vérifier sur appareils physiques : consentement et autofocus de la caméra,
performances sur téléphones modestes, Safari iOS, import des fichiers vCard dans les
applications natives. Aucun déploiement distant n'a été effectué.

## Catalogue mobile, le 22 octobre 2026

- Ancienne base IndexedDB v1 avec photo migrée vers v2 sans perte de la fiche.
- Recadrage de quatre coins déplacés par pointeur, proportions 85×55 et sortie
  JPEG redressée. Correspondance mathématique des quatre coins vérifiée en test unitaire.
- Conservation de pixels colorés dans la sortie ; une carte sombre n'est pas inversée
  par la retouche destinée au catalogue. Le traitement OCR reste séparé.
- Poignées accessibles au clavier, rotation de l'original et annulation du recadrage.
- Photo originale, photo retouchée et paramètres retrouvés dans IndexedDB après
  rechargement. La fiche peut aussi être conservée sans coordonnées.
- Navigation Scanner/Catalogue/Historique, détail de fiche et chronologie locale.
- Sauvegarde JSON téléchargée, effacement du catalogue puis restauration avec
  photos et historique ; validation des données avant écriture.
- Suppression d'une fiche conservant une ligne d'historique sans photo, avec lien
  d'ouverture retiré. L'effacement global efface aussi cet historique.
- Correction d'une course entre deux sauvegardes du brouillon : une écriture ancienne
  ne peut plus annoncer « sauvegardé » pendant qu'une saisie récente attend son écriture.

Captures synthétiques : `evidence/mobile-catalogue.png`, `mobile-photo-editor.png`
et `mobile-history.png`. Cette livraison est une version web adaptée aux téléphones ;
elle n'ajoute pas de paquet natif. La PWA installable a ensuite été ajoutée (voir ci-dessous). Le recadrage proposé
par détection doit être vérifié ; les tests ne garantissent pas une détection automatique
de tous les contours de cartes réelles.

## PWA installable, le 22 octobre 2026

- Manifest, mode standalone, portée et URL de démarrage vérifiés sous `/MiniBCR/`.
- Icônes PNG 192, 512 et masque adaptatif, plus icône Apple : réponses et dimensions
  des fichiers vérifiées ; identité visuelle relue.
- Parcours du dialogue d'installation testé avec un événement de navigateur simulé.
  Aide iPhone vérifiée avec un agent utilisateur simulé ; cela ne teste pas iOS réel.
- Catalogue consultable après rechargement réseau coupé, puis OCR réel au premier
  lancement du moteur sans connexion après préparation explicite de son pack.
- Export vCard et persistance des fiches vérifiés dans cette session hors connexion.
- Nouvelle version servie réellement par le serveur local de test : mise en attente,
  bouton de confirmation, rechargement et brouillon conservé vérifiés.
- Les autres tests applicatifs désactivent les service workers pour isoler leurs
  simulations de réseau ; la suite `pwa.spec.js` les active et vérifie les vrais caches.
- Pas de cache réseau des photos et contacts ; seuls les fichiers statiques sont listés.

Limites : installation système sur Android/iPhone, quotas et éviction des caches sur
appareils réels non vérifiés. Le site doit être publié en HTTPS pour une installation
sur téléphone. L'aperçu local permet les essais sur ordinateur, sans publication.
