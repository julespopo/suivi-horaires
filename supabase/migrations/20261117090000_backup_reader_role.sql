-- Rôle dédié aux sauvegardes hebdomadaires : lecture seule, rien d'autre.
-- Il est créé sans connexion possible ; le mot de passe et le droit de connexion
-- sont ajoutés ensuite par scripts/backup/installer.sh, qui génère un mot de passe
-- aléatoire, le range dans le trousseau macOS et ne l'écrit jamais dans un fichier.
-- BYPASSRLS est nécessaire pour lire les tables protégées par RLS (sans politique),
-- il ne donne aucun droit d'écriture.
CREATE ROLE backup_reader NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE BYPASSRLS CONNECTION LIMIT 2;
ALTER ROLE backup_reader SET statement_timeout = '5min';
ALTER ROLE backup_reader SET default_transaction_read_only = on;

GRANT USAGE ON SCHEMA public TO backup_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO backup_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO backup_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON SEQUENCES TO backup_reader;
