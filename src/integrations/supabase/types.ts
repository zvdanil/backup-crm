export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          balance_display_mode: string | null
          account_id: string | null
          category: Database["public"]["Enums"]["activity_category"]
          color: string | null
          created_at: string | null
          default_price: number
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          payment_type: Database["public"]["Enums"]["payment_type"] | null
          show_in_children: boolean | null
          teacher_payment_percent: number | null
          updated_at: string | null
        }
        Insert: {
          balance_display_mode?: string | null
          account_id?: string | null
          category?: Database["public"]["Enums"]["activity_category"]
          color?: string | null
          created_at?: string | null
          default_price?: number
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          payment_type?: Database["public"]["Enums"]["payment_type"] | null
          show_in_children?: boolean | null
          teacher_payment_percent?: number | null
          updated_at?: string | null
        }
        Update: {
          balance_display_mode?: string | null
          account_id?: string | null
          category?: Database["public"]["Enums"]["activity_category"]
          color?: string | null
          created_at?: string | null
          default_price?: number
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          payment_type?: Database["public"]["Enums"]["payment_type"] | null
          show_in_children?: boolean | null
          teacher_payment_percent?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      parent_student_links: {
        Row: {
          created_at: string | null
          id: string
          parent_id: string
          student_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          parent_id: string
          student_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          parent_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_student_links_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_accounts: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      attendance: {
        Row: {
          charged_amount: number
          created_at: string | null
          date: string
          enrollment_id: string
          group_lesson_id: string | null
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          value: number | null
          manual_value_edit: boolean | null
          updated_at: string | null
        }
        Insert: {
          charged_amount?: number
          created_at?: string | null
          date: string
          enrollment_id: string
          group_lesson_id?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          value?: number | null
          manual_value_edit?: boolean | null
          updated_at?: string | null
        }
        Update: {
          charged_amount?: number
          created_at?: string | null
          date?: string
          enrollment_id?: string
          group_lesson_id?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          value?: number | null
          manual_value_edit?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_group_lesson_id_fkey"
            columns: ["group_lesson_id"]
            isOneToOne: false
            referencedRelation: "group_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      group_lessons: {
        Row: {
          activity_id: string
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          activity_id: string
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          activity_id?: string
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_lessons_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      group_lesson_staff: {
        Row: {
          created_at: string | null
          group_lesson_id: string
          id: string
          staff_id: string
        }
        Insert: {
          created_at?: string | null
          group_lesson_id: string
          id?: string
          staff_id: string
        }
        Update: {
          created_at?: string | null
          group_lesson_id?: string
          id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_lesson_staff_group_lesson_id_fkey"
            columns: ["group_lesson_id"]
            isOneToOne: false
            referencedRelation: "group_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_lesson_staff_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          activity_id: string
          created_at: string | null
          custom_price: number | null
          discount_percent: number | null
          effective_from: string | null
          enrolled_at: string | null
          id: string
          is_active: boolean | null
          student_id: string
          unenrolled_at: string | null
          updated_at: string | null
        }
        Insert: {
          activity_id: string
          created_at?: string | null
          custom_price?: number | null
          discount_percent?: number | null
          effective_from?: string | null
          enrolled_at?: string | null
          id?: string
          is_active?: boolean | null
          student_id: string
          unenrolled_at?: string | null
          updated_at?: string | null
        }
        Update: {
          activity_id?: string
          created_at?: string | null
          custom_price?: number | null
          discount_percent?: number | null
          effective_from?: string | null
          enrolled_at?: string | null
          id?: string
          is_active?: boolean | null
          student_id?: string
          unenrolled_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          accrual_mode: string | null
          created_at: string | null
          deductions: Json | null
          full_name: string
          id: string
          is_active: boolean | null
          position: string
          tariff_type: string
          tariff_value: number
          updated_at: string | null
        }
        Insert: {
          accrual_mode?: string | null
          created_at?: string | null
          deductions?: Json | null
          full_name: string
          id?: string
          is_active?: boolean | null
          position: string
          tariff_type?: string
          tariff_value?: number
          updated_at?: string | null
        }
        Update: {
          accrual_mode?: string | null
          created_at?: string | null
          deductions?: Json | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          position?: string
          tariff_type?: string
          tariff_value?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      staff_billing_rules: {
        Row: {
          activity_id: string | null
          created_at: string | null
          effective_from: string
          effective_to: string | null
          extra_lesson_rate: number | null
          group_lesson_id: string | null
          id: string
          lesson_limit: number | null
          penalty_percent: number | null
          penalty_trigger_percent: number | null
          rate_type: string
          rate_value: number
          staff_id: string
          updated_at: string | null
        }
        Insert: {
          activity_id?: string | null
          created_at?: string | null
          effective_from: string
          effective_to?: string | null
          extra_lesson_rate?: number | null
          group_lesson_id?: string | null
          id?: string
          lesson_limit?: number | null
          penalty_percent?: number | null
          penalty_trigger_percent?: number | null
          rate_type?: string
          rate_value?: number
          staff_id: string
          updated_at?: string | null
        }
        Update: {
          activity_id?: string | null
          created_at?: string | null
          effective_from?: string
          effective_to?: string | null
          extra_lesson_rate?: number | null
          group_lesson_id?: string | null
          id?: string
          lesson_limit?: number | null
          penalty_percent?: number | null
          penalty_trigger_percent?: number | null
          rate_type?: string
          rate_value?: number
          staff_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_billing_rules_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_billing_rules_group_lesson_id_fkey"
            columns: ["group_lesson_id"]
            isOneToOne: false
            referencedRelation: "group_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_billing_rules_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_journal_entries: {
        Row: {
          activity_id: string | null
          amount: number
          base_amount: number | null
          created_at: string | null
          date: string
          deductions_applied: Json | null
          group_lesson_id: string | null
          id: string
          is_manual_override: boolean | null
          notes: string | null
          staff_id: string
          updated_at: string | null
        }
        Insert: {
          activity_id?: string | null
          amount: number
          base_amount?: number | null
          created_at?: string | null
          date: string
          deductions_applied?: Json | null
          group_lesson_id?: string | null
          id?: string
          is_manual_override?: boolean | null
          notes?: string | null
          staff_id: string
          updated_at?: string | null
        }
        Update: {
          activity_id?: string | null
          amount?: number
          base_amount?: number | null
          created_at?: string | null
          date?: string
          deductions_applied?: Json | null
          group_lesson_id?: string | null
          id?: string
          is_manual_override?: boolean | null
          notes?: string | null
          staff_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_journal_entries_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_journal_entries_group_lesson_id_fkey"
            columns: ["group_lesson_id"]
            isOneToOne: false
            referencedRelation: "group_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_journal_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      group_lesson_sessions: {
        Row: {
          created_at: string | null
          group_lesson_id: string
          id: string
          notes: string | null
          session_date: string
          sessions_count: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          group_lesson_id: string
          id?: string
          notes?: string | null
          session_date: string
          sessions_count?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          group_lesson_id?: string
          id?: string
          notes?: string | null
          session_date?: string
          sessions_count?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_lesson_sessions_group_lesson_id_fkey"
            columns: ["group_lesson_id"]
            isOneToOne: false
            referencedRelation: "group_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          birth_date: string | null
          created_at: string | null
          custom_fields: Json | null
          full_name: string
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          birth_date?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          full_name: string
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          birth_date?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          full_name?: string
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      activity_category:
        | "income"
        | "expense"
        | "additional_income"
        | "household_expense"
        | "salary"
      attendance_status: "present" | "sick" | "absent" | "vacation"
      payment_type: "subscription" | "per_session"
      user_role: "owner" | "admin" | "manager" | "accountant" | "viewer" | "parent" | "newregistration"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_category: [
        "income",
        "expense",
        "additional_income",
        "household_expense",
        "salary",
      ],
      attendance_status: ["present", "sick", "absent", "vacation"],
      payment_type: ["subscription", "per_session"],
    },
  },
} as const
