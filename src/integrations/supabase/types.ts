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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      employees: {
        Row: {
          created_at: string
          created_by: string | null
          department: string | null
          end_date: string | null
          first_name: string
          id: string
          job_title: string | null
          last_name: string
          manager_id: string | null
          personal_email: string | null
          phone: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["employee_status"]
          updated_at: string
          user_id: string | null
          work_email: string | null
          worker_type_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          end_date?: string | null
          first_name: string
          id?: string
          job_title?: string | null
          last_name: string
          manager_id?: string | null
          personal_email?: string | null
          phone?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          user_id?: string | null
          work_email?: string | null
          worker_type_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          end_date?: string | null
          first_name?: string
          id?: string
          job_title?: string | null
          last_name?: string
          manager_id?: string | null
          personal_email?: string | null
          phone?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          user_id?: string | null
          work_email?: string | null
          worker_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_worker_type_id_fkey"
            columns: ["worker_type_id"]
            isOneToOne: false
            referencedRelation: "worker_types"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_instances: {
        Row: {
          completed_at: string | null
          employee_id: string
          id: string
          started_at: string
          status: string
          template_id: string | null
        }
        Insert: {
          completed_at?: string | null
          employee_id: string
          id?: string
          started_at?: string
          status?: string
          template_id?: string | null
        }
        Update: {
          completed_at?: string | null
          employee_id?: string
          id?: string
          started_at?: string
          status?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_instances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
          worker_type_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
          worker_type_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
          worker_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_templates_worker_type_id_fkey"
            columns: ["worker_type_id"]
            isOneToOne: false
            referencedRelation: "worker_types"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_instances: {
        Row: {
          assignee: Database["public"]["Enums"]["task_assignee"]
          category: Database["public"]["Enums"]["task_category"]
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_required: boolean
          onboarding_instance_id: string
          sort_order: number
          status: Database["public"]["Enums"]["task_status"]
          template_task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee?: Database["public"]["Enums"]["task_assignee"]
          category?: Database["public"]["Enums"]["task_category"]
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_required?: boolean
          onboarding_instance_id: string
          sort_order?: number
          status?: Database["public"]["Enums"]["task_status"]
          template_task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee?: Database["public"]["Enums"]["task_assignee"]
          category?: Database["public"]["Enums"]["task_category"]
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_required?: boolean
          onboarding_instance_id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["task_status"]
          template_task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_instances_onboarding_instance_id_fkey"
            columns: ["onboarding_instance_id"]
            isOneToOne: false
            referencedRelation: "onboarding_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_instances_template_task_id_fkey"
            columns: ["template_task_id"]
            isOneToOne: false
            referencedRelation: "template_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      template_tasks: {
        Row: {
          assignee: Database["public"]["Enums"]["task_assignee"]
          category: Database["public"]["Enums"]["task_category"]
          created_at: string
          days_offset: number
          description: string | null
          id: string
          is_required: boolean
          sort_order: number
          template_id: string
          title: string
        }
        Insert: {
          assignee?: Database["public"]["Enums"]["task_assignee"]
          category?: Database["public"]["Enums"]["task_category"]
          created_at?: string
          days_offset?: number
          description?: string | null
          id?: string
          is_required?: boolean
          sort_order?: number
          template_id: string
          title: string
        }
        Update: {
          assignee?: Database["public"]["Enums"]["task_assignee"]
          category?: Database["public"]["Enums"]["task_category"]
          created_at?: string
          days_offset?: number
          description?: string | null
          id?: string
          is_required?: boolean
          sort_order?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      worker_types: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          key: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          key: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "hr_admin"
        | "hiring_manager"
        | "it_admin"
        | "employee"
        | "candidate"
      employee_status: "candidate" | "preboarding" | "active" | "offboarded"
      task_assignee:
        | "employee"
        | "manager"
        | "hr"
        | "it"
        | "facilities"
        | "payroll"
        | "automated"
      task_category:
        | "forms"
        | "compliance"
        | "equipment"
        | "training"
        | "provisioning"
        | "policy"
        | "introduction"
        | "other"
      task_status:
        | "pending"
        | "in_progress"
        | "complete"
        | "skipped"
        | "blocked"
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
      app_role: [
        "hr_admin",
        "hiring_manager",
        "it_admin",
        "employee",
        "candidate",
      ],
      employee_status: ["candidate", "preboarding", "active", "offboarded"],
      task_assignee: [
        "employee",
        "manager",
        "hr",
        "it",
        "facilities",
        "payroll",
        "automated",
      ],
      task_category: [
        "forms",
        "compliance",
        "equipment",
        "training",
        "provisioning",
        "policy",
        "introduction",
        "other",
      ],
      task_status: ["pending", "in_progress", "complete", "skipped", "blocked"],
    },
  },
} as const
