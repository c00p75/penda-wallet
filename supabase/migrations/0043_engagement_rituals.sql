-- Morning money-minute, adaptive cadence, annual recap prefs + engagement telemetry.

alter table profiles
  add column if not exists engagement_stats jsonb not null
    default '{"nudge_opens":0,"nudge_dismisses":0,"opens_7d":0,"last_ritual_at":null}'::jsonb;

-- Pref keys morning_minute / annual_recap live inside notification_prefs jsonb
-- (defaults true when absent — see notifyPrefs normalize).

select
  cron.schedule(
    'daily-morning-money-minute',
    '0 6 * * *',
    $$
    select net.http_post(
      url := 'https://vnlfnepnhbkgwqthzxds.supabase.co/functions/v1/morning-money-minute',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $$
  );
