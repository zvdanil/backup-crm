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
      attendance: {
        Row: {
          charged_amount: number
          created_at: string | null
          date: string
          enrollment_id: string
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
            foreignKeyName: "staff_journal_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
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
