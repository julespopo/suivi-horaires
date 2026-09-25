# Suivi des horaires — V1.8 Supabase

Cette version utilise désormais **Supabase comme base centrale**. Les saisies ne sont plus stockées comme source officielle dans le `localStorage` du navigateur.

## Ce qui change

- authentification PIN vérifiée côté Supabase ;
- aucun PIN n'est présent dans le code public GitHub Pages ;
- sessions conservées localement jusqu'à déconnexion manuelle ;
- horaires, planning, validation et objectifs synchronisés entre appareils ;
- espace salarié et espace pilotage séparés ;
- les week-ends sont non travaillés par défaut, sauf modification du planning ;
- toute correction d'un salarié repasse la journée en **À valider** ;
- export CSV et rapport mensuel imprimable / PDF conservés.

## Configuration publique

`config.js` contient uniquement :

- l'URL publique du projet Supabase ;
- la **publishable key** destinée au navigateur.

Ne jamais ajouter dans GitHub une `secret key`, une clé `service_role`, ni le mot de passe de la base.

## Liens de test actuellement créés dans Supabase

- Emma : `employee.html?token=emma-4F7P2A` — PIN `1842`
- Julie : `employee.html?token=julie-9K3M8D` — PIN `5726`
- Marc : `employee.html?token=marc-2R6V1Q` — PIN `3914`
- Thomas : `employee.html?token=thomas-8K4X2Q` — PIN `8463`
- Pilotage : `pilotage.html?access=gestion-7Q9M2X` — PIN `2648`

Ces identifiants servent à la phase de test. Avant mise en service, il faudra créer les vrais noms, PIN et tokens personnels.

## Déploiement GitHub Pages

Copie tous les fichiers à la racine du dépôt, puis commit et push. GitHub Pages publiera automatiquement la nouvelle version.

## Prérequis Supabase

Le script `supabase_setup_suivi_horaires.sql` doit avoir été exécuté une fois dans le SQL Editor du projet Supabase.
