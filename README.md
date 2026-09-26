# Suivi horaires

Application web légère de suivi des horaires de travail, conçue pour une petite équipe et utilisable sur ordinateur comme sur smartphone.

## Fonctionnalités

### Espace employé

- Enregistrement rapide de l'heure d'arrivée et de départ
- Chronomètre de pause et correction manuelle de la durée
- Raccourcis pour ajuster la pause
- Saisie et correction des journées passées
- Gestion des jours non travaillés
- Historique hebdomadaire et mensuel
- Rappels lorsque la journée est incomplète
- Mode clair / sombre
- Changement de PIN depuis les réglages
- Fonctionnement hors ligne avec synchronisation au retour de la connexion
- Installation possible sur l'écran d'accueil comme PWA

### Espace pilotage

- Vue d'ensemble de l'équipe
- Suivi des journées complètes ou à compléter
- Consultation des volumes horaires
- Gestion du planning avec sélection de plusieurs jours et vues mensuelle / hebdomadaire
- Correction des saisies
- Validation des journées
- Paramétrage des objectifs horaires
- Historique des modifications
- Export des données pour le suivi administratif

## Architecture

Le projet utilise :

- **GitHub Pages** pour l'hébergement de l'interface
- **Supabase** pour la base de données et les fonctions serveur
- **Supabase Edge Functions** pour les rappels
- **Service Worker / PWA** pour l'installation mobile et le fonctionnement hors ligne

## Sécurité

Les accès utilisateurs reposent sur des liens privés et des codes PIN vérifiés côté serveur.

Les tables de la base ne sont pas directement exposées à l'interface publique : les opérations passent par des fonctions RPC dédiées.

Les identifiants privés, PIN et secrets serveur ne doivent jamais être ajoutés au dépôt GitHub.

## Utilisation

Chaque employé dispose d'un lien personnel. L'espace de pilotage possède un accès séparé.

Ce dépôt contient uniquement le code public de l'application. Les accès privés et la configuration sensible sont conservés séparément.

## Statut

Application développée pour simplifier le suivi quotidien des horaires d'une petite équipe.

## Correctifs récents

- Correction de l’affichage du planning mois/semaine dans le poste de pilotage.

- Le planning du pilotage permet aussi d'appliquer « travaillé » ou « non travaillé » à plusieurs jours en une seule action.

## Notifications

- Rappel à 19h pour les employés prévus au travail dont la journée est incomplète
- Synthèse push quotidienne pour le poste de pilotage
- La synthèse indique combien d’employés prévus ont complété leur journée et, si nécessaire, les prénoms restant à renseigner

- V1.10.6 : simplification de la fenêtre « À compléter » et correction de la largeur des champs d'heure sur iPhone.

- V1.10.7 : affichage des durées de pause au format heures/minutes (ex. 0h45, 1h30, 2h00).

- V1.10.8 : pause saisie/affichée uniquement au format 0h45 / 1h30 / 2h00, correction de l’ajout à l’écran d’accueil du pilotage sur iPhone et possibilité pour un salarié de repasser une journée prévue non travaillée en journée travaillée.

- V1.10.9 : exports déplacés en bas du pilotage, réglages horaires clarifiés et vue semaine mobile en défilement horizontal.

- V1.10.10 : explications des paramètres horaires regroupées une seule fois au-dessus des salariés.

- V1.10.11 : boutons de réglage de pause simplifiés en -5 / -30 / +5 / +30 ; seul le total reste affiché au format heures/minutes.
