import type { UserRole } from "@/context/AuthContext";

export type AppSection =
  | "dashboard"
  | "calendar" // Added calendar section
  | "students"
  | "activities"
  | "accounts"
  | "groups"
  | "attendance"
  | "group_lessons_journal"
  | "garden_attendance"
  | "nutrition"
  | "staff"
  | "staff_expenses"
  | "staff_payroll"
  | "users"
  | "summary_report"
  | "financial_report"
  | "debtors"
  | "dividend_journal";

const roleAccess: Record<UserRole, AppSection[]> = {
  owner: [
    "dashboard",
    "calendar",
    "students",
    "activities",
    "accounts",
    "groups",
    "attendance",
    "group_lessons_journal",
    "garden_attendance",
    "nutrition",
    "staff",
    "staff_expenses",
    "staff_payroll",
    "users",
    "summary_report",
    "financial_report",
    "dividend_journal",
  ],
  admin: [
    "dashboard",
    "calendar",
    "students",
    "activities",
    "accounts",
    "groups",
    "attendance",
    "group_lessons_journal",
    "garden_attendance",
    "nutrition",
    "staff",
    "staff_expenses",
    "staff_payroll",
    "users",
    "summary_report",
    "financial_report",
    "dividend_journal",
  ],
  manager: [
    "calendar",
    "attendance",
    "group_lessons_journal",
    "garden_attendance",
  ],
  accountant: ["students", "debtors"],
  viewer: [
    "dashboard",
    "calendar",
    "students",
    "activities",
    "groups",
    "attendance",
    "group_lessons_journal",
    "garden_attendance",
    "nutrition",
    "staff",
    "staff_expenses",
    "staff_payroll",
    "summary_report",
    "financial_report",
    "dividend_journal",
  ],
  parent: [],
  newregistration: [],
};

export function canAccessSection(
  role: UserRole | null,
  section: AppSection,
): boolean {
  if (!role) return false;
  // Handle potential new sections not defined in every role
  if (!roleAccess[role]) return false;
  return roleAccess[role].includes(section);
}
