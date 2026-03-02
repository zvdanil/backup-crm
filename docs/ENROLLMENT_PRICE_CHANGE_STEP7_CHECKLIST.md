# Step 7 Checklist: Enrollment Price Change Stabilization

This checklist is used after steps 5-6 to verify that price history and balances stay consistent.

## Scope

- Feature: change enrollment price from student activity card.
- Data path: `set_enrollment_price` + targeted balance refresh.
- Expected model: history intervals are `[effective_from, effective_to)`.

## Regression Scenarios

- [ ] **Sequential changes**
  - Set price `100` from `2026-02-13`.
  - Then set price `200` from `2026-03-01`.
  - Expected: February uses `100`, March uses `200`.

- [ ] **Backdate change**
  - Add a new change with `effective_from` in a past month.
  - Expected: only affected past/future months are recalculated; unrelated months do not drift.

- [ ] **Empty custom price**
  - Save with empty custom price (fallback to default activity price).
  - Expected: no validation errors, history record is created with `custom_price = null`.

- [ ] **Discount change**
  - Update only `discount_percent`.
  - Expected: history interval is updated from selected date; discount is applied in balances.

- [ ] **Range recalc mode**
  - Use `apply_mode = recalc_range` with `recalc_from` and `recalc_to`.
  - Expected: targeted months refresh without full-project recalculation.

## UI/UX Checks

- [ ] Dialog validates invalid values: negative price, discount outside `0..100`, invalid recalc range.
- [ ] On partial refresh failure, user sees fallback toast:
  - "Ціну збережено, але перерахунок частково не оновився".
- [ ] No noisy debug logs are produced during successful flow.

## Data Integrity Checks (manual SQL)

Use queries from:

- `docs/sql/enrollment_price_history_step7_diagnostics.sql`

Expected:

- no duplicate `(enrollment_id, effective_from)`,
- no invalid intervals (`effective_to <= effective_from`),
- no overlapping intervals for the same enrollment.

## Sign-off

- [ ] All scenarios passed on test student.
- [ ] No regressions in student card balance view.
- [ ] No regressions in enrollment price history dialog.
