# Исправление проблемы с custom_statuses

## Проблема
`custom_statuses` сохраняются в БД, но при загрузке возвращаются как пустой массив `[]`.

## Возможные причины:
1. JSONB из Supabase может возвращаться как строка, а не как объект
2. При кастинге типа `as BillingRules` данные могут теряться
3. Структура данных может быть неправильной

## Решение

Нужно добавить явную проверку и парсинг `billing_rules` в `useActivity`:

```typescript
// В useActivity, после получения data из БД:
let billingRules: BillingRules | null = null;

if (data.billing_rules) {
  // Если billing_rules - строка, парсим её
  if (typeof data.billing_rules === 'string') {
    try {
      billingRules = JSON.parse(data.billing_rules) as BillingRules;
    } catch (e) {
      console.error('[useActivity] Failed to parse billing_rules string:', e);
      billingRules = null;
    }
  } 
  // Если billing_rules - объект, используем как есть
  else if (typeof data.billing_rules === 'object') {
    billingRules = data.billing_rules as BillingRules;
  }
  
  // Проверяем, что custom_statuses есть и это массив
  if (billingRules && !Array.isArray(billingRules.custom_statuses)) {
    // Если custom_statuses не массив, но есть в объекте - исправляем
    if (billingRules.custom_statuses && typeof billingRules.custom_statuses === 'object') {
      billingRules.custom_statuses = [billingRules.custom_statuses];
    } else {
      billingRules.custom_statuses = undefined;
    }
  }
}

const activity = {
  ...data,
  config: data.config || null,
  billing_rules: billingRules,
} as Activity;
```

## Альтернативное решение

Если проблема в том, что Supabase правильно возвращает данные, но они теряются при обработке, нужно проверить функцию `getBillingRulesForDate` - возможно, она не сохраняет `custom_statuses`.
