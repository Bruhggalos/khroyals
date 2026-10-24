// Generated with Supabase CLI from all local migrations; see DEVELOPING.md.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      admin_roles: {
        Row: {
          created_at: string
          description: string
          id: string
          is_system: boolean
          name: string
          permissions: string[]
        }
        Insert: {
          created_at?: string
          description?: string
          id: string
          is_system?: boolean
          name: string
          permissions?: string[]
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_system?: boolean
          name?: string
          permissions?: string[]
        }
        Relationships: []
      }
      assignment_done: {
        Row: {
          assignment_id: string
          done_at: string
          student_id: string
        }
        Insert: {
          assignment_id: string
          done_at?: string
          student_id: string
        }
        Update: {
          assignment_id?: string
          done_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_done_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_done_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_rules: {
        Row: {
          assign_as: string
          grades: number[] | null
          group_id: string
          id: string
          include_guardians_as: string | null
          roster_ids: string[] | null
          school_roles: string[] | null
        }
        Insert: {
          assign_as: string
          grades?: number[] | null
          group_id: string
          id?: string
          include_guardians_as?: string | null
          roster_ids?: string[] | null
          school_roles?: string[] | null
        }
        Update: {
          assign_as?: string
          grades?: number[] | null
          group_id?: string
          id?: string
          include_guardians_as?: string | null
          roster_ids?: string[] | null
          school_roles?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_rules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          created_at: string
          details: string
          due_on: string | null
          id: string
          owner_id: string
          roster_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          details?: string
          due_on?: string | null
          id?: string
          owner_id: string
          roster_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          details?: string
          due_on?: string | null
          id?: string
          owner_id?: string
          roster_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_roster_id_fkey"
            columns: ["roster_id"]
            isOneToOne: false
            referencedRelation: "rosters"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          detail: Json | null
          group_id: string | null
          id: number
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          detail?: Json | null
          group_id?: string | null
          id?: never
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          detail?: Json | null
          group_id?: string | null
          id?: never
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      carline_pickups: {
        Row: {
          arrived_at: string
          day: string
          distance_m: number | null
          guardian_id: string | null
          id: string
          picked_up_at: string | null
          picked_up_by: string | null
          status: string
          student_id: string
          vehicle: Json | null
          via: string
        }
        Insert: {
          arrived_at?: string
          day?: string
          distance_m?: number | null
          guardian_id?: string | null
          id?: string
          picked_up_at?: string | null
          picked_up_by?: string | null
          status?: string
          student_id: string
          vehicle?: Json | null
          via?: string
        }
        Update: {
          arrived_at?: string
          day?: string
          distance_m?: number | null
          guardian_id?: string | null
          id?: string
          picked_up_at?: string | null
          picked_up_by?: string | null
          status?: string
          student_id?: string
          vehicle?: Json | null
          via?: string
        }
        Relationships: [
          {
            foreignKeyName: "carline_pickups_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carline_pickups_picked_up_by_fkey"
            columns: ["picked_up_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carline_pickups_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          is_answer: boolean
          parent_comment_id: string | null
          post_id: string
          score: number
          status: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_answer?: boolean
          parent_comment_id?: string | null
          post_id: string
          score?: number
          status?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_answer?: boolean
          parent_comment_id?: string | null
          post_id?: string
          score?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      critical_alert_responses: {
        Row: {
          alert_id: string
          note: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_id: string
          note?: string | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_id?: string
          note?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "critical_alert_responses_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "critical_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "critical_alert_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      critical_alerts: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          end_note: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          kind: string
          title: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          end_note?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          kind: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          end_note?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          kind?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "critical_alerts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "critical_alerts_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          all_day: boolean
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          end_time: string | null
          ends_on: string | null
          group_id: string | null
          id: string
          location: string | null
          start_time: string | null
          starts_on: string
          title: string
        }
        Insert: {
          all_day?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          ends_on?: string | null
          group_id?: string | null
          id?: string
          location?: string | null
          start_time?: string | null
          starts_on: string
          title: string
        }
        Update: {
          all_day?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          ends_on?: string | null
          group_id?: string | null
          id?: string
          location?: string | null
          start_time?: string | null
          starts_on?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      family_pickups: {
        Row: {
          created_at: string
          family_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          family_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          family_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_pickups_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_pickups_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          details: Json
          id: string
          kind: string
          requested_by: string
          status: string
          student_id: string | null
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          details: Json
          id?: string
          kind: string
          requested_by: string
          status?: string
          student_id?: string | null
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          details?: Json
          id?: string
          kind?: string
          requested_by?: string
          status?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          category: string
          color: string
          created_at: string
          created_by: string | null
          description: string
          icon: string
          id: string
          name: string
          parent_group_id: string | null
          settings: Json
          slug: string | null
          tags: string[]
        }
        Insert: {
          category?: string
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string
          icon?: string
          id?: string
          name: string
          parent_group_id?: string | null
          settings: Json
          slug?: string | null
          tags?: string[]
        }
        Update: {
          category?: string
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string
          icon?: string
          id?: string
          name?: string
          parent_group_id?: string | null
          settings?: Json
          slug?: string | null
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_parent_group_id_fkey"
            columns: ["parent_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      guardians: {
        Row: {
          guardian_id: string
          relation: string | null
          student_id: string
        }
        Insert: {
          guardian_id: string
          relation?: string | null
          student_id: string
        }
        Update: {
          guardian_id?: string
          relation?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardians_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_listings: {
        Row: {
          buyer_id: string | null
          condition: string
          created_at: string
          description: string
          id: string
          photo_path: string | null
          price_cents: number
          quantity: number
          sale_cents: number | null
          seller_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          buyer_id?: string | null
          condition: string
          created_at?: string
          description?: string
          id?: string
          photo_path?: string | null
          price_cents: number
          quantity?: number
          sale_cents?: number | null
          seller_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          buyer_id?: string | null
          condition?: string
          created_at?: string
          description?: string
          id?: string
          photo_path?: string | null
          price_cents?: number
          quantity?: number
          sale_cents?: number | null
          seller_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_listings_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_responses: {
        Row: {
          agreed_cents: number | null
          buyer_id: string
          counter_cents: number | null
          created_at: string
          id: string
          kind: string
          listing_id: string
          message: string | null
          offer_cents: number | null
          status: string
          updated_at: string
        }
        Insert: {
          agreed_cents?: number | null
          buyer_id: string
          counter_cents?: number | null
          created_at?: string
          id?: string
          kind: string
          listing_id: string
          message?: string | null
          offer_cents?: number | null
          status: string
          updated_at?: string
        }
        Update: {
          agreed_cents?: number | null
          buyer_id?: string
          counter_cents?: number | null
          created_at?: string
          id?: string
          kind?: string
          listing_id?: string
          message?: string | null
          offer_cents?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_responses_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_responses_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "market_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      market_terms_acceptances: {
        Row: {
          accepted_at: string
          user_id: string
          version: number
        }
        Insert: {
          accepted_at?: string
          user_id: string
          version: number
        }
        Update: {
          accepted_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_terms_acceptances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          can_post: boolean
          group_id: string
          joined_at: string
          muted_until: string | null
          notification: string | null
          role: string
          rule_id: string | null
          source: string
          user_id: string
        }
        Insert: {
          can_post?: boolean
          group_id: string
          joined_at?: string
          muted_until?: string | null
          notification?: string | null
          role: string
          rule_id?: string | null
          source?: string
          user_id: string
        }
        Update: {
          can_post?: boolean
          group_id?: string
          joined_at?: string
          muted_until?: string | null
          notification?: string | null
          role?: string
          rule_id?: string | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "assignment_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_dismissals: {
        Row: {
          dismissed_at: string
          notification_id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          notification_id: string
          user_id: string
        }
        Update: {
          dismissed_at?: string
          notification_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_dismissals_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_dismissals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_opens: {
        Row: {
          notification_id: string
          opened_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          opened_at?: string
          user_id: string
        }
        Update: {
          notification_id?: string
          opened_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_opens_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_opens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          audience: string
          body: string
          created_at: string
          created_by: string | null
          data: Json
          error: string | null
          group_id: string | null
          id: string
          post_id: string | null
          push_attempts: number
          push_claim_id: string | null
          push_claim_until: string | null
          push_delivery_error: string | null
          push_remaining: string[] | null
          push_retry_after: string
          roles: string[] | null
          sent_count: number
          status: string
          title: string
          urgent: boolean
          user_id: string | null
        }
        Insert: {
          audience: string
          body: string
          created_at?: string
          created_by?: string | null
          data?: Json
          error?: string | null
          group_id?: string | null
          id?: string
          post_id?: string | null
          push_attempts?: number
          push_claim_id?: string | null
          push_claim_until?: string | null
          push_delivery_error?: string | null
          push_remaining?: string[] | null
          push_retry_after?: string
          roles?: string[] | null
          sent_count?: number
          status?: string
          title: string
          urgent?: boolean
          user_id?: string | null
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          error?: string | null
          group_id?: string | null
          id?: string
          post_id?: string | null
          push_attempts?: number
          push_claim_id?: string | null
          push_claim_until?: string | null
          push_delivery_error?: string | null
          push_remaining?: string[] | null
          push_retry_after?: string
          roles?: string[] | null
          sent_count?: number
          status?: string
          title?: string
          urgent?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_authorizations: {
        Row: {
          created_at: string
          ends_on: string | null
          granted_by: string | null
          id: string
          person_id: string
          relationship: string
          starts_on: string
          student_id: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          granted_by?: string | null
          id?: string
          person_id: string
          relationship: string
          starts_on?: string
          student_id: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          granted_by?: string | null
          id?: string
          person_id?: string
          relationship?: string
          starts_on?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_authorizations_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_authorizations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_authorizations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_numbers: {
        Row: {
          number: string
          student_id: string
          updated_at: string
        }
        Insert: {
          number: string
          student_id: string
          updated_at?: string
        }
        Update: {
          number?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_numbers_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_options: {
        Row: {
          id: string
          label: string
          position: number
          post_id: string
        }
        Insert: {
          id?: string
          label: string
          position?: number
          post_id: string
        }
        Update: {
          id?: string
          label?: string
          position?: number
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          option_id: string
          post_id: string
          user_id: string
        }
        Insert: {
          option_id: string
          post_id: string
          user_id: string
        }
        Update: {
          option_id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_follows: {
        Row: {
          following: boolean
          post_id: string
          user_id: string
        }
        Insert: {
          following?: boolean
          post_id: string
          user_id: string
        }
        Update: {
          following?: boolean
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_follows_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_views: {
        Row: {
          first_seen_at: string
          last_seen_at: string
          post_id: string
          times: number
          user_id: string
        }
        Insert: {
          first_seen_at?: string
          last_seen_at?: string
          post_id: string
          times?: number
          user_id: string
        }
        Update: {
          first_seen_at?: string
          last_seen_at?: string
          post_id?: string
          times?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_votes: {
        Row: {
          post_id: string
          user_id: string
          value: number
        }
        Insert: {
          post_id: string
          user_id: string
          value: number
        }
        Update: {
          post_id?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          attachments: Json
          author_id: string | null
          body: string
          comments_locked: boolean
          created_at: string
          edited_at: string | null
          group_id: string
          id: string
          kind: string
          pinned: boolean
          score: number
          status: string
          title: string | null
        }
        Insert: {
          attachments?: Json
          author_id?: string | null
          body?: string
          comments_locked?: boolean
          created_at?: string
          edited_at?: string | null
          group_id: string
          id?: string
          kind: string
          pinned?: boolean
          score?: number
          status?: string
          title?: string | null
        }
        Update: {
          attachments?: Json
          author_id?: string | null
          body?: string
          comments_locked?: boolean
          created_at?: string
          edited_at?: string | null
          group_id?: string
          id?: string
          kind?: string
          pinned?: boolean
          score?: number
          status?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_private: {
        Row: {
          email: string | null
          id: string
        }
        Insert: {
          email?: string | null
          id: string
        }
        Update: {
          email?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_private_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          admin_tier: string | null
          avatar_url: string | null
          carline_duty: boolean
          class_of: number | null
          created_at: string
          first_name: string
          grade: number | null
          id: string
          last_name: string
          managed: boolean
          permissions: string[]
          school_role: string | null
          volunteer_lead: boolean
        }
        Insert: {
          admin_tier?: string | null
          avatar_url?: string | null
          carline_duty?: boolean
          class_of?: number | null
          created_at?: string
          first_name?: string
          grade?: number | null
          id?: string
          last_name?: string
          managed?: boolean
          permissions?: string[]
          school_role?: string | null
          volunteer_lead?: boolean
        }
        Update: {
          admin_tier?: string | null
          avatar_url?: string | null
          carline_duty?: boolean
          class_of?: number | null
          created_at?: string
          first_name?: string
          grade?: number | null
          id?: string
          last_name?: string
          managed?: boolean
          permissions?: string[]
          school_role?: string | null
          volunteer_lead?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profiles_admin_tier_fkey"
            columns: ["admin_tier"]
            isOneToOne: false
            referencedRelation: "admin_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          platform: string | null
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          platform?: string | null
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          platform?: string | null
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reactions: {
        Row: {
          emoji: string
          post_id: string
          user_id: string
        }
        Insert: {
          emoji: string
          post_id: string
          user_id: string
        }
        Update: {
          emoji?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_members: {
        Row: {
          profile_id: string
          roster_id: string
        }
        Insert: {
          profile_id: string
          roster_id: string
        }
        Update: {
          profile_id?: string
          roster_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_members_roster_id_fkey"
            columns: ["roster_id"]
            isOneToOne: false
            referencedRelation: "rosters"
            referencedColumns: ["id"]
          },
        ]
      }
      rosters: {
        Row: {
          id: string
          kind: string
          lead_id: string | null
          name: string
        }
        Insert: {
          id: string
          kind: string
          lead_id?: string | null
          name: string
        }
        Update: {
          id?: string
          kind?: string
          lead_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "rosters_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      school_question_messages: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          from_school: boolean
          id: string
          question_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          from_school: boolean
          id?: string
          question_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          from_school?: boolean
          id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_question_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_question_messages_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "school_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      school_questions: {
        Row: {
          answered_at: string | null
          asker_id: string
          assigned_at: string | null
          assigned_by: string | null
          assignee_id: string | null
          created_at: string
          id: string
          status: string
          subject: string
          topic: string
          updated_at: string
          waiting_since: string | null
        }
        Insert: {
          answered_at?: string | null
          asker_id: string
          assigned_at?: string | null
          assigned_by?: string | null
          assignee_id?: string | null
          created_at?: string
          id?: string
          status?: string
          subject: string
          topic?: string
          updated_at?: string
          waiting_since?: string | null
        }
        Update: {
          answered_at?: string | null
          asker_id?: string
          assigned_at?: string | null
          assigned_by?: string | null
          assignee_id?: string | null
          created_at?: string
          id?: string
          status?: string
          subject?: string
          topic?: string
          updated_at?: string
          waiting_since?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_questions_asker_id_fkey"
            columns: ["asker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_questions_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_questions_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_coaches: {
        Row: {
          sport_id: string
          user_id: string
        }
        Insert: {
          sport_id: string
          user_id: string
        }
        Update: {
          sport_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sport_coaches_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sport_coaches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_event_rsvps: {
        Row: {
          answered_by: string | null
          event_id: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          answered_by?: string | null
          event_id: string
          status: string
          student_id: string
          updated_at?: string
        }
        Update: {
          answered_by?: string | null
          event_id?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sport_event_rsvps_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sport_event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "sport_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sport_event_rsvps_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_events: {
        Row: {
          address: string | null
          cancelled: boolean
          created_at: string
          created_by: string | null
          ends_at: string | null
          home: boolean | null
          id: string
          kind: string
          location: string | null
          notes: string
          season_id: string
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          cancelled?: boolean
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          home?: boolean | null
          id?: string
          kind?: string
          location?: string | null
          notes?: string
          season_id: string
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          cancelled?: boolean
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          home?: boolean | null
          id?: string
          kind?: string
          location?: string | null
          notes?: string
          season_id?: string
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sport_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sport_events_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "sport_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_follows: {
        Row: {
          created_at: string
          sport_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          sport_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          sport_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sport_follows_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sport_follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_registrations: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string
          id: string
          note: string
          requested_by: string | null
          season_id: string
          status: string
          student_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string
          id?: string
          note?: string
          requested_by?: string | null
          season_id: string
          status?: string
          student_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string
          id?: string
          note?: string
          requested_by?: string | null
          season_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sport_registrations_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sport_registrations_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sport_registrations_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "sport_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sport_registrations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_seasons: {
        Row: {
          created_at: string
          details: string
          ends_on: string
          id: string
          info_url: string | null
          max_grade: number | null
          min_grade: number | null
          name: string
          signup_announced_at: string | null
          signup_closes: string | null
          signup_opens: string | null
          sport_id: string
          starts_on: string
        }
        Insert: {
          created_at?: string
          details?: string
          ends_on: string
          id?: string
          info_url?: string | null
          max_grade?: number | null
          min_grade?: number | null
          name: string
          signup_announced_at?: string | null
          signup_closes?: string | null
          signup_opens?: string | null
          sport_id: string
          starts_on: string
        }
        Update: {
          created_at?: string
          details?: string
          ends_on?: string
          id?: string
          info_url?: string | null
          max_grade?: number | null
          min_grade?: number | null
          name?: string
          signup_announced_at?: string | null
          signup_closes?: string | null
          signup_opens?: string | null
          sport_id?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "sport_seasons_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      sports: {
        Row: {
          category: string
          created_at: string
          description: string
          icon: string
          id: string
          name: string
          photo_path: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          name: string
          photo_path?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          name?: string
          photo_path?: string | null
        }
        Relationships: []
      }
      student_details: {
        Row: {
          allergies: string
          bio: string
          birthday: string | null
          medical_notes: string
          student_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allergies?: string
          bio?: string
          birthday?: string | null
          medical_notes?: string
          student_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allergies?: string
          bio?: string
          birthday?: string | null
          medical_notes?: string
          student_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_details_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_details_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_messages: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          thread_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          thread_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "teacher_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          student_id: string
          student_read_at: string | null
          teacher_id: string
          teacher_read_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          student_id: string
          student_read_at?: string | null
          teacher_id: string
          teacher_read_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          student_id?: string
          student_read_at?: string | null
          teacher_id?: string
          teacher_read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_threads_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_threads_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          push_groups: boolean
          push_marketplace: boolean
          push_replies: boolean
          push_school: boolean
          push_volunteer: boolean
          quiet_end: string | null
          quiet_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          push_groups?: boolean
          push_marketplace?: boolean
          push_replies?: boolean
          push_school?: boolean
          push_volunteer?: boolean
          quiet_end?: string | null
          quiet_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          push_groups?: boolean
          push_marketplace?: boolean
          push_replies?: boolean
          push_school?: boolean
          push_volunteer?: boolean
          quiet_end?: string | null
          quiet_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          color: string
          created_at: string
          id: string
          kind: string
          last_used_at: string | null
          make: string
          owner_id: string
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          kind: string
          last_used_at?: string | null
          make: string
          owner_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          kind?: string
          last_used_at?: string | null
          make?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteer_messages: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          opportunity_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          opportunity_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          opportunity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "volunteer_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_messages_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "volunteer_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteer_opportunities: {
        Row: {
          created_at: string
          delete_reason: string | null
          description: string
          end_time: string | null
          ends_on: string | null
          id: string
          item: string | null
          kind: string
          lead_id: string
          location: string | null
          quantity: number | null
          spots: number | null
          start_time: string | null
          starts_on: string
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          delete_reason?: string | null
          description?: string
          end_time?: string | null
          ends_on?: string | null
          id?: string
          item?: string | null
          kind?: string
          lead_id: string
          location?: string | null
          quantity?: number | null
          spots?: number | null
          start_time?: string | null
          starts_on: string
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          delete_reason?: string | null
          description?: string
          end_time?: string | null
          ends_on?: string | null
          id?: string
          item?: string | null
          kind?: string
          lead_id?: string
          location?: string | null
          quantity?: number | null
          spots?: number | null
          start_time?: string | null
          starts_on?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "volunteer_opportunities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteer_signups: {
        Row: {
          created_at: string
          opportunity_id: string
          quantity: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          opportunity_id: string
          quantity?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          opportunity_id?: string
          quantity?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "volunteer_signups_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "volunteer_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_signups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_comment: {
        Args: { p_body: string; p_parent?: string; p_post: string }
        Returns: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          is_answer: boolean
          parent_comment_id: string | null
          post_id: string
          score: number
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_pickup_person: {
        Args: {
          p_email: string
          p_ends?: string
          p_relationship: string
          p_starts?: string
          p_student: string
        }
        Returns: Json
      }
      admin_clear_avatar: { Args: { p_user: string }; Returns: undefined }
      admin_create_student: {
        Args: {
          p_birthday?: string
          p_first: string
          p_force?: boolean
          p_grade: number
          p_guardian?: string
          p_last: string
          p_relation?: string
        }
        Returns: string
      }
      admin_decide_family_request: {
        Args: {
          p_approve: boolean
          p_existing?: string
          p_force?: boolean
          p_note?: string
          p_request: string
        }
        Returns: string
      }
      admin_delete_role: { Args: { p_id: string }; Returns: undefined }
      admin_delete_roster: { Args: { p_roster: string }; Returns: undefined }
      admin_delete_student: { Args: { p_student: string }; Returns: undefined }
      admin_family_requests: { Args: never; Returns: Json }
      admin_link_guardian: {
        Args: {
          p_guardian: string
          p_link?: boolean
          p_relation?: string
          p_student: string
        }
        Returns: undefined
      }
      admin_list_people: {
        Args: {
          p_filter?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: {
          admin_tier: string
          carline_duty: boolean
          created_at: string
          email: string
          first_name: string
          grade: number
          id: string
          last_name: string
          permissions: string[]
          school_role: string
          total: number
          volunteer_lead: boolean
        }[]
      }
      admin_list_sections: {
        Args: never
        Returns: {
          id: string
          lead_id: string
          lead_name: string
          name: string
          students: number
        }[]
      }
      admin_list_students: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          class_of: number
          first_name: string
          grade: number
          grade_label: string
          id: string
          last_name: string
          managed: boolean
          parents: Json
          photo_path: string
          total: number
        }[]
      }
      admin_roster_member: {
        Args: { p_add?: boolean; p_roster: string; p_user: string }
        Returns: undefined
      }
      admin_save_role: {
        Args: {
          p_description: string
          p_id: string
          p_name: string
          p_permissions: string[]
        }
        Returns: {
          created_at: string
          description: string
          id: string
          is_system: boolean
          name: string
          permissions: string[]
        }
        SetofOptions: {
          from: "*"
          to: "admin_roles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_section_students: {
        Args: { p_roster: string }
        Returns: {
          first_name: string
          grade: number
          has_login: boolean
          id: string
          last_name: string
        }[]
      }
      admin_set_access: {
        Args: { p_permissions?: string[]; p_tier: string; p_user: string }
        Returns: undefined
      }
      admin_set_carline_duty: {
        Args: { p_on: boolean; p_user: string }
        Returns: undefined
      }
      admin_set_director: {
        Args: { p_director: boolean; p_user: string }
        Returns: undefined
      }
      admin_set_parent_relation: {
        Args: { p_guardian: string; p_relation: string; p_student: string }
        Returns: undefined
      }
      admin_set_roster: {
        Args: {
          p_kind: string
          p_lead?: string
          p_name: string
          p_roster: string
        }
        Returns: undefined
      }
      admin_set_volunteer_lead: {
        Args: { p_on: boolean; p_user: string }
        Returns: undefined
      }
      admin_similar_students: {
        Args: {
          p_birthday?: string
          p_first: string
          p_grade?: number
          p_last: string
        }
        Returns: Json
      }
      admin_update_profile: {
        Args: {
          p_first?: string
          p_grade?: number
          p_last?: string
          p_role: string
          p_user: string
        }
        Returns: undefined
      }
      admin_update_student: {
        Args: {
          p_first: string
          p_grade: number
          p_last: string
          p_student: string
        }
        Returns: undefined
      }
      anonymous_author: { Args: { p_post: string }; Returns: string }
      ask_school: {
        Args: { p_body: string; p_subject: string; p_topic: string }
        Returns: {
          answered_at: string | null
          asker_id: string
          assigned_at: string | null
          assigned_by: string | null
          assignee_id: string | null
          created_at: string
          id: string
          status: string
          subject: string
          topic: string
          updated_at: string
          waiting_since: string | null
        }
        SetofOptions: {
          from: "*"
          to: "school_questions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assignment_add: {
        Args: {
          p_details?: string
          p_due_on?: string
          p_roster?: string
          p_title: string
        }
        Returns: {
          created_at: string
          details: string
          due_on: string | null
          id: string
          owner_id: string
          roster_id: string | null
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assignment_check: {
        Args: { p_assignment: string; p_done: boolean }
        Returns: undefined
      }
      assignment_delete: { Args: { p_assignment: string }; Returns: undefined }
      cancel_family_request: { Args: { p_request: string }; Returns: undefined }
      car_carline_check_in: {
        Args: {
          p_accuracy?: number
          p_lat: number
          p_lng: number
          p_token: string
        }
        Returns: Json
      }
      car_carline_status: { Args: { p_token: string }; Returns: Json }
      carline_announce: {
        Args: {
          p_accuracy?: number
          p_lat: number
          p_lng: number
          p_students: string[]
          p_vehicle?: string
        }
        Returns: {
          arrived_at: string
          day: string
          distance_m: number | null
          guardian_id: string | null
          id: string
          picked_up_at: string | null
          picked_up_by: string | null
          status: string
          student_id: string
          vehicle: Json | null
          via: string
        }[]
        SetofOptions: {
          from: "*"
          to: "carline_pickups"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      carline_arrived: {
        Args: { p_accuracy?: number; p_lat: number; p_lng: number }
        Returns: Json
      }
      carline_board: { Args: never; Returns: Json }
      carline_cancel: { Args: { p_pickup: string }; Returns: undefined }
      carline_check_in: {
        Args: { p_students?: string[] }
        Returns: {
          arrived_at: string
          day: string
          distance_m: number | null
          guardian_id: string | null
          id: string
          picked_up_at: string | null
          picked_up_by: string | null
          status: string
          student_id: string
          vehicle: Json | null
          via: string
        }[]
        SetofOptions: {
          from: "*"
          to: "carline_pickups"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      carline_config: { Args: never; Returns: Json }
      carline_confirm: {
        Args: { p_pickup: string }
        Returns: {
          arrived_at: string
          day: string
          distance_m: number | null
          guardian_id: string | null
          id: string
          picked_up_at: string | null
          picked_up_by: string | null
          status: string
          student_id: string
          vehicle: Json | null
          via: string
        }
        SetofOptions: {
          from: "*"
          to: "carline_pickups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      carline_open_now: { Args: { p_open: boolean }; Returns: Json }
      carline_reopen: {
        Args: { p_pickup: string }
        Returns: {
          arrived_at: string
          day: string
          distance_m: number | null
          guardian_id: string | null
          id: string
          picked_up_at: string | null
          picked_up_by: string | null
          status: string
          student_id: string
          vehicle: Json | null
          via: string
        }
        SetofOptions: {
          from: "*"
          to: "carline_pickups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      carline_set_config: {
        Args: {
          p_end: string
          p_lat: number
          p_lng: number
          p_radius: number
          p_start: string
        }
        Returns: Json
      }
      carline_today: {
        Args: never
        Returns: {
          arrived_at: string
          day: string
          distance_m: number | null
          guardian_id: string | null
          id: string
          picked_up_at: string | null
          picked_up_by: string | null
          status: string
          student_id: string
          vehicle: Json | null
          via: string
        }[]
        SetofOptions: {
          from: "*"
          to: "carline_pickups"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      child_pickup_people: { Args: { p_student: string }; Returns: Json }
      clear_my_notifications: { Args: never; Returns: number }
      create_car_pass: { Args: never; Returns: string }
      create_group: {
        Args: {
          p_category: string
          p_color: string
          p_description: string
          p_icon: string
          p_name: string
          p_parent?: string
          p_rules?: Json
          p_settings: Json
        }
        Returns: {
          category: string
          color: string
          created_at: string
          created_by: string | null
          description: string
          icon: string
          id: string
          name: string
          parent_group_id: string | null
          settings: Json
          slug: string | null
          tags: string[]
        }
        SetofOptions: {
          from: "*"
          to: "groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_post: {
        Args: {
          p_anonymous?: boolean
          p_attachments?: Json
          p_body: string
          p_group: string
          p_kind: string
          p_poll_options?: string[]
          p_title?: string
        }
        Returns: {
          attachments: Json
          author_id: string | null
          body: string
          comments_locked: boolean
          created_at: string
          edited_at: string | null
          group_id: string
          id: string
          kind: string
          pinned: boolean
          score: number
          status: string
          title: string | null
        }
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      critical_alert_end: {
        Args: { p_alert: string; p_note?: string }
        Returns: {
          body: string
          created_at: string
          created_by: string | null
          end_note: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          kind: string
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "critical_alerts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      critical_alert_respond: {
        Args: { p_alert: string; p_note?: string; p_status: string }
        Returns: {
          alert_id: string
          note: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "critical_alert_responses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      critical_alert_send: {
        Args: { p_body?: string; p_kind: string; p_title: string }
        Returns: {
          body: string
          created_at: string
          created_by: string | null
          end_note: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          kind: string
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "critical_alerts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      critical_alert_status: { Args: { p_alert: string }; Returns: Json }
      dismiss_notifications: { Args: { p_ids: string[] }; Returns: undefined }
      email_claim: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          id: string
          sender: string
          subject: string
          to_email: string
        }[]
      }
      email_done: {
        Args: { p_error?: string; p_id: string }
        Returns: undefined
      }
      group_abilities: { Args: { p_group: string }; Returns: Json }
      group_post_stats: {
        Args: { p_group: string; p_limit?: number }
        Returns: {
          audience: number
          author: string
          created_at: string
          kind: string
          post_id: string
          reactions: number
          replies: number
          title: string
          viewers: number
        }[]
      }
      join_group: { Args: { p_group: string }; Returns: undefined }
      leave_group: { Args: { p_group: string }; Returns: undefined }
      mark_notifications_opened: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      market_accept_terms: { Args: { p_version: number }; Returns: undefined }
      market_answer_counter: {
        Args: { p_accept: boolean; p_response: string }
        Returns: {
          agreed_cents: number | null
          buyer_id: string
          counter_cents: number | null
          created_at: string
          id: string
          kind: string
          listing_id: string
          message: string | null
          offer_cents: number | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "market_responses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      market_answer_offer: {
        Args: {
          p_accept: boolean
          p_counter_cents?: number
          p_response: string
        }
        Returns: {
          agreed_cents: number | null
          buyer_id: string
          counter_cents: number | null
          created_at: string
          id: string
          kind: string
          listing_id: string
          message: string | null
          offer_cents: number | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "market_responses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      market_cancel_sale: { Args: { p_listing: string }; Returns: undefined }
      market_complete: { Args: { p_listing: string }; Returns: undefined }
      market_dibs: {
        Args: { p_listing: string }
        Returns: {
          agreed_cents: number | null
          buyer_id: string
          counter_cents: number | null
          created_at: string
          id: string
          kind: string
          listing_id: string
          message: string | null
          offer_cents: number | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "market_responses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      market_offer: {
        Args: { p_cents: number; p_listing: string; p_message?: string }
        Returns: {
          agreed_cents: number | null
          buyer_id: string
          counter_cents: number | null
          created_at: string
          id: string
          kind: string
          listing_id: string
          message: string | null
          offer_cents: number | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "market_responses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      market_post: {
        Args: {
          p_condition: string
          p_description: string
          p_photo_path?: string
          p_price_cents: number
          p_quantity: number
          p_title: string
        }
        Returns: {
          buyer_id: string | null
          condition: string
          created_at: string
          description: string
          id: string
          photo_path: string | null
          price_cents: number
          quantity: number
          sale_cents: number | null
          seller_id: string
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "market_listings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      market_remove: {
        Args: { p_listing: string; p_reason?: string }
        Returns: undefined
      }
      market_select: {
        Args: { p_response: string }
        Returns: {
          buyer_id: string | null
          condition: string
          created_at: string
          description: string
          id: string
          photo_path: string | null
          price_cents: number
          quantity: number
          sale_cents: number | null
          seller_id: string
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "market_listings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      market_terms: { Args: never; Returns: Json }
      market_withdraw: { Args: { p_response: string }; Returns: undefined }
      moderate_post: {
        Args: { p_action: string; p_post: string }
        Returns: {
          attachments: Json
          author_id: string | null
          body: string
          comments_locked: boolean
          created_at: string
          edited_at: string | null
          group_id: string
          id: string
          kind: string
          pinned: boolean
          score: number
          status: string
          title: string | null
        }
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_access: { Args: never; Returns: Json }
      my_children: { Args: never; Returns: Json }
      my_class_students: {
        Args: never
        Returns: {
          classes: string
          grade: number
          student_id: string
          student_name: string
        }[]
      }
      my_groups: {
        Args: never
        Returns: {
          category: string
          color: string
          created_at: string
          created_by: string | null
          description: string
          icon: string
          id: string
          name: string
          parent_group_id: string | null
          settings: Json
          slug: string | null
          tags: string[]
        }[]
        SetofOptions: {
          from: "*"
          to: "groups"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_notifications: {
        Args: { p_limit?: number }
        Returns: {
          audience: string
          body: string
          created_at: string
          created_by: string | null
          data: Json
          error: string | null
          group_id: string | null
          id: string
          post_id: string | null
          push_attempts: number
          push_claim_id: string | null
          push_claim_until: string | null
          push_delivery_error: string | null
          push_remaining: string[] | null
          push_retry_after: string
          roles: string[] | null
          sent_count: number
          status: string
          title: string
          urgent: boolean
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_pickup_children: { Args: never; Returns: string[] }
      my_sections: {
        Args: never
        Returns: {
          id: string
          name: string
          students: number
        }[]
      }
      my_sport_schedule: {
        Args: { p_days?: number }
        Returns: {
          address: string | null
          cancelled: boolean
          created_at: string
          created_by: string | null
          ends_at: string | null
          home: boolean | null
          id: string
          kind: string
          location: string | null
          notes: string
          season_id: string
          starts_at: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "sport_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_sports: {
        Args: never
        Returns: {
          following: boolean
          registered: boolean
          sport_id: string
        }[]
      }
      my_teachers: {
        Args: never
        Returns: {
          classes: string
          last_body: string
          last_message_at: string
          teacher_id: string
          teacher_name: string
          thread_id: string
          unread: boolean
        }[]
      }
      notification_open_counts: {
        Args: { p_ids: string[] }
        Returns: {
          id: string
          opened: number
        }[]
      }
      permission_catalog: {
        Args: never
        Returns: {
          description: string
          key: string
          label: string
        }[]
      }
      post_stats: { Args: { p_post: string }; Returns: Json }
      push_claim: {
        Args: never
        Returns: {
          audience: string
          body: string
          created_at: string
          created_by: string | null
          data: Json
          error: string | null
          group_id: string | null
          id: string
          post_id: string | null
          push_attempts: number
          push_claim_id: string | null
          push_claim_until: string | null
          push_delivery_error: string | null
          push_remaining: string[] | null
          push_retry_after: string
          roles: string[] | null
          sent_count: number
          status: string
          title: string
          urgent: boolean
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      push_progress: {
        Args: {
          p_claim: string
          p_error?: string
          p_id: string
          p_processed: string[]
          p_sent: number
        }
        Returns: boolean
      }
      push_release: {
        Args: { p_claim: string; p_error?: string; p_id: string }
        Returns: undefined
      }
      push_targets: {
        Args: { p_notification: string }
        Returns: {
          token: string
          user_id: string
        }[]
      }
      question_assign: {
        Args: { p_assignee: string; p_question: string }
        Returns: {
          answered_at: string | null
          asker_id: string
          assigned_at: string | null
          assigned_by: string | null
          assignee_id: string | null
          created_at: string
          id: string
          status: string
          subject: string
          topic: string
          updated_at: string
          waiting_since: string | null
        }
        SetofOptions: {
          from: "*"
          to: "school_questions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      question_close: { Args: { p_question: string }; Returns: undefined }
      question_reply: {
        Args: { p_body: string; p_question: string }
        Returns: {
          author_id: string | null
          body: string
          created_at: string
          from_school: boolean
          id: string
          question_id: string
        }
        SetofOptions: {
          from: "*"
          to: "school_question_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_post_views: { Args: { p_posts: string[] }; Returns: undefined }
      register_push_token: {
        Args: { p_platform: string; p_token: string }
        Returns: undefined
      }
      remove_pickup_person: { Args: { p_id: string }; Returns: undefined }
      request_child: {
        Args: {
          p_birthday?: string
          p_first: string
          p_grade: number
          p_last: string
          p_note?: string
          p_relation?: string
        }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          details: Json
          id: string
          kind: string
          requested_by: string
          status: string
          student_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "family_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_child_edit: {
        Args: {
          p_first: string
          p_grade: number
          p_last: string
          p_note?: string
          p_student: string
        }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          details: Json
          id: string
          kind: string
          requested_by: string
          status: string
          student_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "family_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_car_pass: { Args: { p_token: string }; Returns: undefined }
      season_delete: { Args: { p_id: string }; Returns: undefined }
      season_save: {
        Args: {
          p_details?: string
          p_ends: string
          p_id: string
          p_info_url?: string
          p_max_grade?: number
          p_min_grade?: number
          p_name: string
          p_signup_closes?: string
          p_signup_opens?: string
          p_sport: string
          p_starts: string
        }
        Returns: {
          created_at: string
          details: string
          ends_on: string
          id: string
          info_url: string | null
          max_grade: number | null
          min_grade: number | null
          name: string
          signup_announced_at: string | null
          signup_closes: string | null
          signup_opens: string | null
          sport_id: string
          starts_on: string
        }
        SetofOptions: {
          from: "*"
          to: "sport_seasons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_notification: {
        Args: {
          p_audience: string
          p_body: string
          p_group?: string
          p_roles?: string[]
          p_title: string
          p_urgent?: boolean
        }
        Returns: {
          audience: string
          body: string
          created_at: string
          created_by: string | null
          data: Json
          error: string | null
          group_id: string | null
          id: string
          post_id: string | null
          push_attempts: number
          push_claim_id: string | null
          push_claim_until: string | null
          push_delivery_error: string | null
          push_remaining: string[] | null
          push_retry_after: string
          roles: string[] | null
          sent_count: number
          status: string
          title: string
          urgent: boolean
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_child_photo: {
        Args: { p_path: string; p_student: string }
        Returns: undefined
      }
      set_membership: {
        Args: {
          p_can_post?: boolean
          p_group: string
          p_muted_until?: string
          p_remove?: boolean
          p_role?: string
          p_user: string
        }
        Returns: undefined
      }
      set_my_avatar: { Args: { p_path: string }; Returns: undefined }
      set_notification_pref: {
        Args: { p_group: string; p_pref: string }
        Returns: undefined
      }
      set_pickup_number: {
        Args: { p_number: string; p_student: string }
        Returns: undefined
      }
      set_post_follow: {
        Args: { p_follow: boolean; p_post: string }
        Returns: undefined
      }
      set_sport_photo: {
        Args: { p_path: string; p_sport: string }
        Returns: undefined
      }
      sport_decide: {
        Args: { p_approve: boolean; p_note?: string; p_registration: string }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string
          id: string
          note: string
          requested_by: string | null
          season_id: string
          status: string
          student_id: string
        }
        SetofOptions: {
          from: "*"
          to: "sport_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sport_delete: { Args: { p_id: string }; Returns: undefined }
      sport_event_attendance: {
        Args: { p_events: string[] }
        Returns: {
          event_id: string
          name: string
          status: string
          student_id: string
        }[]
      }
      sport_event_cancel: {
        Args: { p_cancelled?: boolean; p_id: string }
        Returns: {
          address: string | null
          cancelled: boolean
          created_at: string
          created_by: string | null
          ends_at: string | null
          home: boolean | null
          id: string
          kind: string
          location: string | null
          notes: string
          season_id: string
          starts_at: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sport_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sport_event_delete: { Args: { p_id: string }; Returns: undefined }
      sport_event_save: {
        Args: {
          p_address?: string
          p_ends?: string
          p_home?: boolean
          p_id: string
          p_kind: string
          p_location?: string
          p_notes?: string
          p_season: string
          p_starts: string
          p_title: string
        }
        Returns: {
          address: string | null
          cancelled: boolean
          created_at: string
          created_by: string | null
          ends_at: string | null
          home: boolean | null
          id: string
          kind: string
          location: string | null
          notes: string
          season_id: string
          starts_at: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sport_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sport_follow: {
        Args: { p_follow: boolean; p_sport: string }
        Returns: undefined
      }
      sport_register: {
        Args: { p_note?: string; p_season: string; p_student: string }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string
          id: string
          note: string
          requested_by: string | null
          season_id: string
          status: string
          student_id: string
        }
        SetofOptions: {
          from: "*"
          to: "sport_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sport_rsvp: {
        Args: { p_event: string; p_status: string; p_student: string }
        Returns: undefined
      }
      sport_save: {
        Args: {
          p_category?: string
          p_description: string
          p_icon: string
          p_id: string
          p_name: string
        }
        Returns: {
          category: string
          created_at: string
          description: string
          icon: string
          id: string
          name: string
          photo_path: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sport_set_coach: {
        Args: { p_on: boolean; p_sport: string; p_user: string }
        Returns: undefined
      }
      sport_withdraw: { Args: { p_registration: string }; Returns: undefined }
      teacher_conversations: {
        Args: { p_student?: string }
        Returns: {
          id: string
          last_body: string
          last_message_at: string
          student_id: string
          student_name: string
          teacher_id: string
          teacher_name: string
          unread: boolean
        }[]
      }
      teacher_send: {
        Args: { p_body: string; p_student: string; p_teacher: string }
        Returns: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          thread_id: string
        }
        SetofOptions: {
          from: "*"
          to: "teacher_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      teacher_thread: { Args: { p_thread: string }; Returns: Json }
      teacher_thread_for: {
        Args: { p_student: string; p_teacher: string }
        Returns: string
      }
      teacher_thread_read: { Args: { p_thread: string }; Returns: undefined }
      toggle_reaction: {
        Args: { p_emoji: string; p_post: string }
        Returns: undefined
      }
      transfer_director: { Args: { p_user: string }; Returns: undefined }
      unregister_push_token: { Args: { p_token: string }; Returns: undefined }
      update_child_details: {
        Args: {
          p_allergies: string
          p_bio: string
          p_birthday: string
          p_medical_notes: string
          p_student: string
        }
        Returns: {
          allergies: string
          bio: string
          birthday: string | null
          medical_notes: string
          student_id: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "student_details"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_group_settings: {
        Args: { p_group: string; p_patch: Json }
        Returns: {
          category: string
          color: string
          created_at: string
          created_by: string | null
          description: string
          icon: string
          id: string
          name: string
          parent_group_id: string | null
          settings: Json
          slug: string | null
          tags: string[]
        }
        SetofOptions: {
          from: "*"
          to: "groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_my_profile: {
        Args: { p_avatar?: string; p_first: string; p_last: string }
        Returns: undefined
      }
      update_my_settings: {
        Args: {
          p_push_groups: boolean
          p_push_marketplace: boolean
          p_push_replies?: boolean
          p_push_school?: boolean
          p_push_volunteer: boolean
          p_quiet_end?: string
          p_quiet_start?: string
        }
        Returns: {
          push_groups: boolean
          push_marketplace: boolean
          push_replies: boolean
          push_school: boolean
          push_volunteer: boolean
          quiet_end: string | null
          quiet_start: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      vehicle_delete: { Args: { p_id: string }; Returns: undefined }
      vehicle_save: {
        Args: { p_color: string; p_id: string; p_kind: string; p_make: string }
        Returns: {
          color: string
          created_at: string
          id: string
          kind: string
          last_used_at: string | null
          make: string
          owner_id: string
        }
        SetofOptions: {
          from: "*"
          to: "vehicles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      vehicle_use: { Args: { p_id: string }; Returns: undefined }
      volunteer_delete: {
        Args: { p_opportunity: string; p_reason: string }
        Returns: undefined
      }
      volunteer_pledge: {
        Args: { p_opportunity: string; p_quantity: number }
        Returns: undefined
      }
      volunteer_post: {
        Args: {
          p_description: string
          p_end_time?: string
          p_ends_on?: string
          p_item?: string
          p_kind?: string
          p_location?: string
          p_quantity?: number
          p_spots?: number
          p_start_time?: string
          p_starts_on: string
          p_title: string
        }
        Returns: {
          created_at: string
          delete_reason: string | null
          description: string
          end_time: string | null
          ends_on: string | null
          id: string
          item: string | null
          kind: string
          lead_id: string
          location: string | null
          quantity: number | null
          spots: number | null
          start_time: string | null
          starts_on: string
          status: string
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "volunteer_opportunities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      volunteer_say_yes: { Args: { p_opportunity: string }; Returns: undefined }
      volunteer_send: {
        Args: { p_body: string; p_opportunity: string }
        Returns: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          opportunity_id: string
        }
        SetofOptions: {
          from: "*"
          to: "volunteer_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      volunteer_withdraw: {
        Args: { p_opportunity: string }
        Returns: undefined
      }
      vote_poll: { Args: { p_option: string }; Returns: undefined }
      vote_post: { Args: { p_post: string; p_value: number }; Returns: number }
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
    Enums: {},
  },
} as const
