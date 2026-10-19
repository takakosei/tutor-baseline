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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      blocked_times: {
        Row: {
          created_at: string
          date: string | null
          id: string
          owner_id: string
          start_time: string
          valid_from: string | null
          valid_to: string | null
          weekday: number | null
        }
        Insert: {
          created_at?: string
          date?: string | null
          id?: string
          owner_id: string
          start_time: string
          valid_from?: string | null
          valid_to?: string | null
          weekday?: number | null
        }
        Update: {
          created_at?: string
          date?: string | null
          id?: string
          owner_id?: string
          start_time?: string
          valid_from?: string | null
          valid_to?: string | null
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_times_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoints: {
        Row: {
          created_at: string
          criterion: string | null
          date_tbd: boolean
          done_at: string | null
          due_date: string | null
          id: string
          parent_visible: boolean
          seq: number
          student_id: string
          title: string
        }
        Insert: {
          created_at?: string
          criterion?: string | null
          date_tbd?: boolean
          done_at?: string | null
          due_date?: string | null
          id?: string
          parent_visible?: boolean
          seq: number
          student_id: string
          title: string
        }
        Update: {
          created_at?: string
          criterion?: string | null
          date_tbd?: boolean
          done_at?: string | null
          due_date?: string | null
          id?: string
          parent_visible?: boolean
          seq?: number
          student_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoints_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      homework: {
        Row: {
          assigned_on: string
          content: string
          created_at: string
          due_on: string | null
          id: string
          lesson_id: string | null
          parent_visible: boolean
          result: string | null
          student_id: string
        }
        Insert: {
          assigned_on: string
          content: string
          created_at?: string
          due_on?: string | null
          id?: string
          lesson_id?: string | null
          parent_visible?: boolean
          result?: string | null
          student_id: string
        }
        Update: {
          assigned_on?: string
          content?: string
          created_at?: string
          due_on?: string | null
          id?: string
          lesson_id?: string | null
          parent_visible?: boolean
          result?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_requests: {
        Row: {
          created_at: string
          date: string
          decided_at: string | null
          end_time: string
          id: string
          kind: string
          message: string | null
          seen_at: string | null
          start_time: string
          status: string
          student_id: string
        }
        Insert: {
          created_at?: string
          date: string
          decided_at?: string | null
          end_time: string
          id?: string
          kind: string
          message?: string | null
          seen_at?: string | null
          start_time: string
          status?: string
          student_id: string
        }
        Update: {
          created_at?: string
          date?: string
          decided_at?: string | null
          end_time?: string
          id?: string
          kind?: string
          message?: string | null
          seen_at?: string | null
          start_time?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          billable: boolean
          cancel_reason: string | null
          created_at: string
          date: string
          duration_min: number | null
          end_time: string | null
          id: string
          mood: number | null
          moved_from: string | null
          moved_from_end: string | null
          moved_from_start: string | null
          note: string | null
          online: boolean
          parent_summary: string | null
          proctor: boolean
          proctor_fee: number | null
          rate_per_hour: number | null
          rescheduled_to: string | null
          schedule_id: string | null
          start_time: string | null
          status: string
          student_id: string
          trial: boolean
        }
        Insert: {
          billable?: boolean
          cancel_reason?: string | null
          created_at?: string
          date: string
          duration_min?: number | null
          end_time?: string | null
          id?: string
          mood?: number | null
          moved_from?: string | null
          moved_from_end?: string | null
          moved_from_start?: string | null
          note?: string | null
          online?: boolean
          parent_summary?: string | null
          proctor?: boolean
          proctor_fee?: number | null
          rate_per_hour?: number | null
          rescheduled_to?: string | null
          schedule_id?: string | null
          start_time?: string | null
          status?: string
          student_id: string
          trial?: boolean
        }
        Update: {
          billable?: boolean
          cancel_reason?: string | null
          created_at?: string
          date?: string
          duration_min?: number | null
          end_time?: string | null
          id?: string
          mood?: number | null
          moved_from?: string | null
          moved_from_end?: string | null
          moved_from_start?: string | null
          note?: string | null
          online?: boolean
          parent_summary?: string | null
          proctor?: boolean
          proctor_fee?: number | null
          rate_per_hour?: number | null
          rescheduled_to?: string | null
          schedule_id?: string | null
          start_time?: string | null
          status?: string
          student_id?: string
          trial?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "lessons_rescheduled_to_fkey"
            columns: ["rescheduled_to"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_records: {
        Row: {
          created_at: string
          date: string
          id: string
          metric_id: string
          note: string | null
          student_id: string
          value: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          metric_id: string
          note?: string | null
          student_id: string
          value: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          metric_id?: string
          note?: string | null
          student_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "metric_records_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      metrics: {
        Row: {
          created_at: string
          direction: number
          id: string
          max_value: number | null
          name: string
          owner_id: string
          parent_id: string | null
          parent_visible: boolean
          student_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          direction?: number
          id?: string
          max_value?: number | null
          name: string
          owner_id: string
          parent_id?: string | null
          parent_visible?: boolean
          student_id: string
          unit?: string
        }
        Update: {
          created_at?: string
          direction?: number
          id?: string
          max_value?: number | null
          name?: string
          owner_id?: string
          parent_id?: string | null
          parent_visible?: boolean
          student_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "metrics_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metrics_parent_fk"
            columns: ["parent_id", "student_id"]
            isOneToOne: false
            referencedRelation: "metrics"
            referencedColumns: ["id", "student_id"]
          },
          {
            foreignKeyName: "metrics_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          booking_open: boolean
          created_at: string
          id: string
          locale: string | null
          name: string
        }
        Insert: {
          booking_open?: boolean
          created_at?: string
          id: string
          locale?: string | null
          name: string
        }
        Update: {
          booking_open?: boolean
          created_at?: string
          id?: string
          locale?: string | null
          name?: string
        }
        Relationships: []
      }
      report_items: {
        Row: {
          created_at: string
          id: string
          label: string
          max_value: number | null
          student_id: string
          value: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          max_value?: number | null
          student_id: string
          value?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          max_value?: number | null
          student_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string
          end_time: string
          ends_on: string | null
          id: string
          proctor: boolean
          start_time: string
          starts_on: string
          student_id: string
          weekday: number
        }
        Insert: {
          created_at?: string
          end_time: string
          ends_on?: string | null
          id?: string
          proctor?: boolean
          start_time: string
          starts_on?: string
          student_id: string
          weekday: number
        }
        Update: {
          created_at?: string
          end_time?: string
          ends_on?: string | null
          id?: string
          proctor?: boolean
          start_time?: string
          starts_on?: string
          student_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedules_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      slots: {
        Row: {
          band: number
          kind: number
          owner_id: string
          weekday: number
        }
        Insert: {
          band: number
          kind?: number
          owner_id: string
          weekday: number
        }
        Update: {
          band?: number
          kind?: number
          owner_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "slots_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_items: {
        Row: {
          amount: number
          created_at: string
          date: string | null
          id: string
          label: string
          month: string
          student_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          date?: string | null
          id?: string
          label: string
          month: string
          student_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string | null
          id?: string
          label?: string
          month?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_months: {
        Row: {
          month: string
          published_at: string
          student_id: string
        }
        Insert: {
          month: string
          published_at?: string
          student_id: string
        }
        Update: {
          month?: string
          published_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_months_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          assistant_notes: string | null
          created_at: string
          display_name: string | null
          end_date: string | null
          end_label: string | null
          goal: string | null
          grade: string | null
          hours_per_week: number | null
          id: string
          name: string
          online_rate_per_hour: number | null
          owner_id: string
          parent_enabled: boolean
          parent_locale: string | null
          parent_token: string | null
          place: string | null
          proctor_fee: number | null
          rate_per_hour: number | null
          report5: string | null
          report6: string | null
          risk_level: string | null
          risk_note: string | null
          sort_order: number | null
          start_date: string | null
          status: string
          target_metric_id: string | null
          toritsu_conversion: boolean
          updated_at: string
        }
        Insert: {
          assistant_notes?: string | null
          created_at?: string
          display_name?: string | null
          end_date?: string | null
          end_label?: string | null
          goal?: string | null
          grade?: string | null
          hours_per_week?: number | null
          id?: string
          name: string
          online_rate_per_hour?: number | null
          owner_id: string
          parent_enabled?: boolean
          parent_locale?: string | null
          parent_token?: string | null
          place?: string | null
          proctor_fee?: number | null
          rate_per_hour?: number | null
          report5?: string | null
          report6?: string | null
          risk_level?: string | null
          risk_note?: string | null
          sort_order?: number | null
          start_date?: string | null
          status?: string
          target_metric_id?: string | null
          toritsu_conversion?: boolean
          updated_at?: string
        }
        Update: {
          assistant_notes?: string | null
          created_at?: string
          display_name?: string | null
          end_date?: string | null
          end_label?: string | null
          goal?: string | null
          grade?: string | null
          hours_per_week?: number | null
          id?: string
          name?: string
          online_rate_per_hour?: number | null
          owner_id?: string
          parent_enabled?: boolean
          parent_locale?: string | null
          parent_token?: string | null
          place?: string | null
          proctor_fee?: number | null
          rate_per_hour?: number | null
          report5?: string | null
          report6?: string | null
          risk_level?: string | null
          risk_note?: string | null
          sort_order?: number | null
          start_date?: string | null
          status?: string
          target_metric_id?: string | null
          toritsu_conversion?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_target_metric_fk"
            columns: ["target_metric_id", "id"]
            isOneToOne: false
            referencedRelation: "metrics"
            referencedColumns: ["id", "student_id"]
          },
        ]
      }
      target_stages: {
        Row: {
          best_pct: number | null
          created_at: string
          date: string
          id: string
          label: string | null
          pass_pct: number | null
          student_id: string
          target_best: number | null
          target_pass: number | null
        }
        Insert: {
          best_pct?: number | null
          created_at?: string
          date: string
          id?: string
          label?: string | null
          pass_pct?: number | null
          student_id: string
          target_best?: number | null
          target_pass?: number | null
        }
        Update: {
          best_pct?: number | null
          created_at?: string
          date?: string
          id?: string
          label?: string | null
          pass_pct?: number | null
          student_id?: string
          target_best?: number | null
          target_pass?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "target_stages_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
