UPDATE finance_transactions
SET type = 'cash_in'
WHERE type = 'payment'
  AND cash_withdrawal_id IS NOT NULL;
