// Generated from the live schema by Supabase's type generator. Regenerate after
// every migration rather than editing by hand.

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      analyses: {
        Row: {
          adapter: string | null
          attempt: number
          branch: string | null
          commit_sha: string | null
          coverage: Json | null
          created_at: string
          error: string | null
          file_count: number | null
          finished_at: string | null
          id: string
          org_id: string
          package_count: number | null
          project_id: string
          routes_withheld: Json
          stage: Database["public"]["Enums"]["analysis_stage"] | null
          stage_changed_at: string
          stage_message: string | null
          started_by: string | null
          started_by_name: string | null
          status: Database["public"]["Enums"]["analysis_status"]
          version: number
        }
        Insert: {
          adapter?: string | null
          attempt?: number
          branch?: string | null
          commit_sha?: string | null
          coverage?: Json | null
          created_at?: string
          error?: string | null
          file_count?: number | null
          finished_at?: string | null
          id?: string
          org_id: string
          package_count?: number | null
          project_id: string
          routes_withheld?: Json
          stage?: Database["public"]["Enums"]["analysis_stage"] | null
          stage_changed_at?: string
          stage_message?: string | null
          started_by?: string | null
          started_by_name?: string | null
          status?: Database["public"]["Enums"]["analysis_status"]
          version?: number
        }
        Update: {
          adapter?: string | null
          attempt?: number
          branch?: string | null
          commit_sha?: string | null
          coverage?: Json | null
          created_at?: string
          error?: string | null
          file_count?: number | null
          finished_at?: string | null
          id?: string
          org_id?: string
          package_count?: number | null
          project_id?: string
          routes_withheld?: Json
          stage?: Database["public"]["Enums"]["analysis_stage"] | null
          stage_changed_at?: string
          stage_message?: string | null
          started_by?: string | null
          started_by_name?: string | null
          status?: Database["public"]["Enums"]["analysis_status"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "analyses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyses_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      edges: {
        Row: {
          analysis_id: string
          id: string
          kinds: string[]
          org_id: string
          source_file_id: string
          target_file_id: string
          type_only: boolean
        }
        Insert: {
          analysis_id: string
          id?: string
          kinds: string[]
          org_id: string
          source_file_id: string
          target_file_id: string
          type_only: boolean
        }
        Update: {
          analysis_id?: string
          id?: string
          kinds?: string[]
          org_id?: string
          source_file_id?: string
          target_file_id?: string
          type_only?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "edges_analysis_id_org_id_fkey"
            columns: ["analysis_id", "org_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "edges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edges_source_file_id_org_id_fkey"
            columns: ["source_file_id", "org_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "edges_target_file_id_org_id_fkey"
            columns: ["target_file_id", "org_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      explanations: {
        Row: {
          analysis_id: string
          body: string
          created_at: string
          id: string
          key: string
          model: string
          org_id: string
          removed_sentences: number
        }
        Insert: {
          analysis_id: string
          body: string
          created_at?: string
          id?: string
          key: string
          model: string
          org_id: string
          removed_sentences?: number
        }
        Update: {
          analysis_id?: string
          body?: string
          created_at?: string
          id?: string
          key?: string
          model?: string
          org_id?: string
          removed_sentences?: number
        }
        Relationships: [
          {
            foreignKeyName: "explanations_analysis_id_org_id_fkey"
            columns: ["analysis_id", "org_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "explanations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      file_roles: {
        Row: {
          file_id: string
          id: string
          org_id: string
          role: string
          source: string
        }
        Insert: {
          file_id: string
          id?: string
          org_id: string
          role: string
          source: string
        }
        Update: {
          file_id?: string
          id?: string
          org_id?: string
          role?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_roles_file_id_org_id_fkey"
            columns: ["file_id", "org_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "file_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          analysis_id: string
          attempt: number
          bytes: number
          content_hash: string
          fan_in: number
          fan_out: number
          folder: string
          id: string
          kind: string
          line_count: number | null
          org_id: string
          package: string | null
          path: string
        }
        Insert: {
          analysis_id: string
          attempt: number
          bytes: number
          content_hash: string
          fan_in: number
          fan_out: number
          folder: string
          id?: string
          kind: string
          line_count?: number | null
          org_id: string
          package?: string | null
          path: string
        }
        Update: {
          analysis_id?: string
          attempt?: number
          bytes?: number
          content_hash?: string
          fan_in?: number
          fan_out?: number
          folder?: string
          id?: string
          kind?: string
          line_count?: number | null
          org_id?: string
          package?: string | null
          path?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_analysis_id_org_id_fkey"
            columns: ["analysis_id", "org_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "files_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          analysis_id: string
          detail: string | null
          file_id: string
          id: string
          kind: string
          line: number
          org_id: string
          reason: string | null
          specifier: string
          status: string
          target: string | null
          type_only: boolean
        }
        Insert: {
          analysis_id: string
          detail?: string | null
          file_id: string
          id?: string
          kind: string
          line: number
          org_id: string
          reason?: string | null
          specifier: string
          status: string
          target?: string | null
          type_only: boolean
        }
        Update: {
          analysis_id?: string
          detail?: string | null
          file_id?: string
          id?: string
          kind?: string
          line?: number
          org_id?: string
          reason?: string | null
          specifier?: string
          status?: string
          target?: string | null
          type_only?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "imports_analysis_id_org_id_fkey"
            columns: ["analysis_id", "org_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "imports_file_id_org_id_fkey"
            columns: ["file_id", "org_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "imports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          analysis_id: string
          detail: Json
          id: string
          kind: string
          org_id: string
        }
        Insert: {
          analysis_id: string
          detail: Json
          id?: string
          kind: string
          org_id: string
        }
        Update: {
          analysis_id?: string
          detail?: Json
          id?: string
          kind?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_analysis_id_org_id_fkey"
            columns: ["analysis_id", "org_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "insights_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      last_visits: {
        Row: {
          org_id: string
          project_id: string
          user_id: string
          visited_at: string
        }
        Insert: {
          org_id: string
          project_id: string
          user_id: string
          visited_at: string
        }
        Update: {
          org_id?: string
          project_id?: string
          user_id?: string
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "last_visits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "last_visits_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      notes: {
        Row: {
          author_id: string
          author_name: string
          body: string
          content_hash: string | null
          created_at: string
          edited_at: string | null
          id: string
          org_id: string
          path: string
          project_id: string
          written_version: number | null
        }
        Insert: {
          author_id: string
          author_name: string
          body: string
          content_hash?: string | null
          created_at?: string
          edited_at?: string | null
          id?: string
          org_id: string
          path: string
          project_id: string
          written_version?: number | null
        }
        Update: {
          author_id?: string
          author_name?: string
          body?: string
          content_hash?: string | null
          created_at?: string
          edited_at?: string | null
          id?: string
          org_id?: string
          path?: string
          project_id?: string
          written_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_project_id_org_id_fkey"
            columns: ["project_id", "org_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          last_version: number
          org_id: string
          repo_name: string
          repo_owner: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          last_version?: number
          org_id: string
          repo_name: string
          repo_owner: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          last_version?: number
          org_id?: string
          repo_name?: string
          repo_owner?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_labels: {
        Row: {
          created_at: string
          id: string
          key: string
          model: string
          org_id: string
          role: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          model: string
          org_id: string
          role?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          model?: string
          org_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_labels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          analysis_id: string
          file_id: string
          id: string
          line: number
          method: string
          org_id: string
          pattern: string
        }
        Insert: {
          analysis_id: string
          file_id: string
          id?: string
          line: number
          method: string
          org_id: string
          pattern: string
        }
        Update: {
          analysis_id?: string
          file_id?: string
          id?: string
          line?: number
          method?: string
          org_id?: string
          pattern?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_analysis_id_org_id_fkey"
            columns: ["analysis_id", "org_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "routes_file_id_org_id_fkey"
            columns: ["file_id", "org_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "routes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      analysis_stage: "fetching" | "selecting" | "parsing" | "storing" | "labelling"
      analysis_status: "queued" | "running" | "complete" | "failed"
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
    Enums: {
      analysis_stage: ["fetching", "selecting", "parsing", "storing", "labelling"],
      analysis_status: ["queued", "running", "complete", "failed"],
    },
  },
} as const
