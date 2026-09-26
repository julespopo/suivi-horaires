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
