-- 0005 authorized the cron call by checking whether the Authorization bearer
-- token matched Deno.env SUPABASE_SERVICE_ROLE_KEY inside the function, but
-- that runtime value doesn't reliably match the legacy service-role JWT
-- fetched via the platform API. Switch to a dedicated shared secret ('
-- cron_secret' in Vault) sent as its own header, independent of whichever
-- service-role key format Supabase currently issues.
select cron.unschedule('weekly-insights');

select
  cron.schedule(
    'weekly-insights',
    '0 20 * * 0', -- Sundays at 20:00 UTC
    $$
    select net.http_post(
      url := 'https://vnlfnepnhbkgwqthzxds.supabase.co/functions/v1/generate-insights',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $$
  );
