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
      approval_chains: {
        Row: {
          created_at: string
          created_by: string | null
          current_stage: number
          entity_id: string
          entity_type: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_stage?: number
          entity_id: string
          entity_type: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_stage?: number
          entity_id?: string
          entity_type?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      approval_steps: {
        Row: {
          approver_id: string | null
          approver_label: string
          approver_role: string | null
          chain_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          id: string
          stage: number
          status: string
          updated_at: string
        }
        Insert: {
          approver_id?: string | null
          approver_label: string
          approver_role?: string | null
          chain_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          id?: string
          stage: number
          status?: string
          updated_at?: string
        }
        Update: {
          approver_id?: string | null
          approver_label?: string
          approver_role?: string | null
          chain_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          id?: string
          stage?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_steps_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "approval_chains"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff: Json | null
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      benefits_handoffs: {
        Row: {
          carrier: string
          created_at: string
          employee_id: string
          enrollment_window_end: string | null
          enrollment_window_start: string | null
          external_ref: string | null
          id: string
          notes: string | null
          plan_type: string
          status: string
          updated_at: string
        }
        Insert: {
          carrier: string
          created_at?: string
          employee_id: string
          enrollment_window_end?: string | null
          enrollment_window_start?: string | null
          external_ref?: string | null
          id?: string
          notes?: string | null
          plan_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          carrier?: string
          created_at?: string
          employee_id?: string
          enrollment_window_end?: string | null
          enrollment_window_start?: string | null
          external_ref?: string | null
          id?: string
          notes?: string | null
          plan_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefits_handoffs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      cascade_responses: {
        Row: {
          cascade_id: string
          created_at: string
          department: string | null
          id: string
          manager_name: string | null
          responder_id: string | null
          team_feedback: string
        }
        Insert: {
          cascade_id: string
          created_at?: string
          department?: string | null
          id?: string
          manager_name?: string | null
          responder_id?: string | null
          team_feedback: string
        }
        Update: {
          cascade_id?: string
          created_at?: string
          department?: string | null
          id?: string
          manager_name?: string | null
          responder_id?: string | null
          team_feedback?: string
        }
        Relationships: [
          {
            foreignKeyName: "cascade_responses_cascade_id_fkey"
            columns: ["cascade_id"]
            isOneToOne: false
            referencedRelation: "cascades"
            referencedColumns: ["id"]
          },
        ]
      }
      cascades: {
        Row: {
          ai_generated_at: string | null
          ai_summary: string | null
          attachment_url: string | null
          broadcast_message: string
          created_at: string
          created_by: string | null
          deadline: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          ai_generated_at?: string | null
          ai_summary?: string | null
          attachment_url?: string | null
          broadcast_message: string
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          ai_generated_at?: string | null
          ai_summary?: string | null
          attachment_url?: string | null
          broadcast_message?: string
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      certifications: {
        Row: {
          active: boolean
          compliance_framework: string | null
          created_at: string
          id: string
          issuer: string | null
          name: string
          updated_at: string
          validity_months: number | null
        }
        Insert: {
          active?: boolean
          compliance_framework?: string | null
          created_at?: string
          id?: string
          issuer?: string | null
          name: string
          updated_at?: string
          validity_months?: number | null
        }
        Update: {
          active?: boolean
          compliance_framework?: string | null
          created_at?: string
          id?: string
          issuer?: string | null
          name?: string
          updated_at?: string
          validity_months?: number | null
        }
        Relationships: []
      }
      courses: {
        Row: {
          active: boolean
          compliance_framework: string | null
          created_at: string
          duration_minutes: number | null
          id: string
          name: string
          provider: string | null
          required_for_worker_types: string[] | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          compliance_framework?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          name: string
          provider?: string | null
          required_for_worker_types?: string[] | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          compliance_framework?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          name?: string
          provider?: string | null
          required_for_worker_types?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      dependents: {
        Row: {
          created_at: string
          dob: string | null
          employee_id: string
          first_name: string
          id: string
          last_name: string
          relationship: string
          ssn_last4: string | null
        }
        Insert: {
          created_at?: string
          dob?: string | null
          employee_id: string
          first_name: string
          id?: string
          last_name: string
          relationship: string
          ssn_last4?: string | null
        }
        Update: {
          created_at?: string
          dob?: string | null
          employee_id?: string
          first_name?: string
          id?: string
          last_name?: string
          relationship?: string
          ssn_last4?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dependents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
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
      employee_certifications: {
        Row: {
          certification_id: string
          created_at: string
          document_id: string | null
          employee_id: string
          expires_at: string | null
          id: string
          issued_at: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          certification_id: string
          created_at?: string
          document_id?: string | null
          employee_id: string
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          certification_id?: string
          created_at?: string
          document_id?: string | null
          employee_id?: string
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_certifications_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "certifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_certifications_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_certifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_training: {
        Row: {
          completed_at: string | null
          course_id: string
          created_at: string
          due_date: string | null
          employee_id: string
          id: string
          score: number | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          created_at?: string
          due_date?: string | null
          employee_id: string
          id?: string
          score?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          created_at?: string
          due_date?: string | null
          employee_id?: string
          id?: string
          score?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_training_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_training_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
          external_id: string | null
          first_name: string
          id: string
          job_title: string | null
          last_name: string
          manager_id: string | null
          personal_email: string | null
          phone: string | null
          position_id: string | null
          rehire_eligible: boolean
          separation_date: string | null
          separation_reason: string | null
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
          external_id?: string | null
          first_name: string
          id?: string
          job_title?: string | null
          last_name: string
          manager_id?: string | null
          personal_email?: string | null
          phone?: string | null
          position_id?: string | null
          rehire_eligible?: boolean
          separation_date?: string | null
          separation_reason?: string | null
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
          external_id?: string | null
          first_name?: string
          id?: string
          job_title?: string | null
          last_name?: string
          manager_id?: string | null
          personal_email?: string | null
          phone?: string | null
          position_id?: string | null
          rehire_eligible?: boolean
          separation_date?: string | null
          separation_reason?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          user_id?: string | null
          work_email?: string | null
          worker_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_worker_type_id_fkey"
            columns: ["worker_type_id"]
            isOneToOne: false
            referencedRelation: "worker_types"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_catalog: {
        Row: {
          active: boolean
          category: string
          cost_center: string | null
          created_at: string
          id: string
          name: string
          sizes: Json | null
          sku: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          cost_center?: string | null
          created_at?: string
          id?: string
          name: string
          sizes?: Json | null
          sku: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          cost_center?: string | null
          created_at?: string
          id?: string
          name?: string
          sizes?: Json | null
          sku?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      equipment_issuance: {
        Row: {
          condition: string | null
          cost: number | null
          created_at: string
          employee_id: string
          id: string
          issued_at: string | null
          item_id: string
          notes: string | null
          returned_at: string | null
          size: string | null
          status: string
          updated_at: string
        }
        Insert: {
          condition?: string | null
          cost?: number | null
          created_at?: string
          employee_id: string
          id?: string
          issued_at?: string | null
          item_id: string
          notes?: string | null
          returned_at?: string | null
          size?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          condition?: string | null
          cost?: number | null
          created_at?: string
          employee_id?: string
          id?: string
          issued_at?: string | null
          item_id?: string
          notes?: string | null
          returned_at?: string | null
          size?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_issuance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_issuance_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "equipment_catalog"
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
      goal_updates: {
        Row: {
          author_id: string | null
          created_at: string
          goal_id: string
          id: string
          note: string | null
          progress: number | null
          status: string | null
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          goal_id: string
          id?: string
          note?: string | null
          progress?: number | null
          status?: string | null
        }
        Update: {
          author_id?: string | null
          created_at?: string
          goal_id?: string
          id?: string
          note?: string | null
          progress?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_updates_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          owner_employee_id: string
          parent_goal_id: string | null
          progress: number
          status: string
          target_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          owner_employee_id: string
          parent_goal_id?: string | null
          progress?: number
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          owner_employee_id?: string
          parent_goal_id?: string | null
          progress?: number
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_owner_employee_id_fkey"
            columns: ["owner_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_parent_goal_id_fkey"
            columns: ["parent_goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      grievance_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_status: string | null
          grievance_id: string
          id: string
          payload: Json
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          grievance_id: string
          id?: string
          payload?: Json
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          grievance_id?: string
          id?: string
          payload?: Json
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grievance_events_grievance_id_fkey"
            columns: ["grievance_id"]
            isOneToOne: false
            referencedRelation: "grievances"
            referencedColumns: ["id"]
          },
        ]
      }
      grievance_notes: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          grievance_id: string
          id: string
          visibility: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          grievance_id: string
          id?: string
          visibility?: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          grievance_id?: string
          id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "grievance_notes_grievance_id_fkey"
            columns: ["grievance_id"]
            isOneToOne: false
            referencedRelation: "grievances"
            referencedColumns: ["id"]
          },
        ]
      }
      grievance_tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          grievance_id: string
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          grievance_id: string
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          grievance_id?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grievance_tasks_grievance_id_fkey"
            columns: ["grievance_id"]
            isOneToOne: false
            referencedRelation: "grievances"
            referencedColumns: ["id"]
          },
        ]
      }
      grievances: {
        Row: {
          acknowledged_at: string | null
          appeal_deadline: string | null
          assigned_hr_id: string | null
          case_number: string | null
          category: string
          created_at: string
          details: string | null
          due_date: string | null
          id: string
          is_anonymous: boolean
          outcome: string | null
          resolution_summary: string | null
          resolved_at: string | null
          severity: string
          status: string
          subject_employee_id: string | null
          submitted_by: string | null
          summary: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          appeal_deadline?: string | null
          assigned_hr_id?: string | null
          case_number?: string | null
          category: string
          created_at?: string
          details?: string | null
          due_date?: string | null
          id?: string
          is_anonymous?: boolean
          outcome?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          subject_employee_id?: string | null
          submitted_by?: string | null
          summary: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          appeal_deadline?: string | null
          assigned_hr_id?: string | null
          case_number?: string | null
          category?: string
          created_at?: string
          details?: string | null
          due_date?: string | null
          id?: string
          is_anonymous?: boolean
          outcome?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          subject_employee_id?: string | null
          submitted_by?: string | null
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grievances_subject_employee_id_fkey"
            columns: ["subject_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hire_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          employee_id: string | null
          hr_notes: string | null
          id: string
          notes: string | null
          proposed_department: string | null
          proposed_email: string | null
          proposed_first_name: string
          proposed_job_title: string | null
          proposed_last_name: string
          proposed_start_date: string | null
          reason: string | null
          requested_by: string
          status: string
          updated_at: string
          worker_type_id: string | null
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          employee_id?: string | null
          hr_notes?: string | null
          id?: string
          notes?: string | null
          proposed_department?: string | null
          proposed_email?: string | null
          proposed_first_name: string
          proposed_job_title?: string | null
          proposed_last_name: string
          proposed_start_date?: string | null
          reason?: string | null
          requested_by: string
          status?: string
          updated_at?: string
          worker_type_id?: string | null
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          employee_id?: string | null
          hr_notes?: string | null
          id?: string
          notes?: string | null
          proposed_department?: string | null
          proposed_email?: string | null
          proposed_first_name?: string
          proposed_job_title?: string | null
          proposed_last_name?: string
          proposed_start_date?: string | null
          reason?: string | null
          requested_by?: string
          status?: string
          updated_at?: string
          worker_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hire_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hire_requests_worker_type_id_fkey"
            columns: ["worker_type_id"]
            isOneToOne: false
            referencedRelation: "worker_types"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_feedback: {
        Row: {
          id: string
          interview_id: string
          interviewer_id: string
          notes: string | null
          rating: number | null
          recommendation: string | null
          submitted_at: string
        }
        Insert: {
          id?: string
          interview_id: string
          interviewer_id: string
          notes?: string | null
          rating?: number | null
          recommendation?: string | null
          submitted_at?: string
        }
        Update: {
          id?: string
          interview_id?: string
          interviewer_id?: string
          notes?: string | null
          rating?: number | null
          recommendation?: string | null
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_feedback_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          application_id: string
          calendar_event_id: string | null
          created_at: string
          created_by: string | null
          duration_minutes: number
          id: string
          interviewer_ids: string[]
          location: string | null
          notes: string | null
          scheduled_at: string
          stage: string
          status: string
          updated_at: string
        }
        Insert: {
          application_id: string
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          id?: string
          interviewer_ids?: string[]
          location?: string | null
          notes?: string | null
          scheduled_at: string
          stage?: string
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          id?: string
          interviewer_ids?: string[]
          location?: string | null
          notes?: string | null
          scheduled_at?: string
          stage?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      job_application_events: {
        Row: {
          actor_id: string | null
          application_id: string
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          payload: Json
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          application_id: string
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          payload?: Json
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          application_id?: string
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          payload?: Json
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applications: {
        Row: {
          answers: Json
          applicant_name: string
          cover_letter: string | null
          created_at: string
          email: string
          id: string
          internal_employee_id: string | null
          is_internal: boolean
          notes: string | null
          notify_current_manager: boolean
          phone: string | null
          rating: number | null
          rejection_reason: string | null
          requisition_id: string
          resume_url: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          answers?: Json
          applicant_name: string
          cover_letter?: string | null
          created_at?: string
          email: string
          id?: string
          internal_employee_id?: string | null
          is_internal?: boolean
          notes?: string | null
          notify_current_manager?: boolean
          phone?: string | null
          rating?: number | null
          rejection_reason?: string | null
          requisition_id: string
          resume_url?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          applicant_name?: string
          cover_letter?: string | null
          created_at?: string
          email?: string
          id?: string
          internal_employee_id?: string | null
          is_internal?: boolean
          notes?: string | null
          notify_current_manager?: boolean
          phone?: string | null
          rating?: number | null
          rejection_reason?: string | null
          requisition_id?: string
          resume_url?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_internal_employee_id_fkey"
            columns: ["internal_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "job_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      job_requisitions: {
        Row: {
          benefits: string | null
          closes_at: string | null
          created_at: string
          department: string | null
          description: string | null
          employment_type: string | null
          hire_request_id: string | null
          hiring_manager_id: string | null
          id: string
          internal_only: boolean
          location: string | null
          position_id: string | null
          posted_at: string | null
          requested_by: string | null
          requirements: string | null
          salary_max: number | null
          salary_min: number | null
          slug: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
          worker_type_id: string | null
        }
        Insert: {
          benefits?: string | null
          closes_at?: string | null
          created_at?: string
          department?: string | null
          description?: string | null
          employment_type?: string | null
          hire_request_id?: string | null
          hiring_manager_id?: string | null
          id?: string
          internal_only?: boolean
          location?: string | null
          position_id?: string | null
          posted_at?: string | null
          requested_by?: string | null
          requirements?: string | null
          salary_max?: number | null
          salary_min?: number | null
          slug?: string | null
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
          worker_type_id?: string | null
        }
        Update: {
          benefits?: string | null
          closes_at?: string | null
          created_at?: string
          department?: string | null
          description?: string | null
          employment_type?: string | null
          hire_request_id?: string | null
          hiring_manager_id?: string | null
          id?: string
          internal_only?: boolean
          location?: string | null
          position_id?: string | null
          posted_at?: string | null
          requested_by?: string | null
          requirements?: string | null
          salary_max?: number | null
          salary_min?: number | null
          slug?: string | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          worker_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_requisitions_hire_request_id_fkey"
            columns: ["hire_request_id"]
            isOneToOne: false
            referencedRelation: "hire_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_requisitions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_requisitions_worker_type_id_fkey"
            columns: ["worker_type_id"]
            isOneToOne: false
            referencedRelation: "worker_types"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
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
          template_type: string
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
          template_type?: string
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
          template_type?: string
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
      one_on_one_action_items: {
        Row: {
          assignee_label: string | null
          assignee_user_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          session_id: string
          status: string
          text: string
          updated_at: string
        }
        Insert: {
          assignee_label?: string | null
          assignee_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          session_id: string
          status?: string
          text: string
          updated_at?: string
        }
        Update: {
          assignee_label?: string | null
          assignee_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          session_id?: string
          status?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "one_on_one_action_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "one_on_ones"
            referencedColumns: ["id"]
          },
        ]
      }
      one_on_one_agenda_notes: {
        Row: {
          agenda_index: number
          agenda_prompt: string | null
          author_id: string | null
          content: string
          created_at: string
          id: string
          session_id: string
          updated_at: string
        }
        Insert: {
          agenda_index: number
          agenda_prompt?: string | null
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          session_id: string
          updated_at?: string
        }
        Update: {
          agenda_index?: number
          agenda_prompt?: string | null
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "one_on_one_agenda_notes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "one_on_ones"
            referencedColumns: ["id"]
          },
        ]
      }
      one_on_one_notes: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          session_id: string
          updated_at: string
          visibility: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          session_id: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          session_id?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "one_on_one_notes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "one_on_ones"
            referencedColumns: ["id"]
          },
        ]
      }
      one_on_one_templates: {
        Row: {
          agenda_prompts: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          title: string
          updated_at: string
        }
        Insert: {
          agenda_prompts?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          agenda_prompts?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      one_on_ones: {
        Row: {
          ai_action_items: Json | null
          ai_generated_at: string | null
          ai_summary: string | null
          created_at: string
          created_by: string | null
          employee_id: string | null
          id: string
          manager_user_id: string
          scheduled_at: string | null
          short_code: string
          status: string
          summary: string | null
          template_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          ai_action_items?: Json | null
          ai_generated_at?: string | null
          ai_summary?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          id?: string
          manager_user_id: string
          scheduled_at?: string | null
          short_code: string
          status?: string
          summary?: string | null
          template_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          ai_action_items?: Json | null
          ai_generated_at?: string | null
          ai_summary?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          id?: string
          manager_user_id?: string
          scheduled_at?: string | null
          short_code?: string
          status?: string
          summary?: string | null
          template_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "one_on_ones_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "one_on_ones_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "one_on_one_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      org_settings: {
        Row: {
          accent_color: string | null
          address: string | null
          ein: string | null
          id: string
          logo_url: string | null
          notification_defaults: Json | null
          org_name: string
          phone: string | null
          primary_color: string | null
          retention_policy: Json | null
          singleton: boolean
          sso_metadata_url: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          ein?: string | null
          id?: string
          logo_url?: string | null
          notification_defaults?: Json | null
          org_name?: string
          phone?: string | null
          primary_color?: string | null
          retention_policy?: Json | null
          singleton?: boolean
          sso_metadata_url?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          ein?: string | null
          id?: string
          logo_url?: string | null
          notification_defaults?: Json | null
          org_name?: string
          phone?: string | null
          primary_color?: string | null
          retention_policy?: Json | null
          singleton?: boolean
          sso_metadata_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      performance_review_signatures: {
        Row: {
          id: string
          ip_address: string | null
          review_id: string
          signature_text: string | null
          signed_at: string
          signer_role: string
          signer_user_id: string
        }
        Insert: {
          id?: string
          ip_address?: string | null
          review_id: string
          signature_text?: string | null
          signed_at?: string
          signer_role: string
          signer_user_id: string
        }
        Update: {
          id?: string
          ip_address?: string | null
          review_id?: string
          signature_text?: string | null
          signed_at?: string
          signer_role?: string
          signer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_review_signatures_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "performance_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reviews: {
        Row: {
          ai_draft: string | null
          ai_generated_at: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          employee_self_assessment: string | null
          finalized_at: string | null
          id: string
          manager_narrative: string | null
          manager_user_id: string | null
          overall_rating: number | null
          ratings: Json
          review_period_end: string
          review_period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          ai_draft?: string | null
          ai_generated_at?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          employee_self_assessment?: string | null
          finalized_at?: string | null
          id?: string
          manager_narrative?: string | null
          manager_user_id?: string | null
          overall_rating?: number | null
          ratings?: Json
          review_period_end: string
          review_period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          ai_draft?: string | null
          ai_generated_at?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          employee_self_assessment?: string | null
          finalized_at?: string | null
          id?: string
          manager_narrative?: string | null
          manager_user_id?: string | null
          overall_rating?: number | null
          ratings?: Json
          review_period_end?: string
          review_period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      policies: {
        Row: {
          applies_to_worker_types: string[] | null
          body_md: string
          created_at: string
          effective_date: string
          id: string
          published: boolean
          requires_reack_months: number | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          applies_to_worker_types?: string[] | null
          body_md: string
          created_at?: string
          effective_date?: string
          id?: string
          published?: boolean
          requires_reack_months?: number | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          applies_to_worker_types?: string[] | null
          body_md?: string
          created_at?: string
          effective_date?: string
          id?: string
          published?: boolean
          requires_reack_months?: number | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      policy_acknowledgments: {
        Row: {
          acknowledged_at: string
          employee_id: string
          id: string
          ip: string | null
          policy_id: string
          signature_id: string | null
          user_id: string | null
          version: number
        }
        Insert: {
          acknowledged_at?: string
          employee_id: string
          id?: string
          ip?: string | null
          policy_id: string
          signature_id?: string | null
          user_id?: string | null
          version: number
        }
        Update: {
          acknowledged_at?: string
          employee_id?: string
          id?: string
          ip?: string | null
          policy_id?: string
          signature_id?: string | null
          user_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "policy_acknowledgments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_acknowledgments_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_acknowledgments_signature_id_fkey"
            columns: ["signature_id"]
            isOneToOne: false
            referencedRelation: "signatures"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          budgeted_fte: number
          created_at: string
          department: string | null
          flsa_class: string | null
          id: string
          notes: string | null
          pay_grade: string | null
          pay_step: string | null
          position_code: string | null
          reports_to_position_id: string | null
          status: string
          title: string
          updated_at: string
          worker_type_id: string | null
        }
        Insert: {
          budgeted_fte?: number
          created_at?: string
          department?: string | null
          flsa_class?: string | null
          id?: string
          notes?: string | null
          pay_grade?: string | null
          pay_step?: string | null
          position_code?: string | null
          reports_to_position_id?: string | null
          status?: string
          title: string
          updated_at?: string
          worker_type_id?: string | null
        }
        Update: {
          budgeted_fte?: number
          created_at?: string
          department?: string | null
          flsa_class?: string | null
          id?: string
          notes?: string | null
          pay_grade?: string | null
          pay_step?: string | null
          position_code?: string | null
          reports_to_position_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          worker_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_reports_to_position_id_fkey"
            columns: ["reports_to_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_worker_type_id_fkey"
            columns: ["worker_type_id"]
            isOneToOne: false
            referencedRelation: "worker_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ppe_sizing: {
        Row: {
          boot: string | null
          employee_id: string
          glove: string | null
          hat: string | null
          id: string
          notes: string | null
          pants: string | null
          shirt: string | null
          updated_at: string
        }
        Insert: {
          boot?: string | null
          employee_id: string
          glove?: string | null
          hat?: string | null
          id?: string
          notes?: string | null
          pants?: string | null
          shirt?: string | null
          updated_at?: string
        }
        Update: {
          boot?: string | null
          employee_id?: string
          glove?: string | null
          hat?: string | null
          id?: string
          notes?: string | null
          pants?: string | null
          shirt?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppe_sizing_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
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
      screenings: {
        Row: {
          completed_at: string | null
          created_at: string
          document_id: string | null
          employee_id: string
          id: string
          notes: string | null
          result: string | null
          scheduled_at: string | null
          status: string
          type: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          document_id?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          result?: string | null
          scheduled_at?: string | null
          status?: string
          type: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          document_id?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          result?: string | null
          scheduled_at?: string | null
          status?: string
          type?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "screenings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
          default_provisioning: Json
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
          default_provisioning?: Json
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
          default_provisioning?: Json
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
      position_headcount: {
        Row: {
          budgeted_fte: number | null
          department: string | null
          filled_count: number | null
          total_positions: number | null
          vacant_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_hire_request:
        | {
            Args: {
              _department: string
              _email: string
              _first_name: string
              _job_title: string
              _last_name: string
              _notes: string
              _reason: string
              _start_date: string
              _worker_type_id: string
            }
            Returns: string
          }
        | {
            Args: {
              _department: string
              _email: string
              _first_name: string
              _job_title: string
              _last_name: string
              _notes: string
              _provisioning_kinds?: string[]
              _reason: string
              _start_date: string
              _worker_type_id: string
            }
            Returns: string
          }
      decide_hire_request: {
        Args: { _action: string; _hr_notes: string; _request_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "hr_admin"
        | "hiring_manager"
        | "it_admin"
        | "employee"
        | "candidate"
        | "supervisor"
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
        "supervisor",
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
