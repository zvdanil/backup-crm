/**
 * Групи активностей для категорій.
 * Легко розширити: додати категорію та список груп.
 */
import type { ActivityCategory, ActivityGroup } from '@/hooks/useActivities';

export const ACTIVITY_GROUP_LABELS: Record<ActivityGroup, string> = {
  kindergarten: 'Дитячій садок',
  additional_classes: 'Додаткові заняття',
  one_time_payments: 'Разові платежі',
};

/** Категорії, для яких є групи */
export const CATEGORIES_WITH_GROUPS: ActivityCategory[] = ['income', 'additional_income'];

/** Групи для категорії (для подальшого розширення) */
export const ACTIVITY_GROUPS_BY_CATEGORY: Record<ActivityCategory, ActivityGroup[] | null> = {
  income: ['kindergarten', 'additional_classes', 'one_time_payments'],
  additional_income: ['kindergarten', 'additional_classes', 'one_time_payments'],
  expense: null,
  household_expense: null,
  salary: null,
};

export const DEFAULT_ACTIVITY_GROUP: ActivityGroup = 'additional_classes';

export function getGroupsForCategory(category: ActivityCategory): ActivityGroup[] | null {
  return ACTIVITY_GROUPS_BY_CATEGORY[category] ?? null;
}
