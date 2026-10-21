# Vérifications de la première version

Le 21 octobre 2026, sur Chrome desktop automatisé, avec données fictives :

- `npm test` : 4 tests réussis (extraction, ambiguïté, échappement vCard,
  retours à la ligne, repli des lignes Unicode).
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` : 9 scénarios réussis.
- Construction de production servie sous `/MiniBCR/`, comme sur GitHub Pages.
- OCR réel français/anglais d'une carte générée : nom, entreprise, e-mail,
  téléphone extraits ; aucune requête HTTP externe observée dans ce parcours.
- Brouillon et carnet retrouvés après rechargement, modification, recherche,
  sélection et contenu du fichier exporté vérifiés.
- Refus de permission et caméra simulée, libération des pistes vidéo,
  annulation OCR, échec de téléchargement et de stockage vérifiés.
- Effacement normal et effacement refusé par le stockage vérifiés.
- Valeurs HTML affichées comme du texte, sans injection dans la liste.
- Rendu relu à 390×844 et 1440×900 ; aucun débordement horizontal détecté.
- Lighthouse mobile sur le serveur de développement : accessibilité 100,
  bonnes pratiques 100, SEO 100. Rapport conservé dans `evidence/lighthouse.json`.
  Ce résultat automatisé ne remplace pas un audit manuel exhaustif.

Les captures et observations se trouvent dans `evidence/`. Les textes de contacts
et la carte qui y apparaissent sont fictifs. Les tests ne valident pas la qualité
OCR sur une collection représentative de cartes imprimées.

Restent à vérifier sur appareils physiques : consentement et autofocus de la caméra,
performances sur téléphones modestes, Safari iOS, import des fichiers vCard dans les
applications natives. Aucun déploiement distant n'a été effectué.
