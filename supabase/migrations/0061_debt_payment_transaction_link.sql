-- Link a debt payment back to the linked pocket transaction it posted, so
-- deleting that transaction can offer to reverse the payment too.

alter table debt_payments
  add column transaction_id uuid references transactions (id) on delete set null;
