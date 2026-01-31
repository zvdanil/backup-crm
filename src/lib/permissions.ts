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
  | 'users'
  | 'summary_report';

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
    'summary_report',
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
    'summary_report',
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
    'summary_report',
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
    'summary_report',
  ],
  parent: [],
  newregistration: [],
};

export function canAccessSection(role: UserRole | null, section: AppSection): boolean {
  if (!role) return false;
  return roleAccess[role].includes(section);
}
