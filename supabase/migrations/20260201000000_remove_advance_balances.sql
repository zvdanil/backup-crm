-- ============================================
-- Удаление авансовых счетов (advance_balances)
-- Удаляем таблицу, триггеры, функции и тип транзакции
-- ============================================

-- 1. Удаляем триггеры
DROP TRIGGER IF EXISTS on_payment_transaction_created ON public.finance_transactions;
DROP TRIGGER IF EXISTS on_charge_transaction_created ON public.finance_transactions;

-- 2. Удаляем функции
DROP FUNCTION IF EXISTS public.handle_payment_transaction();
DROP FUNCTION IF EXISTS public.auto_charge_from_advance_simplified();
DROP FUNCTION IF EXISTS public.auto_charge_from_advance(UUID, UUID, UUID, DECIMAL);
DROP FUNCTION IF EXISTS public.distribute_advance_payment(UUID, UUID, DECIMAL);
DROP FUNCTION IF EXISTS public.distribute_advance_payment(UUID, UUID, NUMERIC);
DROP FUNCTION IF EXISTS public.distribute_advance_payment(UUID, UUID, DECIMAL, DATE);
DROP FUNCTION IF EXISTS public.distribute_advance_payment(UUID, UUID, DECIMAL, DATE, UUID);
DROP FUNCTION IF EXISTS public.rebuild_advance_distribution(UUID, UUID);
DROP FUNCTION IF EXISTS public.recalculate_advance_balance_for_student(UUID, UUID);
DROP FUNCTION IF EXISTS public.delete_payment_transaction(UUID, TEXT);

-- 3. Удаляем таблицу advance_balances
DROP TABLE IF EXISTS public.advance_balances CASCADE;

-- 4. Удаляем тип 'advance_payment' из enum transaction_type
-- Примечание: PostgreSQL не поддерживает удаление значений из enum напрямую
-- Можно пересоздать enum без 'advance_payment', но это требует изменения всех зависимых таблиц
-- Оставляем тип в enum, но он больше не будет использоваться
-- Если нужно полностью удалить, можно выполнить:
-- ALTER TYPE public.transaction_type RENAME TO transaction_type_old;
-- CREATE TYPE public.transaction_type AS ENUM ('income', 'expense', 'payment', 'salary', 'household');
-- ALTER TABLE public.finance_transactions ALTER COLUMN type TYPE public.transaction_type USING type::text::public.transaction_type;
-- DROP TYPE public.transaction_type_old;

-- Комментарий: Тип 'advance_payment' оставлен в enum для обратной совместимости,
-- но больше не используется в системе. Если в будущем понадобится полностью удалить,
-- можно выполнить пересоздание enum (см. комментарий выше).

COMMENT ON TYPE public.transaction_type IS 'Типы транзакций. Тип advance_payment больше не используется, но оставлен для обратной совместимости.';
