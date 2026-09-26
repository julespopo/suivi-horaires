# Suivi horaires — V2.0 Alpha 1

Cette branche de test ajoute les fonctions nécessaires au fonctionnement réel d'un groupement d'employeurs tout en conservant la V1.10.11 comme version de secours.

## Nouveautés V2

### Plusieurs employeurs dans une même journée

Le poste de pilotage peut créer plusieurs employeurs et choisir lesquels sont accessibles à chaque salarié.

Un salarié peut ensuite enregistrer plusieurs créneaux dans une même journée, par exemple :

- 08:00–12:00 chez un premier employeur
- 13:30–17:00 chez un second employeur

Un seul créneau peut être ouvert à la fois. Le total journalier est calculé à partir de la somme réelle des créneaux.

### Congés

- Un salarié peut déclarer une période de congé à l'avance.
- Une demande créée par le salarié apparaît dans le pilotage en attente de validation.
- Le pilotage peut valider ou refuser la demande.
- Le pilotage peut également créer directement un congé validé pour un salarié.
- Un congé validé retire le salarié des journées à compléter et des rappels de 19 h.
- Une période contenant déjà des heures de travail ne peut pas être validée comme congé sans correction préalable.

### Pause simplifiée

Le chronomètre de pause a été supprimé.

- 1 seul créneau : pause automatique de 1h30 par défaut.
- 2 créneaux ou plus : pause automatique de 0h00, puisque les intervalles entre les créneaux ne sont déjà pas comptés comme temps travaillé.
- Toute modification manuelle de la pause est conservée.
- Raccourcis : -5 / -30 / +5 / +30.
- Affichage : 0h45, 1h30, 2h00, etc.

## Architecture

Les tables Supabase restent privées. Le navigateur n'y accède pas directement : les opérations utilisateur passent par des fonctions RPC `security definer` et les opérations serveur des notifications utilisent la clé `service_role` dans l'Edge Function.

La V2 ajoute quatre tables :

- `employers`
- `employee_employers`
- `work_segments`
- `leave_requests`

`work_entries` reste le résumé quotidien utilisé par le reste de l'application et par la validation.

## Installation de l'Alpha 1

1. Conserver une copie de la V1.10.11.
2. Exécuter `supabase_v2_0_alpha1.sql` dans Supabase SQL Editor. La vérification finale doit afficher 4 lignes.
3. Remplacer le code de l'Edge Function `send-reminders` par la version V2 et la redéployer. Les secrets VAPID et le cron existants ne changent pas.
4. Publier les fichiers web V2 sur GitHub Pages.
5. Dans Pilotage, créer les employeurs puis cocher les salariés autorisés pour chacun.
6. Tester avec un seul salarié avant d'étendre à toute l'équipe.

## Parcours de test conseillé

1. Créer deux employeurs dans Pilotage et les affecter à un salarié.
2. Côté salarié : démarrer un créneau chez le premier employeur, le terminer, puis démarrer et terminer un second créneau chez le deuxième.
3. Vérifier le total de la journée et le comportement de la pause automatique.
4. Modifier la pause avec les boutons rapides.
5. Vérifier que la journée apparaît à valider dans Pilotage et que les deux créneaux sont visibles.
6. Déclarer un congé futur côté salarié, puis le valider dans Pilotage.
7. Vérifier que les dates de congé ne sont plus indiquées comme journées à compléter.
8. Tester le rappel de 19 h sur une journée incomplète et la synthèse Pilotage.

## Limitation connue de cette Alpha

Le démarrage et l'arrêt d'un créneau V2 demandent actuellement une connexion Internet. La PWA reste installable et le cache d'interface fonctionne, mais la nouvelle saisie multi-employeurs n'est pas encore mise en file d'attente hors connexion.

Aucun identifiant privé ni PIN n'est documenté ici.


### Alpha 1.1
- Congés pilotage : suppression du doublon visuel « À valider » sur chaque demande en attente.
- Le compteur global indique désormais « demande(s) en attente ».
- Correction des cartes V2 en mode nuit : congés, employeurs et créneaux utilisent désormais des surfaces réellement adaptées au thème sombre.


### Alpha 1.2
- Correction du contraste du sélecteur Semaine / Mois en mode nuit.
- Nouveau calendrier de congés en sélection continue : premier clic = premier jour, second clic = dernier jour.
- Navigation entre les mois par flèches ou glissement horizontal sur mobile.
- Le même sélecteur est utilisé côté salarié et côté pilotage.


### Alpha 1.3 — correctif de stabilité
- Forçage du chargement des versions cohérentes de `app.js` et `styles.css` afin d’éviter un mélange HTML récent / JavaScript en cache.
- Le nouveau calendrier de congés ne peut plus bloquer tout le reste de l’application s’il ne se charge pas : un sélecteur de dates natif sert de repli.
- Initialisation anticipée de l’éditeur de créneaux pour éviter le blocage des journées à compléter après une erreur JavaScript annexe.
- Nouveau cache PWA `v2-0-alpha1-3`.
