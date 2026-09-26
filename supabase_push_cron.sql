-- À exécuter APRÈS avoir déployé l'Edge Function `send-reminders`
-- et ajouté ses secrets VAPID / CRON_SECRET dans Supabase.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Ces secrets servent uniquement au job serveur. Ils ne vont pas dans GitHub.
select vault.create_secret('https://lzylctcdzqgnnlpbrtvn.supabase.co', 'hours_project_url');
select vault.create_secret('sb_publishable_PmgFOTssDOy42tVmQCxlNg_NyivpFWA', 'hours_publishable_key');
select vault.create_secret('REPLACE_WITH_YOUR_CRON_SECRET', 'hours_cron_secret');

-- Le job tourne une fois par heure. L'Edge Function n'envoie réellement
-- que lorsque l'heure locale Europe/Paris est 19h, ce qui gère automatiquement
-- le changement heure d'été / heure d'hiver.
select cron.schedule(
  'suivi-horaires-reminder-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='hours_project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey',(select decrypted_secret from vault.decrypted_secrets where name='hours_publishable_key'),
      'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='hours_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) as request_id;
  $$
);
