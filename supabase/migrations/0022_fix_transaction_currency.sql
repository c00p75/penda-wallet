-- The chat and receipt edge functions used to hardcode 'USD' on the
-- transactions they created, so those rows render with the wrong symbol (the
-- UI formats each transaction in its own stored currency). A wallet is
-- single-currency and Penda has no FX, so a transaction's currency must always
-- equal its wallet's — realign any rows that drifted.
update transactions t
set currency = w.base_currency
from wallets w
where t.wallet_id = w.id
  and t.currency is distinct from w.base_currency;
