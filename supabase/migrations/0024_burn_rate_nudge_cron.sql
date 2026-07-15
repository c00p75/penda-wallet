-- Schedule the burn-rate nudge: a proactive check that pings a member when a
-- budget is running hot (spend well ahead of the calendar) or already over.
-- Mirrors the weekly-insights cron authorization — a Vault shared secret sent
-- as X-Cron-Secret alongside the gateway's Authorization bearer.
--
-- Runs every day at 17:00 UTC (early evening for the primary market), so a
-- heads-up lands while there's still a day to course-correct. The function
-- itself caps at one nudge per member per day.
select
  cron.schedule(
    'daily-burn-rate-nudge',
    '0 17 * * *',
    $$
    select net.http_post(
      url := 'https://vnlfnepnhbkgwqthzxds.supabase.co/functions/v1/burn-rate-nudge',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $$
  );
