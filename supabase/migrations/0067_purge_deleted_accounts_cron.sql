-- Daily sweep for accounts past their 30-day deletion grace period (see
-- 0066). Auth matches other crons (Vault cron_secret).
select
  cron.schedule(
    'daily-purge-deleted-accounts',
    '15 3 * * *',
    $$
    select net.http_post(
      url := 'https://vnlfnepnhbkgwqthzxds.supabase.co/functions/v1/purge-deleted-accounts',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $$
  );
