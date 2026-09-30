import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditEventType =
  | "signup_completed"
  | "organization_created"
  | "supplier_created"
  | "supplier_updated"
  | "supplier_deleted"
  | "reconciliation_started"
  | "dataset_imported"
  | "mapping_profile_reused"
  | "mapping_profile_saved"
  | "reconciliation_run"
  | "probable_match_reviewed"
  | "manual_match_created"
  | "exception_resolved"
  | "reconciliation_completed"
  | "reconciliation_reopened"
  | "reconciliation_deleted"
  | "data_exported"
  | "user_invited"
  | "user_invite_accepted"
  | "user_removed"
  | "organization_updated"
  | "organization_deleted"
  | "profile_updated";

export async function recordAudit(
  supabase: SupabaseClient,
  params: {
    organizationId: string | null;
    actorUserId: string | null;
    eventType: AuditEventType;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("audit_events").insert({
    organization_id: params.organizationId,
    actor_user_id: params.actorUserId,
    event_type: params.eventType,
    metadata: params.metadata ?? {},
  });
  if (error) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        event: "audit_insert_failed",
        code: error.code,
        message: error.message,
      }),
    );
  }
}
