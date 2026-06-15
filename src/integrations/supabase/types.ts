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
      documents: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          is_sensitive: boolean
          kind: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          task_instance_id: string | null
          title: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          is_sensitive?: boolean
          kind?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          task_instance_id?: string | null
          title: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          is_sensitive?: boolean
          kind?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          task_instance_id?: string | null
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_task_instance_id_fkey"
            columns: ["task_instance_id"]
            isOneToOne: false
            referencedRelation: "task_instances"
            referencedColumns: ["id"]
          },
        ]
      }
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
      form_definitions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          jurisdiction: string | null
          key: string
          requires_signature: boolean
          schema: Json
          title: string
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          jurisdiction?: string | null
          key: string
          requires_signature?: boolean
          schema?: Json
          title: string
          updated_at?: string
          version?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          jurisdiction?: string | null
          key?: string
          requires_signature?: boolean
          schema?: Json
          title?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      form_submissions: {
        Row: {
          created_at: string
          data: Json
          employee_id: string
          form_definition_id: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          task_instance_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          employee_id: string
          form_definition_id: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          task_instance_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          employee_id?: string
          form_definition_id?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          task_instance_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_form_definition_id_fkey"
            columns: ["form_definition_id"]
            isOneToOne: false
            referencedRelation: "form_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_task_instance_id_fkey"
            columns: ["task_instance_id"]
            isOneToOne: false
            referencedRelation: "task_instances"
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
      provisioning_requests: {
        Row: {
          assignee_user_id: string | null
          completed_at: string | null
          created_at: string
          details: Json
          employee_id: string
          id: string
          kind: string
          notes: string | null
          status: string
          task_instance_id: string | null
          updated_at: string
        }
        Insert: {
          assignee_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          details?: Json
          employee_id: string
          id?: string
          kind: string
          notes?: string | null
          status?: string
          task_instance_id?: string | null
          updated_at?: string
        }
        Update: {
          assignee_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          details?: Json
          employee_id?: string
          id?: string
          kind?: string
          notes?: string | null
          status?: string
          task_instance_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provisioning_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provisioning_requests_task_instance_id_fkey"
            columns: ["task_instance_id"]
            isOneToOne: false
            referencedRelation: "task_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      signatures: {
        Row: {
          form_submission_id: string
          id: string
          ip_address: string | null
          signature_data: string
          signature_type: string
          signed_at: string
          signer_name: string
          signer_role: string | null
          signer_user_id: string | null
          user_agent: string | null
        }
        Insert: {
          form_submission_id: string
          id?: string
          ip_address?: string | null
          signature_data: string
          signature_type?: string
          signed_at?: string
          signer_name: string
          signer_role?: string | null
          signer_user_id?: string | null
          user_agent?: string | null
        }
        Update: {
          form_submission_id?: string
          id?: string
          ip_address?: string | null
          signature_data?: string
          signature_type?: string
          signed_at?: string
          signer_name?: string
          signer_role?: string | null
          signer_user_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signatures_form_submission_id_fkey"
            columns: ["form_submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
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
          form_definition_key: string | null
          form_submission_id: string | null
          id: string
          is_required: boolean
          onboarding_instance_id: string
          provisioning_request_id: string | null
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
          form_definition_key?: string | null
          form_submission_id?: string | null
          id?: string
          is_required?: boolean
          onboarding_instance_id: string
          provisioning_request_id?: string | null
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
          form_definition_key?: string | null
          form_submission_id?: string | null
          id?: string
          is_required?: boolean
          onboarding_instance_id?: string
          provisioning_request_id?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["task_status"]
          template_task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_instances_form_submission_id_fkey"
            columns: ["form_submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_instances_onboarding_instance_id_fkey"
            columns: ["onboarding_instance_id"]
            isOneToOne: false
            referencedRelation: "onboarding_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_instances_provisioning_request_id_fkey"
            columns: ["provisioning_request_id"]
            isOneToOne: false
            referencedRelation: "provisioning_requests"
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
