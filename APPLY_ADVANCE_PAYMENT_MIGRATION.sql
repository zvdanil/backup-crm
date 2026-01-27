-- ============================================
-- Применить миграцию для advance_payment
-- Выполнить в Supabase SQL Editor
-- ============================================

-- 1. Добавить 'advance_payment' в enum transaction_type
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'advance_payment';

-- 2. Проверить, что значение добавлено
SELECT unnest(enum_range(NULL::public.transaction_type)) AS transaction_type;
