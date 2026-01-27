-- ============================================
-- ШАГ 1: Добавить 'advance_payment' в enum transaction_type
-- Выполнить ПЕРВЫМ в Supabase SQL Editor
-- ============================================
-- ВАЖНО: Это должно быть выполнено в отдельной транзакции!

ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'advance_payment';

-- Проверить, что значение добавлено
SELECT unnest(enum_range(NULL::public.transaction_type)) AS transaction_type;
