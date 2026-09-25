# Suivi des horaires — V1.2

## Nouveautés
- Chaque employé utilise son lien personnel et arrive directement sur un écran PIN.
- PIN à 4 chiffres (maquette locale uniquement).
- Session conservée jusqu'à déconnexion manuelle.
- L'espace de pilotage utilise un lien séparé, sans lien visible depuis le site employé.
- Ajout du statut **Jour non travaillé** : il retire la journée de la liste « À compléter ».
- Les journées passées peuvent toujours être complétées en une seule fenêtre et les journées existantes modifiées.
- Manifests PWA individuels : chaque employé peut ajouter son lien à l'écran d'accueil et revenir directement sur son espace.

## Liens de démonstration
Les codes ci-dessous sont **uniquement pour tester cette V1 statique**. Ils ne constituent pas une protection réelle car le code d'un site GitHub Pages est public.

- Emma : `employee.html?token=emma-4F7P2A` — PIN `1842`
- Julie : `employee.html?token=julie-9K3M8D` — PIN `5726`
- Marc : `employee.html?token=marc-2R6V1Q` — PIN `3914`
- Thomas : `employee.html?token=thomas-8K4X2Q` — PIN `8463`
- Pilotage : `pilotage.html?access=gestion-7Q9M2X` — PIN `2648`

## Important — sécurité
Cette V1.2 reste une maquette fonctionnant avec `localStorage`. Les PIN sont donc vérifiés côté navigateur et peuvent être retrouvés dans le code source public.

Pour une vraie protection, la prochaine étape sera :
- Supabase pour l'authentification / validation des PIN côté serveur ;
- base de données commune ;
- règles d'accès par employé ;
- accès pilotage distinct ;
- rappels automatiques.

## GitHub Pages
Place tous les fichiers à la racine du dépôt, commit puis push. GitHub Pages republiera automatiquement la version.

## V1.6
- Planning par jour et par employé depuis le calendrier de pilotage.
- Lundi-vendredi travaillés par défaut ; samedi-dimanche non travaillés par défaut.
- Statuts « À valider » / « Validé » pour les journées complètes.
- Toute correction effectuée côté employé repasse automatiquement la journée en « À valider ».
- Correction et validation directement depuis l’espace de pilotage.
- Objectif horaire hebdomadaire et seuil indicatif paramétrables par employé (35 h par défaut).
- Rapport mensuel imprimable / enregistrable en PDF depuis le mois affiché dans le calendrier.
