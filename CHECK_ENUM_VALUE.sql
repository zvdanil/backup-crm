-- ============================================
-- Проверить, что значение 'advance_payment' добавлено в enum
-- Выполнить ПОСЛЕ STEP1 для проверки
-- ============================================

SELECT unnest(enum_range(NULL::public.transaction_type)) AS transaction_type;
