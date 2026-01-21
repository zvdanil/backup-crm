import type { UserRole } from '@/context/AuthContext';

export type AppSection =
  | 'dashboard'
  | 'students'
  | 'activities'
  | 'accounts'
  | 'groups'
  | 'attendance'
  | 'group_lessons_journal'
  | 'garden_attendance'
  | 'nutrition'
  | 'staff'
  | 'staff_expenses'
  | 'staff_payroll'
  | 'users';

const roleAccess: Record<UserRole, AppSection[]> = {
  owner: [
    'dashboard',
    'students',
    'activities',
    'accounts',
    'groups',
    'attendance',
    'group_lessons_journal',
    'garden_attendance',
    'nutrition',
    'staff',
    'staff_expenses',
    'staff_payroll',
    'users',
  ],
  admin: [
    'dashboard',
    'students',
    'activities',
    'accounts',
    'groups',
    'attendance',
    'group_lessons_journal',
    'garden_attendance',
    'nutrition',
    'staff',
    'staff_expenses',
    'staff_payroll',
    'users',
  ],
  manager: [
    'students',
    'activities',
    'groups',
    'attendance',
    'group_lessons_journal',
    'garden_attendance',
    'nutrition',
    'staff_expenses',
  ],
  accountant: [
    'students',
    'activities',
    'accounts',
    'groups',
    'attendance',
    'group_lessons_journal',
    'garden_attendance',
    'nutrition',
    'staff',
    'staff_expenses',
    'staff_payroll',
  ],
  viewer: [
    'dashboard',
    'students',
    'activities',
    'groups',
    'attendance',
    'group_lessons_journal',
    'garden_attendance',
    'nutrition',
    'staff',
    'staff_expenses',
    'staff_payroll',
  ],
  parent: [],
};

export function canAccessSection(role: UserRole | null, section: AppSection): boolean {
  if (!role) return false;
  return roleAccess[role].includes(section);
}
