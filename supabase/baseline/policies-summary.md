# Public schema RLS policies — baseline summary

_Auto-generato da `scripts/security/generate-baseline.sh` — non editare a mano._

**Snapshot date (UTC):** 2026-05-04

## Numeri

| Metric | Value |
|---|---|
| Total policy su `public` | 362 |
| Policy permissive (`USING/WITH CHECK true`) | 23 |
| ⚠️ Permissive **non** `service_role` (Gate 2 violations) | 0 |

✅ **Gate 2 baseline verde**: nessuna policy permissiva esposta a ruoli non-service. La whitelist Gate 2 nasce vuota.

## Policy per (table, command)

Mappa usata da Gate 3 (`check-orphan-drop-policy.sh`) per espandere `FOR ALL` e verificare la copertura post-drop.

| Table | Policy name | Cmd | Roles |
|---|---|---|---|
| `access_review_items` | Admins manage access review items | ALL | public |
| `access_reviews` | Admins manage access reviews | ALL | public |
| `action_suggestions` | Users can update own suggestions | UPDATE | public |
| `action_suggestions` | Users see own or global suggestions | SELECT | public |
| `ad_creative_stats` | Users can view ad creative stats for their brands | SELECT | authenticated |
| `ad_demographic_stats` | Users can view demographic stats for their brands | SELECT | authenticated |
| `ad_platform_stats` | Marketing roles can view ad platform stats | SELECT | public |
| `ad_sync_log` | Service role only | ALL | public |
| `admin_notes` | Finance roles can delete admin notes | DELETE | public |
| `admin_notes` | Finance roles can insert admin notes | INSERT | public |
| `admin_notes` | Finance roles can update admin notes | UPDATE | public |
| `admin_notes` | Finance roles can view admin notes | SELECT | public |
| `admin_todos` | Admins and CEOs can manage todos | ALL | public |
| `ai_call_action_decisions` | Users can insert decisions for their brands | INSERT | public |
| `ai_call_action_decisions` | Users can view decisions for their brands | SELECT | public |
| `ai_call_action_executions` | Users can insert executions for their brands | INSERT | public |
| `ai_call_action_executions` | Users can update executions for their brands | UPDATE | public |
| `ai_call_action_executions` | Users can view executions for their brands | SELECT | public |
| `ai_call_action_proposals` | Users can insert proposals for their brands | INSERT | public |
| `ai_call_action_proposals` | Users can update proposals for their brands | UPDATE | public |
| `ai_call_action_proposals` | Users can view proposals for their brands | SELECT | public |
| `ai_chat_logs` | Users can flag their own AI chat logs | UPDATE | public |
| `ai_chat_logs` | Users can insert AI chat logs | INSERT | public |
| `ai_chat_logs` | Users can view their own AI chat logs | SELECT | public |
| `ai_chat_runs` | Thread members can delete ai_chat_runs | DELETE | authenticated |
| `ai_chat_runs` | Users can view own brand runs | SELECT | authenticated |
| `ai_configs` | Admins and CEOs can insert AI configs | INSERT | public |
| `ai_configs` | Admins and CEOs can update AI configs | UPDATE | public |
| `ai_configs` | Admins and CEOs can view AI configs | SELECT | public |
| `ai_decision_logs` | Users can view AI decision logs in their brands | SELECT | public |
| `ai_feedback` | Users can insert AI feedback in their brands | INSERT | public |
| `ai_feedback` | Users can view AI feedback in their brands | SELECT | public |
| `ai_jobs` | Admins can view ai jobs | SELECT | public |
| `ai_prompts` | Admins and CEOs can manage AI prompts | ALL | public |
| `ai_request_quota` | ai_request_quota_admin_select | SELECT | authenticated |
| `ai_request_quota` | ai_request_quota_service_all | ALL | service_role |
| `ai_tag_deal_jobs` | Admins can view ai tag deal jobs | SELECT | public |
| `anomaly_baselines` | Admins read baselines | SELECT | public |
| `anomaly_baselines` | Service updates baselines | UPDATE | service_role |
| `anomaly_baselines` | Service writes baselines | INSERT | service_role |
| `anomaly_detections` | Admins manage detections | ALL | public |
| `anomaly_detections` | Service inserts detections | INSERT | service_role |
| `appointment_outcomes` | appointment_outcomes_insert_brand | INSERT | authenticated |
| `appointment_outcomes` | appointment_outcomes_select_brand | SELECT | public |
| `appointments` | Users can view appointments in their brands | SELECT | public |
| `audit_access_log` | audit_access_log_insert_self | INSERT | authenticated |
| `audit_access_log` | audit_access_log_select_admin | SELECT | authenticated |
| `audit_alert_channels` | Admins can manage alert channels | ALL | public |
| `audit_alert_channels` | Admins can view alert channels | SELECT | public |
| `audit_alert_deliveries` | Admins can view alert deliveries | SELECT | public |
| `audit_alert_deliveries` | Service can insert deliveries | INSERT | service_role |
| `audit_alert_deliveries` | Service can update deliveries | UPDATE | service_role |
| `audit_anomalies` | Admins can update anomalies (ack) | UPDATE | public |
| `audit_anomalies` | Admins can view anomalies | SELECT | public |
| `audit_anomalies` | Service can insert anomalies | INSERT | service_role |
| `audit_compliance_reports` | audit admins can delete compliance reports | DELETE | public |
| `audit_compliance_reports` | audit admins can insert compliance reports | INSERT | public |
| `audit_compliance_reports` | audit admins can read compliance reports | SELECT | public |
| `audit_events` | audit_events_select_audit_viewers | SELECT | authenticated |
| `audit_events_archive` | audit admins can view archive | SELECT | authenticated |
| `audit_log` | Users can view audit logs in their brands | SELECT | public |
| `audit_pii_policies` | audit admins can manage pii policies | ALL | authenticated |
| `audit_pii_policies` | audit admins can view pii policies | SELECT | authenticated |
| `audit_retention_policies` | audit admins can manage retention policies | ALL | authenticated |
| `audit_retention_policies` | audit admins can view retention policies | SELECT | authenticated |
| `automation_jobs` | Admins can manage automation jobs | ALL | public |
| `automation_jobs` | Service role full access to automation_jobs | ALL | public |
| `automation_jobs` | Users can view automation jobs for their brands | SELECT | public |
| `automation_logs` | Users can update pending automation logs | UPDATE | public |
| `automation_logs` | Users can view automation logs | SELECT | public |
| `automation_rules` | Admin CEO can manage automation rules | ALL | public |
| `automation_rules` | Users can view automation rules | SELECT | public |
| `backup_runs` | backup_runs_select_admin | SELECT | authenticated |
| `backup_runs` | backup_runs_service_insert | INSERT | service_role |
| `backup_runs` | backup_runs_service_update | UPDATE | service_role |
| `backup_schedules` | backup_schedules_admin_modify | ALL | authenticated |
| `backup_schedules` | backup_schedules_admin_select | SELECT | authenticated |
| `brand_assignment_state` | Admins can manage assignment state | ALL | public |
| `brand_tax_settings` | Admin CEO can delete tax settings | DELETE | public |
| `brand_tax_settings` | Admin CEO can insert tax settings | INSERT | public |
| `brand_tax_settings` | Admin CEO can update tax settings | UPDATE | public |
| `brand_tax_settings` | Admin CEO can view tax settings | SELECT | public |
| `brands` | Admins can delete brands | DELETE | public |
| `brands` | Admins can insert brands | INSERT | public |
| `brands` | Admins can update brands | UPDATE | public |
| `brands` | Users can view brands | SELECT | public |
| `budgets` | Finance roles can delete budgets | DELETE | public |
| `budgets` | Finance roles can insert budgets | INSERT | public |
| `budgets` | Finance roles can update budgets | UPDATE | public |
| `budgets` | Finance roles can view budgets | SELECT | public |
| `call_logs` | Users can insert call logs | INSERT | public |
| `call_logs` | Users can update their own call logs | UPDATE | public |
| `call_logs` | Users can view call logs in their brands | SELECT | public |
| `call_transcripts` | Users can insert transcripts for their brand | INSERT | public |
| `call_transcripts` | Users can update transcripts for their brand | UPDATE | public |
| `call_transcripts` | Users can view transcripts for their brand | SELECT | public |
| `capacity_snapshots` | Admins read capacity | SELECT | public |
| `capacity_snapshots` | Service writes capacity | INSERT | service_role |
| `capacity_thresholds` | Admins manage thresholds | ALL | public |
| `chat_message_reads` | Users can delete their message reads | DELETE | authenticated |
| `chat_message_reads` | Users can mark messages as read | INSERT | public |
| `chat_message_reads` | Users can view their read receipts | SELECT | public |
| `chat_messages` | Thread members can delete messages | DELETE | authenticated |
| `chat_messages` | Thread members can send messages | INSERT | public |
| `chat_messages` | Thread members can view messages | SELECT | public |
| `chat_messages` | Users can edit their own messages | UPDATE | public |
| `chat_thread_members` | Members can be added by thread creator or admin | INSERT | authenticated |
| `chat_thread_members` | Thread members can view membership | SELECT | public |
| `chat_thread_members` | Thread owners/moderators can delete membership | DELETE | authenticated |
| `chat_thread_members` | Thread owners/moderators can update membership | UPDATE | authenticated |
| `chat_threads` | Thread members can delete threads | DELETE | authenticated |
| `chat_threads` | Thread members can update threads | UPDATE | authenticated |
| `chat_threads` | Users can create threads in their brands | INSERT | public |
| `chat_threads` | Users can view threads they are members of | SELECT | public |
| `clinical_topic_aliases` | Admins and CEOs can manage aliases | ALL | public |
| `clinical_topic_aliases` | Users can view aliases in their brands | SELECT | public |
| `clinical_topics` | Admins and CEOs can manage topics | ALL | public |
| `clinical_topics` | Users can view topics in their brands | SELECT | public |
| `compliance_change_log` | Admins read compliance log | SELECT | public |
| `compliance_change_log` | Service inserts compliance log | INSERT | service_role |
| `compliance_evidence` | Admins manage evidence | ALL | public |
| `contact_field_definitions` | Admins can manage field definitions | ALL | public |
| `contact_field_definitions` | Users can read active global field definitions | SELECT | public |
| `contact_field_definitions` | Users can read brand field definitions | SELECT | public |
| `contact_field_values` | Users can delete field values | DELETE | public |
| `contact_field_values` | Users can insert field values | INSERT | public |
| `contact_field_values` | Users can update field values | UPDATE | public |
| `contact_field_values` | Users can view field values | SELECT | public |
| `contact_phones` | Users can insert phones in their brands | INSERT | public |
| `contact_phones` | Users can update phones in their brands | UPDATE | public |
| `contact_phones` | Users can view phones in their brands | SELECT | public |
| `contact_search_index` | Users can search contacts via brand hierarchy | SELECT | public |
| `contact_table_views` | Users can delete own table views | DELETE | authenticated |
| `contact_table_views` | Users can insert own table views | INSERT | authenticated |
| `contact_table_views` | Users can update own table views | UPDATE | authenticated |
| `contact_table_views` | Users can view own table views | SELECT | authenticated |
| `contact_tracking` | Users can insert tracking in their brands | INSERT | public |
| `contact_tracking` | Users can update tracking in their brands | UPDATE | public |
| `contact_tracking` | Users can view tracking in their brands | SELECT | public |
| `contacts` | Users can delete contacts in their brands | DELETE | public |
| `contacts` | Users can insert contacts in their brands | INSERT | public |
| `contacts` | Users can update contacts in their brands | UPDATE | public |
| `contacts` | Users can view contacts in their brands | SELECT | public |
| `contacts` | Users can view contacts via brand hierarchy | SELECT | public |
| `cost_centers` | Admin CEO can delete cost centers | DELETE | public |
| `cost_centers` | Admin CEO can insert cost centers | INSERT | public |
| `cost_centers` | Admin CEO can update cost centers | UPDATE | public |
| `cost_centers` | Finance roles can view cost centers | SELECT | public |
| `deal_scores` | Users can view deal scores in their brands | SELECT | public |
| `deal_stage_history` | Users can insert stage history | INSERT | public |
| `deal_stage_history` | Users can view stage history in their brands | SELECT | public |
| `deal_stage_transitions` | Users can insert transitions for their brands | INSERT | authenticated |
| `deal_stage_transitions` | Users can view transitions for their brands | SELECT | authenticated |
| `deals` | Users can insert deals in their brands | INSERT | public |
| `deals` | Users can update deals in their brands | UPDATE | public |
| `deals` | Users can view deals based on role | SELECT | public |
| `dependency_inventory` | Admins manage dependency inventory | ALL | authenticated |
| `email_send_log` | Service role can insert send log | INSERT | public |
| `email_send_log` | Service role can read send log | SELECT | public |
| `email_send_log` | Service role can update send log | UPDATE | public |
| `email_send_state` | Service role can manage send state | ALL | public |
| `email_unsubscribe_tokens` | Service role can insert tokens | INSERT | public |
| `email_unsubscribe_tokens` | Service role can mark tokens as used | UPDATE | public |
| `email_unsubscribe_tokens` | Service role can read tokens | SELECT | public |
| `executive_reports` | Admin CEO can view executive reports | SELECT | public |
| `expense_categories` | Finance roles can delete expense categories | DELETE | public |
| `expense_categories` | Finance roles can insert expense categories | INSERT | public |
| `expense_categories` | Finance roles can update expense categories | UPDATE | public |
| `expense_categories` | Finance roles can view expense categories | SELECT | public |
| `expenses` | Finance roles can delete expenses | DELETE | public |
| `expenses` | Finance roles can insert expenses | INSERT | public |
| `expenses` | Finance roles can update expenses | UPDATE | public |
| `expenses` | Finance roles can view expenses | SELECT | public |
| `feature_flags` | Admins can manage feature flags | ALL | public |
| `feature_flags` | Users can read feature flags for their brands | SELECT | public |
| `forecasts` | Admin CEO can manage forecasts | ALL | public |
| `forecasts` | Finance roles can view forecasts | SELECT | public |
| `ga4_stats` | Service role can manage ga4_stats | ALL | service_role |
| `ga4_stats` | Users can view ga4_stats for their brands | SELECT | authenticated |
| `household_people` | Service role can manage household people | ALL | service_role |
| `household_people` | Users can view household people for their brands | SELECT | authenticated |
| `incident_drills` | Admins can manage drills | ALL | authenticated |
| `incident_drills` | Users can view drills for their brand | SELECT | authenticated |
| `incoming_calls` | Users can update their incoming calls | UPDATE | public |
| `incoming_calls` | Users can view their incoming calls | SELECT | public |
| `incoming_requests` | Admins can view incoming requests | SELECT | public |
| `keplero_interactions` | Service role can manage keplero interactions | ALL | service_role |
| `keplero_interactions` | Users can view keplero interactions for their brands | SELECT | authenticated |
| `keplero_lookup_secrets` | admin_manage_keplero_lookup_secrets | ALL | public |
| `keplero_lookup_settings` | admin_manage_keplero_lookup_settings | ALL | public |
| `lead_campaign_attribution` | Brand members can view attribution | SELECT | public |
| `lead_campaign_attribution` | System/admin can insert attribution | INSERT | public |
| `lead_digest_config` | admin_ceo_select_lead_digest_config | SELECT | authenticated |
| `lead_digest_config` | admin_ceo_update_lead_digest_config | UPDATE | authenticated |
| `lead_digest_config` | service_role_all_lead_digest_config | ALL | service_role |
| `lead_digest_runs` | admin_ceo_select_lead_digest_runs | SELECT | authenticated |
| `lead_digest_runs` | service_role_all_lead_digest_runs | ALL | service_role |
| `lead_event_clinical_topics` | Users can view event topics via lead_events brand | SELECT | public |
| `lead_events` | Users can insert lead events in their brands | INSERT | public |
| `lead_events` | Users can view lead events in their brands | SELECT | public |
| `lead_score_history` | Users can insert lead_score_history of their brand | INSERT | authenticated |
| `lead_score_history` | Users can read lead_score_history of their brand | SELECT | authenticated |
| `lead_scores` | Users can manage lead_scores of their brand | ALL | authenticated |
| `lead_scores` | Users can read lead_scores of their brand | SELECT | authenticated |
| `marketing_campaign_groups` | Admin/CEO can delete campaign groups | DELETE | public |
| `marketing_campaign_groups` | Admin/CEO can manage campaign groups | INSERT | public |
| `marketing_campaign_groups` | Admin/CEO can update campaign groups | UPDATE | public |
| `marketing_campaign_groups` | Marketing roles can view campaign groups | SELECT | public |
| `marketing_campaigns` | Admin/CEO can delete campaigns | DELETE | public |
| `marketing_campaigns` | Admin/CEO can insert campaigns | INSERT | public |
| `marketing_campaigns` | Admin/CEO can update campaigns | UPDATE | public |
| `marketing_campaigns` | Marketing roles can view campaigns | SELECT | public |
| `marketing_channels` | Admin/CEO can delete channels | DELETE | public |
| `marketing_channels` | Admin/CEO can insert channels | INSERT | public |
| `marketing_channels` | Admin/CEO can update channels | UPDATE | public |
| `marketing_channels` | Marketing roles can view channels | SELECT | public |
| `marketing_costs` | Finance roles can delete marketing costs | DELETE | public |
| `marketing_costs` | Finance roles can insert marketing costs | INSERT | public |
| `marketing_costs` | Finance roles can update marketing costs | UPDATE | public |
| `marketing_costs` | Finance roles can view marketing costs | SELECT | public |
| `mcp_access_tokens` | mcp_tokens_insert_self | INSERT | authenticated |
| `mcp_access_tokens` | mcp_tokens_select_own_or_admin | SELECT | authenticated |
| `mcp_access_tokens` | mcp_tokens_update_own_or_admin | UPDATE | authenticated |
| `mcp_approvals` | Admins full access mcp_approvals | ALL | authenticated |
| `mcp_approvals` | Approvers read own approvals | SELECT | authenticated |
| `mcp_executions` | Admins full access mcp_executions | ALL | authenticated |
| `mcp_executions` | Users read own executions | SELECT | authenticated |
| `mcp_policies` | Admins full access mcp_policies | ALL | authenticated |
| `mcp_request_log` | mcp_req_log_select_admins | SELECT | authenticated |
| `mcp_resource_changes` | service_role_full_mcp_changes | ALL | public |
| `mcp_resources` | Admins full access mcp_resources | ALL | authenticated |
| `mcp_secrets` | Admins full access mcp_secrets | ALL | authenticated |
| `mcp_servers` | Admins full access mcp_servers | ALL | authenticated |
| `mcp_slo_alerts` | mcp_slo_alerts_admin_ack | UPDATE | authenticated |
| `mcp_slo_alerts` | mcp_slo_alerts_admin_read | SELECT | authenticated |
| `mcp_slo_alerts` | mcp_slo_alerts_service_insert | INSERT | public |
| `mcp_subscriptions` | service_role_full_mcp_subs | ALL | public |
| `mcp_subscriptions` | users_view_own_mcp_subs | SELECT | public |
| `mcp_tools` | Admins full access mcp_tools | ALL | authenticated |
| `meta_apps` | Admins and CEOs can manage meta apps | ALL | public |
| `meta_capi_event_queue` | Admins can view CAPI queue | SELECT | public |
| `meta_lead_events` | Admins can view meta lead events | SELECT | public |
| `meta_lead_sources` | Admins and CEOs can manage meta lead sources | ALL | public |
| `meta_lead_sources` | Admins and CEOs can view meta lead sources | SELECT | public |
| `module_usage_events` | Admins can read usage events | SELECT | public |
| `module_usage_events` | Authenticated users can insert usage events | INSERT | public |
| `notification_preferences` | Users can manage their notification preferences | ALL | public |
| `notification_webhook_destinations` | Admins manage notification webhook destinations | ALL | authenticated |
| `notification_webhook_outbox` | Admins read notification webhook outbox | SELECT | authenticated |
| `notifications` | Users can delete their notifications | DELETE | public |
| `notifications` | Users can update their notifications (mark read) | UPDATE | public |
| `notifications` | Users can view their notifications | SELECT | public |
| `oauth_tokens` | Admins can delete OAuth tokens | DELETE | public |
| `oauth_tokens` | Admins can insert OAuth tokens | INSERT | public |
| `oauth_tokens` | Admins can update OAuth tokens | UPDATE | public |
| `oauth_tokens` | Admins can view OAuth tokens | SELECT | public |
| `oauth_tokens` | Service role full access on oauth_tokens | ALL | public |
| `outbound_webhook_deliveries` | Admins can manage deliveries in their brands | ALL | public |
| `outbound_webhook_deliveries` | Users can view deliveries in their brands | SELECT | public |
| `outbound_webhooks` | Admins can delete webhooks | DELETE | public |
| `outbound_webhooks` | Admins can insert webhooks | INSERT | public |
| `outbound_webhooks` | Admins can update webhooks | UPDATE | public |
| `outbound_webhooks` | Deny direct SELECT on webhooks | SELECT | public |
| `payments` | Authorized users can manage payments | ALL | public |
| `payments` | Users can view payments based on order access | SELECT | public |
| `pipeline_stages` | Admins and CEOs can manage pipeline stages | ALL | public |
| `pipeline_stages` | Users can view pipeline stages for their brands | SELECT | public |
| `products` | Admins and CEOs can manage products | ALL | public |
| `products` | Users can view products in their brands | SELECT | public |
| `push_subscriptions` | push_subs_delete_own | DELETE | authenticated |
| `push_subscriptions` | push_subs_insert_own | INSERT | authenticated |
| `push_subscriptions` | push_subs_select_own | SELECT | authenticated |
| `push_subscriptions` | push_subs_service_all | ALL | service_role |
| `push_subscriptions` | push_subs_update_own | UPDATE | authenticated |
| `rate_limit_buckets` | No direct access to rate limit buckets | ALL | public |
| `restore_runs` | restore_runs_insert_service | INSERT | service_role |
| `restore_runs` | restore_runs_select_admins | SELECT | authenticated |
| `restore_runs` | restore_runs_update_service | UPDATE | service_role |
| `role_hidden_columns` | Admin/CEO can manage role_hidden_columns | ALL | public |
| `role_hidden_columns` | Users can read role hidden columns | SELECT | public |
| `role_page_permissions` | Admin/CEO can manage role_page_permissions | ALL | public |
| `role_page_permissions` | Users can read role page permissions | SELECT | public |
| `sales_availability` | sales_availability_select_brand | SELECT | authenticated |
| `sales_availability` | sales_availability_write_admins | ALL | authenticated |
| `sales_commissions` | Admins can manage commissions | ALL | public |
| `sales_commissions` | Users can view their own commissions | SELECT | public |
| `sales_order_history` | Users can view order history via order | SELECT | public |
| `sales_order_items` | Authorized users can manage order items | ALL | public |
| `sales_order_items` | Users can view order items via order | SELECT | public |
| `sales_orders` | Authorized users can insert sales orders | INSERT | public |
| `sales_orders` | Authorized users can update sales orders | UPDATE | public |
| `sales_orders` | Users can view sales orders based on role | SELECT | public |
| `sales_targets` | Admins can manage targets | ALL | public |
| `sales_targets` | Users can view targets in their brands | SELECT | public |
| `sales_time_off` | sales_time_off_select_brand | SELECT | authenticated |
| `sales_time_off` | sales_time_off_write_admins | ALL | authenticated |
| `security_findings` | Admins can manage findings | ALL | authenticated |
| `security_findings` | Users can view findings for their brand | SELECT | authenticated |
| `security_reviews` | Admins can manage security reviews | ALL | authenticated |
| `security_reviews` | Users can view security reviews for their brand | SELECT | authenticated |
| `sheets_export_logs` | Admins can view sheets export logs | SELECT | public |
| `siem_destinations` | Admins can manage SIEM destinations | ALL | authenticated |
| `siem_destinations` | Admins can view SIEM destinations | SELECT | authenticated |
| `siem_export_log` | Admins can view SIEM export log | SELECT | authenticated |
| `siem_export_log` | Service can insert SIEM export log | INSERT | service_role |
| `slo_definitions` | Admins manage SLO definitions | ALL | authenticated |
| `slo_measurements` | Admins view SLO measurements | SELECT | authenticated |
| `slo_measurements` | Service role inserts SLO measurements | INSERT | service_role |
| `suppressed_emails` | Service role can insert suppressed emails | INSERT | public |
| `suppressed_emails` | Service role can read suppressed emails | SELECT | public |
| `sync_runs` | Admins can insert sync_runs for their brands | INSERT | authenticated |
| `sync_runs` | Admins can view sync_runs for their brands | SELECT | authenticated |
| `tag_assignments` | Users can create tag assignments in their brands | INSERT | public |
| `tag_assignments` | Users can delete tag assignments in their brands | DELETE | public |
| `tag_assignments` | Users can view tag assignments in their brands | SELECT | public |
| `tags` | Admins can manage tags | ALL | public |
| `tags` | Users can view tags in their brands | SELECT | public |
| `thread_read_state` | Users can update own read state | UPDATE | public |
| `thread_read_state` | Users can upsert own read state | INSERT | public |
| `thread_read_state` | Users can view own read state | SELECT | public |
| `ticket_audit_logs` | Users can delete audit logs in their brands | DELETE | authenticated |
| `ticket_audit_logs` | Users can view audit logs in their brands | SELECT | public |
| `ticket_comments` | Users can delete their own comments | DELETE | public |
| `ticket_comments` | Users can insert comments in their brands | INSERT | public |
| `ticket_comments` | Users can update their own comments | UPDATE | public |
| `ticket_comments` | Users can view comments in their brands | SELECT | public |
| `ticket_escalation_policies` | ticket_escalation_policies_admin_all | ALL | authenticated |
| `ticket_escalation_policies` | ticket_escalation_policies_select_authorized | SELECT | authenticated |
| `ticket_events` | Users can delete ticket events in their brands | DELETE | authenticated |
| `ticket_events` | Users can insert ticket events in their brands | INSERT | public |
| `ticket_events` | Users can view ticket events in their brands | SELECT | public |
| `tickets` | Users can delete tickets in their brands | DELETE | authenticated |
| `tickets` | Users can insert tickets in their brands | INSERT | public |
| `tickets` | Users can update tickets in their brands | UPDATE | public |
| `tickets` | Users can view tickets in their brands | SELECT | public |
| `trace_events` | Admins view trace events | SELECT | authenticated |
| `trace_events` | Service inserts trace events | INSERT | service_role |
| `user_hidden_columns` | Admin/CEO can manage user_hidden_columns | ALL | public |
| `user_hidden_columns` | Users can read own hidden columns | SELECT | public |
| `user_module_access` | Admins can manage user module access | ALL | authenticated |
| `user_module_access` | Users can read own module access | SELECT | public |
| `user_page_permissions` | Admin/CEO can manage user_page_permissions | ALL | public |
| `user_page_permissions` | Users can read own page permissions | SELECT | public |
| `user_push_preferences` | user_push_prefs_delete_own | DELETE | authenticated |
| `user_push_preferences` | user_push_prefs_select_own | SELECT | authenticated |
| `user_push_preferences` | user_push_prefs_service_all | ALL | service_role |
| `user_push_preferences` | user_push_prefs_update_own | UPDATE | authenticated |
| `user_push_preferences` | user_push_prefs_upsert_own | INSERT | authenticated |
| `user_roles` | Admins can manage roles | ALL | authenticated |
| `user_roles` | Users can view roles in their brands | SELECT | public |
| `user_roles` | Users can view their roles | SELECT | authenticated |
| `users` | Admins can view all users | SELECT | authenticated |
| `users` | Users can insert themselves | INSERT | authenticated |
| `users` | Users can update themselves | UPDATE | authenticated |
| `users` | Users can view themselves | SELECT | authenticated |
| `voispeed_configs` | Admins can delete voispeed configs | DELETE | public |
| `voispeed_configs` | Admins can insert voispeed configs | INSERT | public |
| `voispeed_configs` | Admins can update voispeed configs | UPDATE | public |
| `voispeed_configs` | Admins can view voispeed configs | SELECT | public |
| `webhook_inbound_events` | Users can view inbound events for their brands | SELECT | public |
| `webhook_sources` | Admins can manage webhook sources | ALL | public |
| `webhook_sources` | Only admins can select webhook sources directly | SELECT | public |

## Policy permissive (audit GDPR/SOC2)

| Table | Policy | Cmd | Roles |
|---|---|---|---|
| `ai_request_quota` | ai_request_quota_service_all | ALL | service_role |
| `anomaly_baselines` | Service updates baselines | UPDATE | service_role |
| `anomaly_baselines` | Service writes baselines | INSERT | service_role |
| `anomaly_detections` | Service inserts detections | INSERT | service_role |
| `audit_alert_deliveries` | Service can insert deliveries | INSERT | service_role |
| `audit_alert_deliveries` | Service can update deliveries | UPDATE | service_role |
| `audit_anomalies` | Service can insert anomalies | INSERT | service_role |
| `backup_runs` | backup_runs_service_insert | INSERT | service_role |
| `backup_runs` | backup_runs_service_update | UPDATE | service_role |
| `capacity_snapshots` | Service writes capacity | INSERT | service_role |
| `compliance_change_log` | Service inserts compliance log | INSERT | service_role |
| `ga4_stats` | Service role can manage ga4_stats | ALL | service_role |
| `household_people` | Service role can manage household people | ALL | service_role |
| `keplero_interactions` | Service role can manage keplero interactions | ALL | service_role |
| `lead_digest_config` | service_role_all_lead_digest_config | ALL | service_role |
| `lead_digest_runs` | service_role_all_lead_digest_runs | ALL | service_role |
| `push_subscriptions` | push_subs_service_all | ALL | service_role |
| `restore_runs` | restore_runs_insert_service | INSERT | service_role |
| `restore_runs` | restore_runs_update_service | UPDATE | service_role |
| `siem_export_log` | Service can insert SIEM export log | INSERT | service_role |
| `slo_measurements` | Service role inserts SLO measurements | INSERT | service_role |
| `trace_events` | Service inserts trace events | INSERT | service_role |
| `user_push_preferences` | user_push_prefs_service_all | ALL | service_role |
