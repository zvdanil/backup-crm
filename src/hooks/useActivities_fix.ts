// ВРЕМЕННЫЙ ФАЙЛ ДЛЯ АНАЛИЗА
// Это не настоящий файл, а пример исправления

// Проблема: custom_statuses теряются при обработке billing_rules
// Решение: явно сохранять custom_statuses при обработке

// В функции useActivity, после получения data:
const activity = {
  ...data,
  config: data.config || null,
  billing_rules: (() => {
    // Явная обработка billing_rules с сохранением custom_statuses
    const rules = data.billing_rules as any;
    if (!rules) return null;
    
    // Если это строка, парсим
    if (typeof rules === 'string') {
      try {
        return JSON.parse(rules) as BillingRules;
      } catch {
        return null;
      }
    }
    
    // Если это объект, копируем с явным сохранением custom_statuses
    const result: BillingRules = {
      ...rules,
      // Явно сохраняем custom_statuses, если они есть
      custom_statuses: Array.isArray(rules.custom_statuses) 
        ? rules.custom_statuses 
        : undefined,
    };
    
    return result;
  })(),
} as Activity;

// В функции getBillingRulesForDate - убедиться, что custom_statuses сохраняются:
export function getBillingRulesForDate(
  activity: Activity,
  priceHistory: ActivityPriceHistory[],
  date: string
): BillingRules | null {
  // ... существующая логика ...
  
  // ВАЖНО: при возврате billing_rules убедиться, что custom_statuses включены
  const rules = /* ... существующая логика получения правил ... */;
  
  if (rules) {
    return {
      ...rules,
      // Явно сохраняем custom_statuses из исходной активности
      custom_statuses: activity.billing_rules?.custom_statuses || rules.custom_statuses,
    };
  }
  
  return activity.billing_rules;
}
