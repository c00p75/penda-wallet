-- Onboarding enrichment: household/team size, primary financial goal,
-- notification opt-in, a qualitative (currency-agnostic) income band, and
-- gender. Gender is tone/relatability context for the AI only — it must
-- never influence financial advice, calculations, or any other logic (see
-- buildUserContextSection in supabase/functions/chat-message/index.ts).
alter table profiles
  add column if not exists household_size integer
    check (household_size is null or (household_size > 0 and household_size <= 50)),
  add column if not exists primary_goal text
    check (primary_goal is null or primary_goal in (
      'build_emergency_fund', 'pay_off_debt', 'save_for_something', 'track_spending'
    )),
  add column if not exists income_range text
    check (income_range is null or income_range in (
      'tight', 'stable', 'comfortable', 'prefer_not_to_say'
    )),
  add column if not exists gender text not null default 'prefer_not_to_say'
    check (gender in ('woman', 'man', 'non_binary', 'prefer_not_to_say')),
  add column if not exists notification_opt_in boolean not null default true;
