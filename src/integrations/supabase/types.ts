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
      ai_suggestions: {
        Row: {
          application_id: string | null
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          decision: string | null
          decision_diff: Json | null
          id: string
          input_hash: string
          interview_id: string | null
          kind: string
          model: string
          payload: Json
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          decision_diff?: Json | null
          id?: string
          input_hash: string
          interview_id?: string | null
          kind: string
          model: string
          payload: Json
        }
        Update: {
          application_id?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          decision_diff?: Json | null
          id?: string
          input_hash?: string
          interview_id?: string | null
          kind?: string
          model?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestions_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      application_ai_parse: {
        Row: {
          application_id: string
          created_at: string
          created_by: string | null
          input_hash: string
          model: string
          parsed: Json
          redaction_version: string
          updated_at: string
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by?: string | null
          input_hash: string
          model: string
          parsed: Json
          redaction_version: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          input_hash?: string
          model?: string
          parsed?: Json
          redaction_version?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_ai_parse_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_messages: {
        Row: {
          application_id: string
          body: string
          created_at: string
          id: string
          read_by_candidate_at: string | null
          read_by_recruiter_at: string | null
          sender: string
          sender_user_id: string | null
        }
        Insert: {
          application_id: string
          body: string
          created_at?: string
          id?: string
          read_by_candidate_at?: string | null
          read_by_recruiter_at?: string | null
          sender: string
          sender_user_id?: string | null
        }
        Update: {
          application_id?: string
          body?: string
          created_at?: string
          id?: string
          read_by_candidate_at?: string | null
          read_by_recruiter_at?: string | null
          sender?: string
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_messages_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_self_id: {
        Row: {
          application_id: string
          created_at: string
          declined: boolean
          disability_status: string | null
          gender: string | null
          id: string
          race_ethnicity: string | null
          veteran_status: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          declined?: boolean
          disability_status?: string | null
          gender?: string | null
          id?: string
          race_ethnicity?: string | null
          veteran_status?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          declined?: boolean
          disability_status?: string | null
          gender?: string | null
          id?: string
          race_ethnicity?: string | null
          veteran_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_self_id_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_chains: {
        Row: {
          created_at: string
          created_by: string | null
          current_stage: number
          entity_id: string
          entity_type: string
          id: string
          kind: string | null
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
          kind?: string | null
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
          kind?: string | null
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
      bargaining_units: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
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
      candidate_tokens: {
        Row: {
          application_id: string
          created_at: string
          expires_at: string
          id: string
          purpose: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          application_id: string
          created_at?: string
          expires_at: string
          id?: string
          purpose?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          application_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_tokens_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
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
      cba_contracts: {
        Row: {
          bargaining_unit_id: string
          created_at: string
          document_url: string | null
          effective_from: string
          effective_to: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          bargaining_unit_id: string
          created_at?: string
          document_url?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          bargaining_unit_id?: string
          created_at?: string
          document_url?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cba_contracts_bargaining_unit_id_fkey"
            columns: ["bargaining_unit_id"]
            isOneToOne: false
            referencedRelation: "bargaining_units"
            referencedColumns: ["id"]
          },
        ]
      }
      cba_longevity_rules: {
        Row: {
          annual_amount: number | null
          contract_id: string
          created_at: string
          id: string
          monthly_amount: number | null
          percent_of_base: number | null
          years_of_service: number
        }
        Insert: {
          annual_amount?: number | null
          contract_id: string
          created_at?: string
          id?: string
          monthly_amount?: number | null
          percent_of_base?: number | null
          years_of_service: number
        }
        Update: {
          annual_amount?: number | null
          contract_id?: string
          created_at?: string
          id?: string
          monthly_amount?: number | null
          percent_of_base?: number | null
          years_of_service?: number
        }
        Relationships: [
          {
            foreignKeyName: "cba_longevity_rules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "cba_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      cba_step_tables: {
        Row: {
          annual_rate: number | null
          contract_id: string
          created_at: string
          grade: string
          hourly_rate: number | null
          id: string
          months_to_next_step: number | null
          step: number
        }
        Insert: {
          annual_rate?: number | null
          contract_id: string
          created_at?: string
          grade: string
          hourly_rate?: number | null
          id?: string
          months_to_next_step?: number | null
          step: number
        }
        Update: {
          annual_rate?: number | null
          contract_id?: string
          created_at?: string
          grade?: string
          hourly_rate?: number | null
          id?: string
          months_to_next_step?: number | null
          step?: number
        }
        Relationships: [
          {
            foreignKeyName: "cba_step_tables_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "cba_contracts"
            referencedColumns: ["id"]
          },
        ]
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
      comp_cycles: {
        Row: {
          budget_pct: number
          created_at: string
          created_by: string | null
          effective_date: string
          eligibility_filter: Json
          id: string
          name: string
          period_end: string
          period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          budget_pct?: number
          created_at?: string
          created_by?: string | null
          effective_date: string
          eligibility_filter?: Json
          id?: string
          name: string
          period_end: string
          period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          budget_pct?: number
          created_at?: string
          created_by?: string | null
          effective_date?: string
          eligibility_filter?: Json
          id?: string
          name?: string
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      comp_review_participants: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          current_comp_id: string | null
          cycle_id: string
          employee_id: string
          id: string
          latest_rating: string | null
          latest_review_id: string | null
          manager_id: string | null
          manager_notes: string | null
          proposed_bonus_amount: number | null
          proposed_merit_pct: number | null
          proposed_promotion_grade_id: string | null
          recommended_merit_pct: number | null
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          current_comp_id?: string | null
          cycle_id: string
          employee_id: string
          id?: string
          latest_rating?: string | null
          latest_review_id?: string | null
          manager_id?: string | null
          manager_notes?: string | null
          proposed_bonus_amount?: number | null
          proposed_merit_pct?: number | null
          proposed_promotion_grade_id?: string | null
          recommended_merit_pct?: number | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          current_comp_id?: string | null
          cycle_id?: string
          employee_id?: string
          id?: string
          latest_rating?: string | null
          latest_review_id?: string | null
          manager_id?: string | null
          manager_notes?: string | null
          proposed_bonus_amount?: number | null
          proposed_merit_pct?: number | null
          proposed_promotion_grade_id?: string | null
          recommended_merit_pct?: number | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comp_review_participants_current_comp_id_fkey"
            columns: ["current_comp_id"]
            isOneToOne: false
            referencedRelation: "employee_comp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_review_participants_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "comp_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_review_participants_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_review_participants_latest_review_id_fkey"
            columns: ["latest_review_id"]
            isOneToOne: false
            referencedRelation: "performance_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_review_participants_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_review_participants_proposed_promotion_grade_id_fkey"
            columns: ["proposed_promotion_grade_id"]
            isOneToOne: false
            referencedRelation: "pay_grades"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_time_balances: {
        Row: {
          balance_hours: number
          employee_id: string
          pending_hours: number
          updated_at: string
        }
        Insert: {
          balance_hours?: number
          employee_id: string
          pending_hours?: number
          updated_at?: string
        }
        Update: {
          balance_hours?: number
          employee_id?: string
          pending_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comp_time_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_time_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          delta_hours: number
          employee_id: string
          id: string
          notes: string | null
          reason: string
          source_entry_id: string | null
          source_leave_request_id: string | null
          source_timesheet_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta_hours: number
          employee_id: string
          id?: string
          notes?: string | null
          reason: string
          source_entry_id?: string | null
          source_leave_request_id?: string | null
          source_timesheet_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta_hours?: number
          employee_id?: string
          id?: string
          notes?: string | null
          reason?: string
          source_entry_id?: string | null
          source_leave_request_id?: string | null
          source_timesheet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comp_time_ledger_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_time_ledger_source_entry_id_fkey"
            columns: ["source_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_time_ledger_source_leave_request_id_fkey"
            columns: ["source_leave_request_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_time_ledger_source_timesheet_id_fkey"
            columns: ["source_timesheet_id"]
            isOneToOne: false
            referencedRelation: "timesheets"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          active: boolean
          auto_assign_on_hire: boolean
          compliance_framework: string | null
          content_md: string | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          external_course_id: string | null
          external_provider: string | null
          id: string
          issues_certification_id: string | null
          materials_url: string | null
          name: string
          passing_score: number | null
          provider: string | null
          recurrence_months: number | null
          required_for_worker_types: string[] | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          auto_assign_on_hire?: boolean
          compliance_framework?: string | null
          content_md?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          external_course_id?: string | null
          external_provider?: string | null
          id?: string
          issues_certification_id?: string | null
          materials_url?: string | null
          name: string
          passing_score?: number | null
          provider?: string | null
          recurrence_months?: number | null
          required_for_worker_types?: string[] | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          auto_assign_on_hire?: boolean
          compliance_framework?: string | null
          content_md?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          external_course_id?: string | null
          external_provider?: string | null
          id?: string
          issues_certification_id?: string | null
          materials_url?: string | null
          name?: string
          passing_score?: number | null
          provider?: string | null
          recurrence_months?: number | null
          required_for_worker_types?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_issues_certification_id_fkey"
            columns: ["issues_certification_id"]
            isOneToOne: false
            referencedRelation: "certifications"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_audit_log: {
        Row: {
          created_at: string
          id: number
          new_row: Json | null
          note: string | null
          old_row: Json | null
          op: string
          pk_val: string | null
          table_name: string
        }
        Insert: {
          created_at?: string
          id?: number
          new_row?: Json | null
          note?: string | null
          old_row?: Json | null
          op: string
          pk_val?: string | null
          table_name: string
        }
        Update: {
          created_at?: string
          id?: number
          new_row?: Json | null
          note?: string | null
          old_row?: Json | null
          op?: string
          pk_val?: string | null
          table_name?: string
        }
        Relationships: []
      }
      demo_config: {
        Row: {
          demo_user_id: string | null
          id: boolean
          last_reset_at: string | null
          updated_at: string
        }
        Insert: {
          demo_user_id?: string | null
          id?: boolean
          last_reset_at?: string | null
          updated_at?: string
        }
        Update: {
          demo_user_id?: string | null
          id?: boolean
          last_reset_at?: string | null
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
      doc_templates: {
        Row: {
          body_font: string
          brand_accent: string
          brand_primary: string
          cover_style: string
          created_at: string
          created_by: string | null
          description: string | null
          footer_text: string | null
          header_font: string
          id: string
          include_signature_block: boolean
          include_toc: boolean
          is_default: boolean
          logo_url: string | null
          name: string
          org_address: string | null
          org_name: string | null
          section_order: string[]
          updated_at: string
        }
        Insert: {
          body_font?: string
          brand_accent?: string
          brand_primary?: string
          cover_style?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          footer_text?: string | null
          header_font?: string
          id?: string
          include_signature_block?: boolean
          include_toc?: boolean
          is_default?: boolean
          logo_url?: string | null
          name: string
          org_address?: string | null
          org_name?: string | null
          section_order?: string[]
          updated_at?: string
        }
        Update: {
          body_font?: string
          brand_accent?: string
          brand_primary?: string
          cover_style?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          footer_text?: string | null
          header_font?: string
          id?: string
          include_signature_block?: boolean
          include_toc?: boolean
          is_default?: boolean
          logo_url?: string | null
          name?: string
          org_address?: string | null
          org_name?: string | null
          section_order?: string[]
          updated_at?: string
        }
        Relationships: []
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
      email_templates: {
        Row: {
          active: boolean
          body: string
          created_at: string
          description: string | null
          id: string
          name: string
          subject: string
          template_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          subject: string
          template_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          subject?: string
          template_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      employee_comp: {
        Row: {
          base_annual: number | null
          change_reason: string | null
          created_at: string
          created_by: string | null
          currency: string
          cycle_id: string | null
          effective_date: string
          employee_id: string
          hourly_rate: number | null
          id: string
          pay_grade_id: string | null
          source: string
          target_bonus_pct: number | null
          target_equity: number | null
          updated_at: string
        }
        Insert: {
          base_annual?: number | null
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          cycle_id?: string | null
          effective_date: string
          employee_id: string
          hourly_rate?: number | null
          id?: string
          pay_grade_id?: string | null
          source?: string
          target_bonus_pct?: number | null
          target_equity?: number | null
          updated_at?: string
        }
        Update: {
          base_annual?: number | null
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          cycle_id?: string | null
          effective_date?: string
          employee_id?: string
          hourly_rate?: number | null
          id?: string
          pay_grade_id?: string | null
          source?: string
          target_bonus_pct?: number | null
          target_equity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_comp_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "comp_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_comp_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_comp_pay_grade_id_fkey"
            columns: ["pay_grade_id"]
            isOneToOne: false
            referencedRelation: "pay_grades"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_leave_enrollments: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          opening_balance_hours: number
          plan_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id: string
          id?: string
          opening_balance_hours?: number
          plan_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          opening_balance_hours?: number
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_leave_enrollments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leave_enrollments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "leave_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_pattern_assignments: {
        Row: {
          anchor_date: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          notes: string | null
          pattern_id: string
          updated_at: string
        }
        Insert: {
          anchor_date: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          pattern_id: string
          updated_at?: string
        }
        Update: {
          anchor_date?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          pattern_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_pattern_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_pattern_assignments_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "schedule_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_schedules: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          employee_id: string
          expected_weekly_hours: number
          fri_end: string | null
          fri_start: string | null
          id: string
          mon_end: string | null
          mon_start: string | null
          notes: string | null
          sat_end: string | null
          sat_start: string | null
          sun_end: string | null
          sun_start: string | null
          thu_end: string | null
          thu_start: string | null
          tue_end: string | null
          tue_start: string | null
          updated_at: string
          wed_end: string | null
          wed_start: string | null
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id: string
          expected_weekly_hours?: number
          fri_end?: string | null
          fri_start?: string | null
          id?: string
          mon_end?: string | null
          mon_start?: string | null
          notes?: string | null
          sat_end?: string | null
          sat_start?: string | null
          sun_end?: string | null
          sun_start?: string | null
          thu_end?: string | null
          thu_start?: string | null
          tue_end?: string | null
          tue_start?: string | null
          updated_at?: string
          wed_end?: string | null
          wed_start?: string | null
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          expected_weekly_hours?: number
          fri_end?: string | null
          fri_start?: string | null
          id?: string
          mon_end?: string | null
          mon_start?: string | null
          notes?: string | null
          sat_end?: string | null
          sat_start?: string | null
          sun_end?: string | null
          sun_start?: string | null
          thu_end?: string | null
          thu_start?: string | null
          tue_end?: string | null
          tue_start?: string | null
          updated_at?: string
          wed_end?: string | null
          wed_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_training: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          due_date: string | null
          employee_id: string
          evidence_path: string | null
          id: string
          last_reminded_at: string | null
          notes: string | null
          parent_id: string | null
          score: number | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          course_id: string
          created_at?: string
          due_date?: string | null
          employee_id: string
          evidence_path?: string | null
          id?: string
          last_reminded_at?: string | null
          notes?: string | null
          parent_id?: string | null
          score?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          course_id?: string
          created_at?: string
          due_date?: string | null
          employee_id?: string
          evidence_path?: string | null
          id?: string
          last_reminded_at?: string | null
          notes?: string | null
          parent_id?: string | null
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
          {
            foreignKeyName: "employee_training_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "employee_training"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_union_membership: {
        Row: {
          active: boolean
          bargaining_unit_id: string
          created_at: string
          employee_id: string
          grade: string | null
          id: string
          longevity_start_date: string | null
          step: number | null
          step_anniversary_date: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          bargaining_unit_id: string
          created_at?: string
          employee_id: string
          grade?: string | null
          id?: string
          longevity_start_date?: string | null
          step?: number | null
          step_anniversary_date?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          bargaining_unit_id?: string
          created_at?: string
          employee_id?: string
          grade?: string | null
          id?: string
          longevity_start_date?: string | null
          step?: number | null
          step_anniversary_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_union_membership_bargaining_unit_id_fkey"
            columns: ["bargaining_unit_id"]
            isOneToOne: false
            referencedRelation: "bargaining_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_union_membership_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_work_periods: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          kind: string
          notes: string | null
          ot_threshold_hours: number
          period_anchor_date: string
          period_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          employee_id: string
          id?: string
          kind?: string
          notes?: string | null
          ot_threshold_hours?: number
          period_anchor_date?: string
          period_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          kind?: string
          notes?: string | null
          ot_threshold_hours?: number
          period_anchor_date?: string
          period_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_work_periods_employee_id_fkey"
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
          date_of_birth: string | null
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
          photo_path: string | null
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
          date_of_birth?: string | null
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
          photo_path?: string | null
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
          date_of_birth?: string | null
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
          photo_path?: string | null
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
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
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
      flsa_reviews: {
        Row: {
          created_at: string
          decision: string
          duties_test_notes: string | null
          exempt_basis: string | null
          id: string
          next_review_date: string | null
          position_id: string
          reviewed_at: string
          reviewed_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          decision: string
          duties_test_notes?: string | null
          exempt_basis?: string | null
          id?: string
          next_review_date?: string | null
          position_id: string
          reviewed_at?: string
          reviewed_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          decision?: string
          duties_test_notes?: string | null
          exempt_basis?: string | null
          id?: string
          next_review_date?: string | null
          position_id?: string
          reviewed_at?: string
          reviewed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flsa_reviews_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      fmla_cases: {
        Row: {
          case_end_date: string | null
          case_number: string | null
          case_start_date: string
          certification_expires_at: string | null
          certification_received_at: string | null
          created_at: string
          eligibility_confirmed: boolean
          eligibility_notes: string | null
          employee_id: string
          hours_entitled: number
          hours_used: number
          id: string
          is_intermittent: boolean
          reason: string
          rolling_period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          case_end_date?: string | null
          case_number?: string | null
          case_start_date: string
          certification_expires_at?: string | null
          certification_received_at?: string | null
          created_at?: string
          eligibility_confirmed?: boolean
          eligibility_notes?: string | null
          employee_id: string
          hours_entitled?: number
          hours_used?: number
          id?: string
          is_intermittent?: boolean
          reason: string
          rolling_period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          case_end_date?: string | null
          case_number?: string | null
          case_start_date?: string
          certification_expires_at?: string | null
          certification_received_at?: string | null
          created_at?: string
          eligibility_confirmed?: boolean
          eligibility_notes?: string | null
          employee_id?: string
          hours_entitled?: number
          hours_used?: number
          id?: string
          is_intermittent?: boolean
          reason?: string
          rolling_period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fmla_cases_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
          weight: number
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
          weight?: number
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
          weight?: number
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
      id_badge_templates: {
        Row: {
          accent_color: string
          back_text: string | null
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          logo_path: string | null
          name: string
          org_name: string
          orientation: string
          show_fields: Json
          updated_at: string
        }
        Insert: {
          accent_color?: string
          back_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          logo_path?: string | null
          name: string
          org_name: string
          orientation?: string
          show_fields?: Json
          updated_at?: string
        }
        Update: {
          accent_color?: string
          back_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          logo_path?: string | null
          name?: string
          org_name?: string
          orientation?: string
          show_fields?: Json
          updated_at?: string
        }
        Relationships: []
      }
      id_badges: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          issued_at: string
          issued_by: string | null
          pdf_path: string | null
          revoked_at: string | null
          revoked_by: string | null
          serial: string
          template_id: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          pdf_path?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          serial: string
          template_id?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          pdf_path?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          serial?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "id_badges_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "id_badges_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "id_badge_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_links: {
        Row: {
          active: boolean
          attributes: Json
          created_at: string
          employee_id: string
          external_email: string | null
          external_id: string
          external_user_name: string | null
          id: string
          last_synced_at: string | null
          provider_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          attributes?: Json
          created_at?: string
          employee_id: string
          external_email?: string | null
          external_id: string
          external_user_name?: string | null
          id?: string
          last_synced_at?: string | null
          provider_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          attributes?: Json
          created_at?: string
          employee_id?: string
          external_email?: string | null
          external_id?: string
          external_user_name?: string | null
          id?: string
          last_synced_at?: string | null
          provider_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_links_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_links_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "identity_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_providers: {
        Row: {
          config: Json
          created_at: string
          domain: string | null
          id: string
          kind: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          domain?: string | null
          id?: string
          kind: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          domain?: string | null
          id?: string
          kind?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      import_jobs: {
        Row: {
          created_at: string
          created_by: string
          error_message: string | null
          errors: Json
          finished_at: string | null
          id: string
          inserted: number
          kind: string
          processed_rows: number
          skipped: number
          started_at: string | null
          status: string
          total_rows: number
          updated: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          error_message?: string | null
          errors?: Json
          finished_at?: string | null
          id?: string
          inserted?: number
          kind: string
          processed_rows?: number
          skipped?: number
          started_at?: string | null
          status?: string
          total_rows?: number
          updated?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          error_message?: string | null
          errors?: Json
          finished_at?: string | null
          id?: string
          inserted?: number
          kind?: string
          processed_rows?: number
          skipped?: number
          started_at?: string | null
          status?: string
          total_rows?: number
          updated?: number
          updated_at?: string
        }
        Relationships: []
      }
      interview_dsr_requests: {
        Row: {
          application_id: string | null
          created_at: string
          id: string
          invitation_id: string | null
          kind: Database["public"]["Enums"]["interview_dsr_kind"]
          notes: string | null
          processed_at: string | null
          processed_by: string | null
          requested_email: string | null
          status: Database["public"]["Enums"]["interview_dsr_status"]
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          id?: string
          invitation_id?: string | null
          kind: Database["public"]["Enums"]["interview_dsr_kind"]
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          requested_email?: string | null
          status?: Database["public"]["Enums"]["interview_dsr_status"]
        }
        Update: {
          application_id?: string | null
          created_at?: string
          id?: string
          invitation_id?: string | null
          kind?: Database["public"]["Enums"]["interview_dsr_kind"]
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          requested_email?: string | null
          status?: Database["public"]["Enums"]["interview_dsr_status"]
        }
        Relationships: [
          {
            foreignKeyName: "interview_dsr_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_dsr_requests_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "interview_invitations"
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
      interview_invitations: {
        Row: {
          accommodation_approved_at: string | null
          accommodation_request: Json | null
          aivi_disclosure_ack_at: string | null
          application_id: string
          consent_at: string | null
          consent_ip: string | null
          consent_user_agent: string | null
          created_at: string
          created_by: string | null
          device_check: Json | null
          expires_at: string
          id: string
          kind: Database["public"]["Enums"]["interview_kit_kind"]
          kit_id: string | null
          purge_at: string | null
          requisition_id: string | null
          retention_days: number
          status: Database["public"]["Enums"]["interview_invitation_status"]
          submitted_at: string | null
          token_hash: string
          updated_at: string
        }
        Insert: {
          accommodation_approved_at?: string | null
          accommodation_request?: Json | null
          aivi_disclosure_ack_at?: string | null
          application_id: string
          consent_at?: string | null
          consent_ip?: string | null
          consent_user_agent?: string | null
          created_at?: string
          created_by?: string | null
          device_check?: Json | null
          expires_at: string
          id?: string
          kind: Database["public"]["Enums"]["interview_kit_kind"]
          kit_id?: string | null
          purge_at?: string | null
          requisition_id?: string | null
          retention_days?: number
          status?: Database["public"]["Enums"]["interview_invitation_status"]
          submitted_at?: string | null
          token_hash: string
          updated_at?: string
        }
        Update: {
          accommodation_approved_at?: string | null
          accommodation_request?: Json | null
          aivi_disclosure_ack_at?: string | null
          application_id?: string
          consent_at?: string | null
          consent_ip?: string | null
          consent_user_agent?: string | null
          created_at?: string
          created_by?: string | null
          device_check?: Json | null
          expires_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["interview_kit_kind"]
          kit_id?: string | null
          purge_at?: string | null
          requisition_id?: string | null
          retention_days?: number
          status?: Database["public"]["Enums"]["interview_invitation_status"]
          submitted_at?: string | null
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_invitations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_invitations_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "interview_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_invitations_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "job_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_kits: {
        Row: {
          ai_assist_default: boolean
          created_at: string
          created_by: string | null
          default_retention_days: number
          description: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["interview_kit_kind"]
          name: string
          questions: Json
          rubric: Json
          updated_at: string
        }
        Insert: {
          ai_assist_default?: boolean
          created_at?: string
          created_by?: string | null
          default_retention_days?: number
          description?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["interview_kit_kind"]
          name: string
          questions?: Json
          rubric?: Json
          updated_at?: string
        }
        Update: {
          ai_assist_default?: boolean
          created_at?: string
          created_by?: string | null
          default_retention_days?: number
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["interview_kit_kind"]
          name?: string
          questions?: Json
          rubric?: Json
          updated_at?: string
        }
        Relationships: []
      }
      interview_recording_access: {
        Row: {
          context: string
          context_id: string | null
          id: string
          ip: string | null
          recording_object_path: string
          signed_url_expires_at: string | null
          user_agent: string | null
          viewed_at: string
          viewed_by: string | null
        }
        Insert: {
          context: string
          context_id?: string | null
          id?: string
          ip?: string | null
          recording_object_path: string
          signed_url_expires_at?: string | null
          user_agent?: string | null
          viewed_at?: string
          viewed_by?: string | null
        }
        Update: {
          context?: string
          context_id?: string | null
          id?: string
          ip?: string | null
          recording_object_path?: string
          signed_url_expires_at?: string | null
          user_agent?: string | null
          viewed_at?: string
          viewed_by?: string | null
        }
        Relationships: []
      }
      interview_responses: {
        Row: {
          captions_vtt_path: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          invitation_id: string
          is_final: boolean
          media_mime: string | null
          media_object_path: string | null
          question_id: string
          take_number: number
          transcript: string | null
        }
        Insert: {
          captions_vtt_path?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          invitation_id: string
          is_final?: boolean
          media_mime?: string | null
          media_object_path?: string | null
          question_id: string
          take_number: number
          transcript?: string | null
        }
        Update: {
          captions_vtt_path?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          invitation_id?: string
          is_final?: boolean
          media_mime?: string | null
          media_object_path?: string | null
          question_id?: string
          take_number?: number
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_responses_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "interview_invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_retention_audit: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          next: Json
          note: string | null
          previous: Json
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          next?: Json
          note?: string | null
          previous?: Json
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          next?: Json
          note?: string | null
          previous?: Json
        }
        Relationships: []
      }
      interview_rooms: {
        Row: {
          ai_captions_enabled: boolean
          consent_log: Json
          created_at: string
          egress_id: string | null
          ended_at: string | null
          id: string
          interview_id: string
          livekit_room_name: string
          livekit_sid: string | null
          recording_duration_seconds: number | null
          recording_object_path: string | null
          retention_days: number
          started_at: string | null
          updated_at: string
          watermark_text: string | null
        }
        Insert: {
          ai_captions_enabled?: boolean
          consent_log?: Json
          created_at?: string
          egress_id?: string | null
          ended_at?: string | null
          id?: string
          interview_id: string
          livekit_room_name: string
          livekit_sid?: string | null
          recording_duration_seconds?: number | null
          recording_object_path?: string | null
          retention_days?: number
          started_at?: string | null
          updated_at?: string
          watermark_text?: string | null
        }
        Update: {
          ai_captions_enabled?: boolean
          consent_log?: Json
          created_at?: string
          egress_id?: string | null
          ended_at?: string | null
          id?: string
          interview_id?: string
          livekit_room_name?: string
          livekit_sid?: string | null
          recording_duration_seconds?: number | null
          recording_object_path?: string | null
          retention_days?: number
          started_at?: string | null
          updated_at?: string
          watermark_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_rooms_interview_id_fkey"
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
          invitation_id: string | null
          kind: string | null
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
          invitation_id?: string | null
          kind?: string | null
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
          invitation_id?: string | null
          kind?: string | null
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
          {
            foreignKeyName: "interviews_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "interview_invitations"
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
          ai_rubric: Json
          benefits: string | null
          brochure_url: string | null
          closes_at: string | null
          created_at: string
          department: string | null
          description: string | null
          employment_type: string | null
          hire_request_id: string | null
          hiring_manager_id: string | null
          id: string
          internal_only: boolean
          interview_ai_assist_enabled: boolean
          interview_retention_days: number
          location: string | null
          position_id: string | null
          posted_at: string | null
          posting_sections: Json
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
          ai_rubric?: Json
          benefits?: string | null
          brochure_url?: string | null
          closes_at?: string | null
          created_at?: string
          department?: string | null
          description?: string | null
          employment_type?: string | null
          hire_request_id?: string | null
          hiring_manager_id?: string | null
          id?: string
          internal_only?: boolean
          interview_ai_assist_enabled?: boolean
          interview_retention_days?: number
          location?: string | null
          position_id?: string | null
          posted_at?: string | null
          posting_sections?: Json
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
          ai_rubric?: Json
          benefits?: string | null
          brochure_url?: string | null
          closes_at?: string | null
          created_at?: string
          department?: string | null
          description?: string | null
          employment_type?: string | null
          hire_request_id?: string | null
          hiring_manager_id?: string | null
          id?: string
          internal_only?: boolean
          interview_ai_assist_enabled?: boolean
          interview_retention_days?: number
          location?: string | null
          position_id?: string | null
          posted_at?: string | null
          posting_sections?: Json
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
      leave_balances: {
        Row: {
          accrued_hours: number
          balance_hours: number | null
          created_at: string
          employee_id: string
          id: string
          last_accrual_at: string | null
          pending_hours: number
          plan_id: string
          updated_at: string
          used_hours: number
        }
        Insert: {
          accrued_hours?: number
          balance_hours?: number | null
          created_at?: string
          employee_id: string
          id?: string
          last_accrual_at?: string | null
          pending_hours?: number
          plan_id: string
          updated_at?: string
          used_hours?: number
        }
        Update: {
          accrued_hours?: number
          balance_hours?: number | null
          created_at?: string
          employee_id?: string
          id?: string
          last_accrual_at?: string | null
          pending_hours?: number
          plan_id?: string
          updated_at?: string
          used_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "leave_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_plans: {
        Row: {
          accrual_frequency: string
          accrual_rate_hours: number
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_comp_time: boolean
          is_fmla: boolean
          max_balance_hours: number | null
          max_carryover_hours: number | null
          name: string
          paid: boolean
          requires_balance: boolean
          sort_order: number
          updated_at: string
          worker_type_id: string | null
        }
        Insert: {
          accrual_frequency?: string
          accrual_rate_hours?: number
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_comp_time?: boolean
          is_fmla?: boolean
          max_balance_hours?: number | null
          max_carryover_hours?: number | null
          name: string
          paid?: boolean
          requires_balance?: boolean
          sort_order?: number
          updated_at?: string
          worker_type_id?: string | null
        }
        Update: {
          accrual_frequency?: string
          accrual_rate_hours?: number
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_comp_time?: boolean
          is_fmla?: boolean
          max_balance_hours?: number | null
          max_carryover_hours?: number | null
          name?: string
          paid?: boolean
          requires_balance?: boolean
          sort_order?: number
          updated_at?: string
          worker_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_plans_worker_type_id_fkey"
            columns: ["worker_type_id"]
            isOneToOne: false
            referencedRelation: "worker_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          employee_id: string
          end_date: string
          fmla_case_id: string | null
          id: string
          is_intermittent: boolean
          plan_id: string
          reason: string | null
          start_date: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          total_hours: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          employee_id: string
          end_date: string
          fmla_case_id?: string | null
          id?: string
          is_intermittent?: boolean
          plan_id: string
          reason?: string | null
          start_date: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          total_hours: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          employee_id?: string
          end_date?: string
          fmla_case_id?: string | null
          id?: string
          is_intermittent?: boolean
          plan_id?: string
          reason?: string | null
          start_date?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          total_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_fmla_fk"
            columns: ["fmla_case_id"]
            isOneToOne: false
            referencedRelation: "fmla_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "leave_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_credit_imports: {
        Row: {
          applied_rows: number
          committed_at: string | null
          created_at: string
          errors: Json
          filename: string | null
          id: string
          matched_rows: number
          preview: Json
          provider: string
          status: string
          total_rows: number
          unmatched_rows: number
          uploaded_by: string | null
        }
        Insert: {
          applied_rows?: number
          committed_at?: string | null
          created_at?: string
          errors?: Json
          filename?: string | null
          id?: string
          matched_rows?: number
          preview?: Json
          provider: string
          status?: string
          total_rows?: number
          unmatched_rows?: number
          uploaded_by?: string | null
        }
        Update: {
          applied_rows?: number
          committed_at?: string | null
          created_at?: string
          errors?: Json
          filename?: string | null
          id?: string
          matched_rows?: number
          preview?: Json
          provider?: string
          status?: string
          total_rows?: number
          unmatched_rows?: number
          uploaded_by?: string | null
        }
        Relationships: []
      }
      market_ranges: {
        Row: {
          created_at: string
          currency: string
          effective_date: string
          geo: string
          id: string
          job_family: string
          level: string
          p25: number
          p50: number
          p75: number
          source: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          effective_date?: string
          geo?: string
          id?: string
          job_family: string
          level: string
          p25: number
          p50: number
          p75: number
          source?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          effective_date?: string
          geo?: string
          id?: string
          job_family?: string
          level?: string
          p25?: number
          p50?: number
          p75?: number
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      migration_sources: {
        Row: {
          column_map: Json
          created_at: string
          expected_files: Json
          id: string
          name: string
          notes: string | null
          updated_at: string
          vendor: string
        }
        Insert: {
          column_map?: Json
          created_at?: string
          expected_files?: Json
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          vendor: string
        }
        Update: {
          column_map?: Json
          created_at?: string
          expected_files?: Json
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          vendor?: string
        }
        Relationships: []
      }
      migration_stages: {
        Row: {
          created_at: string
          external_key: string
          id: string
          import_job_id: string | null
          outcome: string
          outcome_message: string | null
          payload: Json
          source_id: string | null
          stage: string
          target_id: string | null
        }
        Insert: {
          created_at?: string
          external_key: string
          id?: string
          import_job_id?: string | null
          outcome?: string
          outcome_message?: string | null
          payload: Json
          source_id?: string | null
          stage: string
          target_id?: string | null
        }
        Update: {
          created_at?: string
          external_key?: string
          id?: string
          import_job_id?: string | null
          outcome?: string
          outcome_message?: string | null
          payload?: Json
          source_id?: string | null
          stage?: string
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "migration_stages_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_stages_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "migration_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      module_settings: {
        Row: {
          enabled: boolean
          key: string
          kind: string
          label: string
          parent_key: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          key: string
          kind: string
          label: string
          parent_key?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          key?: string
          kind?: string
          label?: string
          parent_key?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "module_settings_parent_key_fkey"
            columns: ["parent_key"]
            isOneToOne: false
            referencedRelation: "module_settings"
            referencedColumns: ["key"]
          },
        ]
      }
      new_hire_batches: {
        Row: {
          created_at: string
          employee_count: number
          file_hash: string | null
          file_path: string | null
          generated_at: string
          generated_by: string | null
          id: string
          period_end: string
          period_start: string
          submitted_at: string | null
        }
        Insert: {
          created_at?: string
          employee_count?: number
          file_hash?: string | null
          file_path?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          period_end: string
          period_start: string
          submitted_at?: string | null
        }
        Update: {
          created_at?: string
          employee_count?: number
          file_hash?: string | null
          file_path?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          period_end?: string
          period_start?: string
          submitted_at?: string | null
        }
        Relationships: []
      }
      new_hire_reports: {
        Row: {
          ack_received_at: string | null
          batch_id: string | null
          created_at: string
          employee_id: string
          hire_date: string
          id: string
          notes: string | null
          queued_at: string
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          ack_received_at?: string | null
          batch_id?: string | null
          created_at?: string
          employee_id: string
          hire_date: string
          id?: string
          notes?: string | null
          queued_at?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          ack_received_at?: string | null
          batch_id?: string | null
          created_at?: string
          employee_id?: string
          hire_date?: string
          id?: string
          notes?: string | null
          queued_at?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "new_hire_reports_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
      offers: {
        Row: {
          application_id: string
          created_at: string
          created_by: string
          decline_reason: string | null
          expires_at: string | null
          id: string
          letter_html: string | null
          letter_path: string | null
          pay_grade: string | null
          requisition_id: string
          salary: number | null
          sent_at: string | null
          signature_id: string | null
          signed_at: string | null
          start_date: string | null
          status: string
          updated_at: string
          worker_type_id: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by: string
          decline_reason?: string | null
          expires_at?: string | null
          id?: string
          letter_html?: string | null
          letter_path?: string | null
          pay_grade?: string | null
          requisition_id: string
          salary?: number | null
          sent_at?: string | null
          signature_id?: string | null
          signed_at?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          worker_type_id?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string
          decline_reason?: string | null
          expires_at?: string | null
          id?: string
          letter_html?: string | null
          letter_path?: string | null
          pay_grade?: string | null
          requisition_id?: string
          salary?: number | null
          sent_at?: string | null
          signature_id?: string | null
          signed_at?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          worker_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "job_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_signature_id_fkey"
            columns: ["signature_id"]
            isOneToOne: false
            referencedRelation: "signatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_worker_type_id_fkey"
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
          template_type: string
          updated_at: string
          worker_type_id: string | null
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
          worker_type_id?: string | null
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
          worker_type_id?: string | null
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
          employee_prompts: Json
          id: string
          is_active: boolean
          is_default: boolean
          manager_prompts: Json
          title: string
          updated_at: string
        }
        Insert: {
          agenda_prompts?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_prompts?: Json
          id?: string
          is_active?: boolean
          is_default?: boolean
          manager_prompts?: Json
          title: string
          updated_at?: string
        }
        Update: {
          agenda_prompts?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_prompts?: Json
          id?: string
          is_active?: boolean
          is_default?: boolean
          manager_prompts?: Json
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
          cadence_weeks: number | null
          created_at: string
          created_by: string | null
          employee_id: string | null
          id: string
          manager_user_id: string
          next_scheduled_at: string | null
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
          cadence_weeks?: number | null
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          id?: string
          manager_user_id: string
          next_scheduled_at?: string | null
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
          cadence_weeks?: number | null
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          id?: string
          manager_user_id?: string
          next_scheduled_at?: string | null
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
          ai_features: Json
          ai_model: string | null
          ai_provider: string
          careers_page_css: string | null
          careers_page_html: string | null
          cutover_mode: boolean
          ein: string | null
          fallback_admin_user_id: string | null
          fed_employer_id: string | null
          first_run_complete: boolean
          first_run_completed_at: string | null
          id: string
          interview_recording_archive_bucket: string | null
          interview_recording_archive_enabled: boolean
          interview_recording_archive_prefix: string | null
          logo_url: string | null
          notification_defaults: Json | null
          org_name: string
          payroll_bureau: string | null
          phone: string | null
          primary_color: string | null
          require_mfa: boolean
          retention_policy: Json | null
          review_competencies: Json
          singleton: boolean
          sso_metadata_url: string | null
          sso_only: boolean
          tmrs_employer_match_pct: number | null
          tmrs_member_rate_pct: number | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          ai_features?: Json
          ai_model?: string | null
          ai_provider?: string
          careers_page_css?: string | null
          careers_page_html?: string | null
          cutover_mode?: boolean
          ein?: string | null
          fallback_admin_user_id?: string | null
          fed_employer_id?: string | null
          first_run_complete?: boolean
          first_run_completed_at?: string | null
          id?: string
          interview_recording_archive_bucket?: string | null
          interview_recording_archive_enabled?: boolean
          interview_recording_archive_prefix?: string | null
          logo_url?: string | null
          notification_defaults?: Json | null
          org_name?: string
          payroll_bureau?: string | null
          phone?: string | null
          primary_color?: string | null
          require_mfa?: boolean
          retention_policy?: Json | null
          review_competencies?: Json
          singleton?: boolean
          sso_metadata_url?: string | null
          sso_only?: boolean
          tmrs_employer_match_pct?: number | null
          tmrs_member_rate_pct?: number | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          ai_features?: Json
          ai_model?: string | null
          ai_provider?: string
          careers_page_css?: string | null
          careers_page_html?: string | null
          cutover_mode?: boolean
          ein?: string | null
          fallback_admin_user_id?: string | null
          fed_employer_id?: string | null
          first_run_complete?: boolean
          first_run_completed_at?: string | null
          id?: string
          interview_recording_archive_bucket?: string | null
          interview_recording_archive_enabled?: boolean
          interview_recording_archive_prefix?: string | null
          logo_url?: string | null
          notification_defaults?: Json | null
          org_name?: string
          payroll_bureau?: string | null
          phone?: string | null
          primary_color?: string | null
          require_mfa?: boolean
          retention_policy?: Json | null
          review_competencies?: Json
          singleton?: boolean
          sso_metadata_url?: string | null
          sso_only?: boolean
          tmrs_employer_match_pct?: number | null
          tmrs_member_rate_pct?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      osha_incidents: {
        Row: {
          attachments: Json | null
          body_part_affected: string | null
          case_number: string
          classification: string | null
          created_at: string
          created_by: string | null
          date_recorded: string
          days_away: number | null
          days_restricted: number | null
          department: string | null
          description: string
          employee_id: string | null
          id: string
          incident_date: string
          injury_illness_type: string | null
          job_title_at_incident: string | null
          outcome: string | null
          physician_facility: string | null
          physician_name: string | null
          privacy_case: boolean
          recordable: boolean
          updated_at: string
          where_occurred: string | null
        }
        Insert: {
          attachments?: Json | null
          body_part_affected?: string | null
          case_number: string
          classification?: string | null
          created_at?: string
          created_by?: string | null
          date_recorded?: string
          days_away?: number | null
          days_restricted?: number | null
          department?: string | null
          description: string
          employee_id?: string | null
          id?: string
          incident_date: string
          injury_illness_type?: string | null
          job_title_at_incident?: string | null
          outcome?: string | null
          physician_facility?: string | null
          physician_name?: string | null
          privacy_case?: boolean
          recordable?: boolean
          updated_at?: string
          where_occurred?: string | null
        }
        Update: {
          attachments?: Json | null
          body_part_affected?: string | null
          case_number?: string
          classification?: string | null
          created_at?: string
          created_by?: string | null
          date_recorded?: string
          days_away?: number | null
          days_restricted?: number | null
          department?: string | null
          description?: string
          employee_id?: string | null
          id?: string
          incident_date?: string
          injury_illness_type?: string | null
          job_title_at_incident?: string | null
          outcome?: string | null
          physician_facility?: string | null
          physician_name?: string | null
          privacy_case?: boolean
          recordable?: boolean
          updated_at?: string
          where_occurred?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "osha_incidents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      paf_audit: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          notes: string | null
          paf_id: string
          payload: Json | null
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          notes?: string | null
          paf_id: string
          payload?: Json | null
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          paf_id?: string
          payload?: Json | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paf_audit_paf_id_fkey"
            columns: ["paf_id"]
            isOneToOne: false
            referencedRelation: "personnel_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      pattern_days: {
        Row: {
          day_index: number
          id: string
          is_off: boolean
          pattern_id: string
          shift_type_id: string | null
        }
        Insert: {
          day_index: number
          id?: string
          is_off?: boolean
          pattern_id: string
          shift_type_id?: string | null
        }
        Update: {
          day_index?: number
          id?: string
          is_off?: boolean
          pattern_id?: string
          shift_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pattern_days_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "schedule_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pattern_days_shift_type_id_fkey"
            columns: ["shift_type_id"]
            isOneToOne: false
            referencedRelation: "shift_types"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_calendars: {
        Row: {
          anchor_period_start: string
          check_date_offset_days: number
          created_at: string
          cutoff_offset_days: number
          frequency: string
          id: string
          is_active: boolean
          pay_group_id: string
          updated_at: string
        }
        Insert: {
          anchor_period_start: string
          check_date_offset_days?: number
          created_at?: string
          cutoff_offset_days?: number
          frequency: string
          id?: string
          is_active?: boolean
          pay_group_id: string
          updated_at?: string
        }
        Update: {
          anchor_period_start?: string
          check_date_offset_days?: number
          created_at?: string
          cutoff_offset_days?: number
          frequency?: string
          id?: string
          is_active?: boolean
          pay_group_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pay_calendars_pay_group_id_fkey"
            columns: ["pay_group_id"]
            isOneToOne: false
            referencedRelation: "pay_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_grades: {
        Row: {
          code: string
          created_at: string
          currency: string
          flsa_default: string | null
          id: string
          is_active: boolean
          max_annual: number
          mid_annual: number
          min_annual: number
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          flsa_default?: string | null
          id?: string
          is_active?: boolean
          max_annual: number
          mid_annual: number
          min_annual: number
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          flsa_default?: string | null
          id?: string
          is_active?: boolean
          max_annual?: number
          mid_annual?: number
          min_annual?: number
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pay_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      pay_periods: {
        Row: {
          check_date: string
          created_at: string
          id: string
          locked_at: string | null
          locked_by: string | null
          pay_group_id: string
          period_end: string
          period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          check_date: string
          created_at?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          pay_group_id: string
          period_end: string
          period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          check_date?: string
          created_at?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          pay_group_id?: string
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pay_periods_pay_group_id_fkey"
            columns: ["pay_group_id"]
            isOneToOne: false
            referencedRelation: "pay_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_export_profiles: {
        Row: {
          bureau: string
          column_map: Json
          created_at: string
          deduction_codes: Json
          earnings_codes: Json
          file_format: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          bureau: string
          column_map?: Json
          created_at?: string
          deduction_codes?: Json
          earnings_codes?: Json
          file_format: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          bureau?: string
          column_map?: Json
          created_at?: string
          deduction_codes?: Json
          earnings_codes?: Json
          file_format?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payroll_export_templates: {
        Row: {
          column_map: Json
          created_at: string
          deduction_codes: Json
          delimiter: string | null
          earnings_codes: Json
          format: string
          id: string
          include_header: boolean
          name: string
          notes: string | null
          vendor: string
        }
        Insert: {
          column_map?: Json
          created_at?: string
          deduction_codes?: Json
          delimiter?: string | null
          earnings_codes?: Json
          format: string
          id?: string
          include_header?: boolean
          name: string
          notes?: string | null
          vendor: string
        }
        Update: {
          column_map?: Json
          created_at?: string
          deduction_codes?: Json
          delimiter?: string | null
          earnings_codes?: Json
          format?: string
          id?: string
          include_header?: boolean
          name?: string
          notes?: string | null
          vendor?: string
        }
        Relationships: []
      }
      payroll_run_lines: {
        Row: {
          base_annual: number | null
          created_at: string
          employee_id: string
          fmla_hours: number
          gross_pay: number
          hourly_rate: number | null
          id: string
          one_time_items: Json
          overtime_hours: number
          pto_hours: number
          regular_hours: number
          run_id: string
          sick_hours: number
          warnings: string[]
        }
        Insert: {
          base_annual?: number | null
          created_at?: string
          employee_id: string
          fmla_hours?: number
          gross_pay?: number
          hourly_rate?: number | null
          id?: string
          one_time_items?: Json
          overtime_hours?: number
          pto_hours?: number
          regular_hours?: number
          run_id: string
          sick_hours?: number
          warnings?: string[]
        }
        Update: {
          base_annual?: number | null
          created_at?: string
          employee_id?: string
          fmla_hours?: number
          gross_pay?: number
          hourly_rate?: number | null
          id?: string
          one_time_items?: Json
          overtime_hours?: number
          pto_hours?: number
          regular_hours?: number
          run_id?: string
          sick_hours?: number
          warnings?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "payroll_run_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_run_lines_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          created_at: string
          file_hash: string | null
          file_path: string | null
          headcount: number
          id: string
          notes: string | null
          pay_period_id: string
          prepared_at: string | null
          prepared_by: string | null
          profile_id: string
          released_at: string | null
          run_kind: string
          signed_off_at: string | null
          signed_off_by: string | null
          status: string
          total_gross: number
          total_hours: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_hash?: string | null
          file_path?: string | null
          headcount?: number
          id?: string
          notes?: string | null
          pay_period_id: string
          prepared_at?: string | null
          prepared_by?: string | null
          profile_id: string
          released_at?: string | null
          run_kind?: string
          signed_off_at?: string | null
          signed_off_by?: string | null
          status?: string
          total_gross?: number
          total_hours?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_hash?: string | null
          file_path?: string | null
          headcount?: number
          id?: string
          notes?: string | null
          pay_period_id?: string
          prepared_at?: string | null
          prepared_by?: string | null
          profile_id?: string
          released_at?: string | null
          run_kind?: string
          signed_off_at?: string | null
          signed_off_by?: string | null
          status?: string
          total_gross?: number
          total_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_pay_period_id_fkey"
            columns: ["pay_period_id"]
            isOneToOne: false
            referencedRelation: "pay_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "payroll_export_profiles"
            referencedColumns: ["id"]
          },
        ]
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
      personnel_actions: {
        Row: {
          action_type: string
          after_values: Json
          applied_at: string | null
          applied_by: string | null
          approval_chain_id: string | null
          before_values: Json
          created_at: string
          effective_date: string
          employee_id: string
          id: string
          initiated_by: string
          narrative: string | null
          paf_number: string | null
          reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action_type: string
          after_values?: Json
          applied_at?: string | null
          applied_by?: string | null
          approval_chain_id?: string | null
          before_values?: Json
          created_at?: string
          effective_date: string
          employee_id: string
          id?: string
          initiated_by: string
          narrative?: string | null
          paf_number?: string | null
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          after_values?: Json
          applied_at?: string | null
          applied_by?: string | null
          approval_chain_id?: string | null
          before_values?: Json
          created_at?: string
          effective_date?: string
          employee_id?: string
          id?: string
          initiated_by?: string
          narrative?: string | null
          paf_number?: string | null
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personnel_actions_approval_chain_id_fkey"
            columns: ["approval_chain_id"]
            isOneToOne: false
            referencedRelation: "approval_chains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_actions_employee_id_fkey"
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
      policy_campaign_assignments: {
        Row: {
          acknowledgment_id: string | null
          campaign_id: string
          completed_at: string | null
          created_at: string
          employee_id: string
          id: string
          last_nudged_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          acknowledgment_id?: string | null
          campaign_id: string
          completed_at?: string | null
          created_at?: string
          employee_id: string
          id?: string
          last_nudged_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          acknowledgment_id?: string | null
          campaign_id?: string
          completed_at?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          last_nudged_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_campaign_assignments_acknowledgment_id_fkey"
            columns: ["acknowledgment_id"]
            isOneToOne: false
            referencedRelation: "policy_acknowledgments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_campaign_assignments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "policy_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_campaign_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_campaigns: {
        Row: {
          audience_filter: Json
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          name: string
          policy_id: string
          status: string
          updated_at: string
        }
        Insert: {
          audience_filter?: Json
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          name: string
          policy_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          audience_filter?: Json
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          name?: string
          policy_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_campaigns_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      position_budgets: {
        Row: {
          budgeted_amount: number | null
          budgeted_fte: number
          created_at: string
          created_by: string | null
          department: string
          fiscal_year: number
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          budgeted_amount?: number | null
          budgeted_fte?: number
          created_at?: string
          created_by?: string | null
          department: string
          fiscal_year: number
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          budgeted_amount?: number | null
          budgeted_fte?: number
          created_at?: string
          created_by?: string | null
          department?: string
          fiscal_year?: number
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
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
          pay_grade_id: string | null
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
          pay_grade_id?: string | null
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
          pay_grade_id?: string | null
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
            foreignKeyName: "positions_pay_grade_id_fkey"
            columns: ["pay_grade_id"]
            isOneToOne: false
            referencedRelation: "pay_grades"
            referencedColumns: ["id"]
          },
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
      provisioning_events: {
        Row: {
          action: string
          created_at: string
          direction: string
          employee_id: string | null
          error: string | null
          id: string
          payload: Json
          processed_at: string | null
          provider_id: string | null
          result: Json | null
          status: string
        }
        Insert: {
          action: string
          created_at?: string
          direction: string
          employee_id?: string | null
          error?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          provider_id?: string | null
          result?: Json | null
          status?: string
        }
        Update: {
          action?: string
          created_at?: string
          direction?: string
          employee_id?: string | null
          error?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          provider_id?: string | null
          result?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "provisioning_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provisioning_events_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "identity_providers"
            referencedColumns: ["id"]
          },
        ]
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
      report_snapshots: {
        Row: {
          artifact_url: string | null
          created_at: string
          data: Json
          generated_by: string | null
          id: string
          notes: string | null
          period_label: string
          report_kind: string
        }
        Insert: {
          artifact_url?: string | null
          created_at?: string
          data: Json
          generated_by?: string | null
          id?: string
          notes?: string | null
          period_label: string
          report_kind: string
        }
        Update: {
          artifact_url?: string | null
          created_at?: string
          data?: Json
          generated_by?: string | null
          id?: string
          notes?: string | null
          period_label?: string
          report_kind?: string
        }
        Relationships: []
      }
      review_cycle_participants: {
        Row: {
          created_at: string
          cycle_id: string
          employee_id: string
          id: string
          manager_id: string | null
          review_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cycle_id: string
          employee_id: string
          id?: string
          manager_id?: string | null
          review_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cycle_id?: string
          employee_id?: string
          id?: string
          manager_id?: string | null
          review_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_cycle_participants_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "review_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_cycle_participants_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_cycle_participants_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_cycle_participants_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "performance_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_cycles: {
        Row: {
          created_at: string
          created_by: string | null
          eligibility_filter: Json
          id: string
          kickoff_at: string | null
          manager_review_due: string | null
          name: string
          period_end: string
          period_start: string
          self_review_due: string | null
          signoff_due: string | null
          status: string
          template_key: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          eligibility_filter?: Json
          id?: string
          kickoff_at?: string | null
          manager_review_due?: string | null
          name: string
          period_end: string
          period_start: string
          self_review_due?: string | null
          signoff_due?: string | null
          status?: string
          template_key?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          eligibility_filter?: Json
          id?: string
          kickoff_at?: string | null
          manager_review_due?: string | null
          name?: string
          period_end?: string
          period_start?: string
          self_review_due?: string | null
          signoff_due?: string | null
          status?: string
          template_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      review_rating_changes: {
        Row: {
          changed_by: string | null
          created_at: string
          from_rating: number | null
          id: string
          reason: string | null
          review_id: string
          to_rating: number | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_rating?: number | null
          id?: string
          reason?: string | null
          review_id: string
          to_rating?: number | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_rating?: number | null
          id?: string
          reason?: string | null
          review_id?: string
          to_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "review_rating_changes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "performance_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_ratings: {
        Row: {
          comment: string | null
          competency: string
          created_at: string
          id: string
          rating: number | null
          review_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          competency: string
          created_at?: string
          id?: string
          rating?: number | null
          review_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          competency?: string
          created_at?: string
          id?: string
          rating?: number | null
          review_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_ratings_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "performance_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_patterns: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          cycle_length_days: number
          description: string | null
          id: string
          is_active: boolean
          is_preset: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          cycle_length_days: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_preset?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          cycle_length_days?: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_preset?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      scim_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string
          last_used_at: string | null
          provider_id: string
          revoked_at: string | null
          token_hash: string
          token_prefix: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label: string
          last_used_at?: string | null
          provider_id: string
          revoked_at?: string | null
          token_hash: string
          token_prefix: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string
          last_used_at?: string | null
          provider_id?: string
          revoked_at?: string | null
          token_hash?: string
          token_prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "scim_tokens_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "identity_providers"
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
      shift_segments: {
        Row: {
          created_at: string
          crosses_midnight: boolean
          end_time: string
          id: string
          paid: boolean
          segment_order: number
          shift_type_id: string
          start_time: string
          unpaid_meal_min: number
        }
        Insert: {
          created_at?: string
          crosses_midnight?: boolean
          end_time: string
          id?: string
          paid?: boolean
          segment_order?: number
          shift_type_id: string
          start_time: string
          unpaid_meal_min?: number
        }
        Update: {
          created_at?: string
          crosses_midnight?: boolean
          end_time?: string
          id?: string
          paid?: boolean
          segment_order?: number
          shift_type_id?: string
          start_time?: string
          unpaid_meal_min?: number
        }
        Relationships: [
          {
            foreignKeyName: "shift_segments_shift_type_id_fkey"
            columns: ["shift_type_id"]
            isOneToOne: false
            referencedRelation: "shift_types"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_types: {
        Row: {
          code: string | null
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_off: boolean
          name: string
          total_paid_hours: number
          updated_at: string
        }
        Insert: {
          code?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_off?: boolean
          name: string
          total_paid_hours?: number
          updated_at?: string
        }
        Update: {
          code?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_off?: boolean
          name?: string
          total_paid_hours?: number
          updated_at?: string
        }
        Relationships: []
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
      tcole_completions: {
        Row: {
          certificate_url: string | null
          completed_on: string
          course_title: string
          created_at: string
          employee_id: string
          hours: number
          id: string
          license_id: string | null
          recorded_by: string | null
          topic: string
        }
        Insert: {
          certificate_url?: string | null
          completed_on: string
          course_title: string
          created_at?: string
          employee_id: string
          hours: number
          id?: string
          license_id?: string | null
          recorded_by?: string | null
          topic: string
        }
        Update: {
          certificate_url?: string | null
          completed_on?: string
          course_title?: string
          created_at?: string
          employee_id?: string
          hours?: number
          id?: string
          license_id?: string | null
          recorded_by?: string | null
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "tcole_completions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tcole_completions_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "tcole_licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      tcole_licenses: {
        Row: {
          created_at: string
          cycle_end: string
          cycle_start: string
          employee_id: string
          id: string
          issued_on: string
          license_level: string
          license_number: string
          required_hours: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cycle_end: string
          cycle_start: string
          employee_id: string
          id?: string
          issued_on: string
          license_level: string
          license_number: string
          required_hours?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cycle_end?: string
          cycle_start?: string
          employee_id?: string
          id?: string
          issued_on?: string
          license_level?: string
          license_number?: string
          required_hours?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tcole_licenses_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
      time_breaks: {
        Row: {
          break_end: string | null
          break_start: string
          created_at: string
          id: string
          paid: boolean
          time_entry_id: string
        }
        Insert: {
          break_end?: string | null
          break_start?: string
          created_at?: string
          id?: string
          paid?: boolean
          time_entry_id: string
        }
        Update: {
          break_end?: string | null
          break_start?: string
          created_at?: string
          id?: string
          paid?: boolean
          time_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_breaks_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          clock_in: string
          clock_out: string | null
          created_at: string
          edited_by: string | null
          employee_id: string
          id: string
          notes: string | null
          pay_period_id: string | null
          source: string
          timesheet_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          edited_by?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          pay_period_id?: string | null
          source?: string
          timesheet_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          edited_by?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          pay_period_id?: string | null
          source?: string
          timesheet_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_pay_period_id_fkey"
            columns: ["pay_period_id"]
            isOneToOne: false
            referencedRelation: "pay_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      time_policies: {
        Row: {
          allow_comp_in_lieu: boolean
          comp_time_multiplier: number
          created_at: string
          daily_ot_threshold: number
          exempt_comp_multiplier: number
          id: string
          is_active: boolean
          max_comp_bank_hours: number | null
          name: string
          ot_multiplier: number
          rounding_minutes: number
          updated_at: string
          weekly_ot_threshold: number
          workweek_start: number
        }
        Insert: {
          allow_comp_in_lieu?: boolean
          comp_time_multiplier?: number
          created_at?: string
          daily_ot_threshold?: number
          exempt_comp_multiplier?: number
          id?: string
          is_active?: boolean
          max_comp_bank_hours?: number | null
          name?: string
          ot_multiplier?: number
          rounding_minutes?: number
          updated_at?: string
          weekly_ot_threshold?: number
          workweek_start?: number
        }
        Update: {
          allow_comp_in_lieu?: boolean
          comp_time_multiplier?: number
          created_at?: string
          daily_ot_threshold?: number
          exempt_comp_multiplier?: number
          id?: string
          is_active?: boolean
          max_comp_bank_hours?: number | null
          name?: string
          ot_multiplier?: number
          rounding_minutes?: number
          updated_at?: string
          weekly_ot_threshold?: number
          workweek_start?: number
        }
        Relationships: []
      }
      timesheets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          comp_time_earned: number
          created_at: string
          employee_id: string
          expected_hours: number
          holiday_hours: number
          id: string
          leave_hours: number
          notes: string | null
          overtime_hours: number
          regular_hours: number
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          week_end: string
          week_start: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          comp_time_earned?: number
          created_at?: string
          employee_id: string
          expected_hours?: number
          holiday_hours?: number
          id?: string
          leave_hours?: number
          notes?: string | null
          overtime_hours?: number
          regular_hours?: number
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          week_end: string
          week_start: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          comp_time_earned?: number
          created_at?: string
          employee_id?: string
          expected_hours?: number
          holiday_hours?: number
          id?: string
          leave_hours?: number
          notes?: string | null
          overtime_hours?: number
          regular_hours?: number
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      tmrs_enrollments: {
        Row: {
          created_at: string
          employee_id: string
          enrolled_on: string
          exited_on: string | null
          id: string
          member_id_external: string | null
          member_rate_pct: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          enrolled_on: string
          exited_on?: string | null
          id?: string
          member_id_external?: string | null
          member_rate_pct: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          enrolled_on?: string
          exited_on?: string | null
          id?: string
          member_id_external?: string | null
          member_rate_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tmrs_enrollments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      tmrs_file_lines: {
        Row: {
          created_at: string
          employee_id: string
          employer_contrib: number
          file_id: string
          gross: number
          id: string
          member_contrib: number
          record_type: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          employer_contrib?: number
          file_id: string
          gross?: number
          id?: string
          member_contrib?: number
          record_type?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          employer_contrib?: number
          file_id?: string
          gross?: number
          id?: string
          member_contrib?: number
          record_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tmrs_file_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tmrs_file_lines_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "tmrs_monthly_files"
            referencedColumns: ["id"]
          },
        ]
      }
      tmrs_monthly_files: {
        Row: {
          created_at: string
          employee_count: number
          file_hash: string | null
          file_path: string | null
          id: string
          notes: string | null
          period_month: number
          period_year: number
          prepared_at: string | null
          prepared_by: string | null
          signed_off_at: string | null
          signed_off_by: string | null
          status: string
          total_employer_contrib: number
          total_gross: number
          total_member_contrib: number
          updated_at: string
          variance_pct: number | null
        }
        Insert: {
          created_at?: string
          employee_count?: number
          file_hash?: string | null
          file_path?: string | null
          id?: string
          notes?: string | null
          period_month: number
          period_year: number
          prepared_at?: string | null
          prepared_by?: string | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          status?: string
          total_employer_contrib?: number
          total_gross?: number
          total_member_contrib?: number
          updated_at?: string
          variance_pct?: number | null
        }
        Update: {
          created_at?: string
          employee_count?: number
          file_hash?: string | null
          file_path?: string | null
          id?: string
          notes?: string | null
          period_month?: number
          period_year?: number
          prepared_at?: string | null
          prepared_by?: string | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          status?: string
          total_employer_contrib?: number
          total_gross?: number
          total_member_contrib?: number
          updated_at?: string
          variance_pct?: number | null
        }
        Relationships: []
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
          flsa_class: string
          icon: string | null
          id: string
          is_active: boolean
          is_peace_officer: boolean
          key: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_provisioning?: Json
          description?: string | null
          flsa_class?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          is_peace_officer?: boolean
          key: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_provisioning?: Json
          description?: string | null
          flsa_class?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          is_peace_officer?: boolean
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
      public_badge_verify: {
        Row: {
          display_name: string | null
          issued_at: string | null
          serial: string | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_timesheet: {
        Args: { _decision: string; _notes: string; _ts_id: string }
        Returns: undefined
      }
      check_position_budget: {
        Args: { _additional_fte: number; _department: string }
        Returns: Json
      }
      clock_in: { Args: { _note?: string }; Returns: string }
      clock_out: { Args: { _note?: string }; Returns: string }
      compute_timesheet: {
        Args: { _employee_id: string; _week_start: string }
        Returns: string
      }
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
      decide_paf_step: {
        Args: { _decision: string; _notes: string; _step_id: string }
        Returns: undefined
      }
      first_run_status: {
        Args: never
        Returns: {
          complete: boolean
          org_name: string
        }[]
      }
      hr_set_employee_status: {
        Args: {
          _employee_id: string
          _new_status: Database["public"]["Enums"]["employee_status"]
          _note?: string
        }
        Returns: undefined
      }
      is_iv_manager: { Args: { _uid: string }; Returns: boolean }
      is_panelist_for_interview: {
        Args: { _interview: string; _user: string }
        Returns: boolean
      }
      mark_my_training_started: {
        Args: { _training_id: string }
        Returns: undefined
      }
      purge_expired_interview_media: { Args: never; Returns: number }
      record_audit_event: {
        Args: {
          _action: string
          _diff?: Json
          _entity: string
          _entity_id: string
        }
        Returns: string
      }
      record_paf_audit: {
        Args: {
          _event_type: string
          _from_status?: string
          _paf_id: string
          _payload?: Json
          _to_status?: string
        }
        Returns: string
      }
      resolve_approver: {
        Args: { _manager_user_id?: string; _role: string }
        Returns: string
      }
      restore_demo_changes: { Args: never; Returns: Json }
      update_my_employee_contact: {
        Args: { _personal_email?: string; _phone?: string }
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
        | "department_admin"
      employee_status:
        | "candidate"
        | "preboarding"
        | "active"
        | "offboarded"
        | "on_leave"
      interview_dsr_kind: "export" | "delete"
      interview_dsr_status: "pending" | "processing" | "completed" | "rejected"
      interview_invitation_status:
        | "pending"
        | "in_progress"
        | "submitted"
        | "expired"
        | "revoked"
      interview_kit_kind: "one_way" | "live"
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
        "department_admin",
      ],
      employee_status: [
        "candidate",
        "preboarding",
        "active",
        "offboarded",
        "on_leave",
      ],
      interview_dsr_kind: ["export", "delete"],
      interview_dsr_status: ["pending", "processing", "completed", "rejected"],
      interview_invitation_status: [
        "pending",
        "in_progress",
        "submitted",
        "expired",
        "revoked",
      ],
      interview_kit_kind: ["one_way", "live"],
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
