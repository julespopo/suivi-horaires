# Suivi horaires

Application web légère de suivi des horaires pour une petite équipe travaillant auprès de plusieurs employeurs.

**Version actuelle : V2.0 Alpha 2.9**

Le projet est hébergé sur GitHub Pages et utilise Supabase pour les données, l'authentification par lien privé + PIN et les notifications.

## Fonctionnalités

### Espace salarié
- lien personnel + PIN à 4 chiffres ;
- journée travaillée / non travaillée ;
- plusieurs créneaux et plusieurs employeurs dans une même journée ;
- heure de début / heure de fin en direct ou saisie manuelle ;
- pause modifiable ;
- suppression d'un créneau saisi par erreur ;
- historique semaine / mois ;
- journées à compléter ;
- demandes de congés ;
- mode jour / nuit ;
- installation sur l'écran d'accueil ;
- fonctionnement hors ligne pour les actions quotidiennes, avec synchronisation automatique au retour du réseau.

### Pilotage
- vue globale des salariés ;
- planning semaine / mois ;
- sélection de plusieurs jours pour les passer travaillés ou non travaillés ;
- détail des salariés prévus en vue semaine ;
- validation et correction des journées ;
- gestion des employeurs et de leurs affectations ;
- gestion / validation des congés ;
- objectifs horaires ;
- synthèses et export PDF ;
- notifications de synthèse.

## Architecture

```text
.
├── index.html
├── employee.html
├── pilotage.html
├── app.js
├── styles.css
├── config.js
├── sw.js
├── manifest.json
├── manifest-employee.json
├── manifest-pilotage.json
├── icons/
└── supabase/
    ├── README.md
    └── functions/
        └── send-reminders/
```

Le frontend reste volontairement en **HTML / CSS / JavaScript sans framework**.

## Sécurité

`config.js` contient uniquement des valeurs prévues pour être publiques dans le navigateur :
- URL du projet Supabase ;
- clé Supabase publishable ;
- clé VAPID publique.

Les tables Supabase ne sont pas accessibles directement aux utilisateurs : les opérations passent par des RPC serveur.

Ne jamais ajouter au dépôt :
- clé `service_role` ;
- clé VAPID privée ;
- `CRON_SECRET` ;
- PIN réels ;
- liens privés / `link_token` réels ;
- exports de données salariés.

## Mode hors ligne

Après une première connexion en ligne, l'espace salarié conserve localement les données nécessaires.

Les actions quotidiennes hors ligne sont placées dans une file locale puis synchronisées automatiquement. Des identifiants d'idempotence côté serveur évitent les doublons lors des reprises réseau.

Les corrections complexes de l'historique restent volontairement réservées au mode en ligne.

## Notifications

À 19 h (Europe/Paris) :
- un salarié prévu au travail avec une journée incomplète peut recevoir un rappel ;
- le Pilotage peut recevoir une synthèse du nombre de journées complétées.

La fonction serveur de référence se trouve dans `supabase/functions/send-reminders/`.

## Développement

La branche `main` doit rester utilisable.

Pour une modification importante :
1. créer une branche ;
2. effectuer les changements ;
3. tester les espaces salarié et Pilotage ;
4. vérifier le fonctionnement PWA / hors ligne ;
5. fusionner seulement après validation.

## Mise en service

La période suivie par l'application commence au **1er septembre 2026**. Les périodes antérieures ont été gérées manuellement et ne sont pas proposées comme journées à compléter.
