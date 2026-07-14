-- Ambient SMS / clipboard MoMo parsing (bet 1) creates transactions from
-- pasted mobile-money messages. Track them as their own source so the
-- Activity Log can show where each entry came from.
alter table transactions drop constraint transactions_source_check;
alter table transactions add constraint transactions_source_check
  check (source in ('manual', 'chat', 'voice', 'receipt', 'recurring', 'sms'));
