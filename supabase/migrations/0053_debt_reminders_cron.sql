-- Daily debt reminders: notify wallet members when an open debt is due today,
-- tomorrow, or still overdue. Auth matches other crons (Vault cron_secret).
select
  cron.schedule(
    'daily-debt-reminders',
    '5 8 * * *',
    $$
    select net.http_post(
      url := 'https://vnlfnepnhbkgwqthzxds.supabase.co/functions/v1/debt-reminders',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $$
  );
