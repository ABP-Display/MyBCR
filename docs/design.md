# Direction de MiniBCR

Application de scan mobile en français, sans compte. L'action principale est de
photographier une carte ou d'importer une image, vérifier les champs et exporter.
Référence produit : le parcours validé dans la conversation, dépôt initial vide.

Direction : carnet de travail sobre, fond ivoire, encre vert foncé, accent citron,
typographie système, cadre de visée rappelant les coins d'une carte. Aucun réseau
social, écran marketing ou faux contact. Deux zones sur ordinateur, flux vertical
sur mobile. Cibles : 390x844 et 1440x900. Zones tactiles de 44 px minimum,
focus visible, dialogues natifs et labels explicites.

La caméra utilise un dialogue occupant la fenêtre, avec vidéo entière en
`object-fit: contain`, commandes séparées et hauteur dynamique `100dvh`.
Vérifier aussi le paysage mobile à 844x390 : les quatre coins du flux et les
commandes doivent rester visibles. La vidéo ne doit pas agrandir ou découper
le reste de la page. Fermeture et Échap arrêtent les pistes vidéo.

États : liste vide avec action scanner ; caméra uniquement après clic et consentement ;
chargement OCR avec progression et annulation ; erreur avec saisie manuelle ;
extraction partielle modifiable ; succès avec contact visible et export disponible.
Sauvegarde IndexedDB des contacts et du brouillon, avec message explicite si elle
échoue. L'export reste possible en mode temporaire. Suppression confirmée.

## Catalogue mobile (22 octobre 2026)

Navigation mobile fixe : Scanner, Catalogue, Historique. Chaque vue répond à une
tâche : créer une fiche, retrouver son design et ses coordonnées, puis revoir les
actions enregistrées. Le catalogue est la vue de retour si des fiches existent.
La grille sur ordinateur devient une colonne de cartes sur téléphone. Les dates
et actions ne doivent pas masquer les visuels. La fiche présente les coordonnées
et sa propre chronologie. Le statut de sauvegarde dégradée reste visible dans
toutes les vues.

Le recadrage est un dialogue avec quatre poignées tactiles de 44 px, ajustables
au clavier. L'utilisateur vérifie le résultat avant application. Les couleurs du
design sont conservées : le prétraitement noir et blanc de l'OCR n'est pas utilisé
pour la photo du catalogue. Une annulation garde la photo précédente. L'original
est conservé, les restaurations sont validées avant écriture et la migration de
base ne supprime pas les anciens scans.
