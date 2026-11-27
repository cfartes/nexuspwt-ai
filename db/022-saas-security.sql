DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nexus_app') THEN CREATE ROLE nexus_app NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nexus_worker') THEN CREATE ROLE nexus_worker NOLOGIN; END IF;
END $$;
ALTER ROLE nexus_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
ALTER ROLE nexus_worker NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM nexus_app,nexus_worker;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM nexus_app,nexus_worker;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM nexus_app,nexus_worker;
DO $$ BEGIN
 EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC,nexus_app,nexus_worker',current_database());
END $$;
GRANT USAGE ON SCHEMA public TO nexus_app,nexus_worker;
CREATE TABLE IF NOT EXISTS request_limits (
 bucket text PRIMARY KEY, window_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS request_limits_window ON request_limits(window_at);
CREATE INDEX IF NOT EXISTS login_attempts_window ON login_attempts(window_at);
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO nexus_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO nexus_app;
GRANT SELECT ON notification_outbox,approvals,units,memberships,company_integrations,whatsapp_gateway,email_gateway,user_invitations,invitation_deliveries,contractor_registrations,password_recoveries TO nexus_worker;
GRANT SELECT(id,company_id,unit_id,contractor_id,kind,number,status,version,removed_at) ON documents TO nexus_worker;
GRANT SELECT(id,name,email,phone,active,password_pending) ON users TO nexus_worker;
GRANT UPDATE(status,last_error,available_at,updated_at,attempts,started_at,recipient_hint,sent_at) ON notification_outbox TO nexus_worker;
GRANT UPDATE(status,last_error,available_at,attempts,started_at,sent_at) ON invitation_deliveries TO nexus_worker;
GRANT UPDATE(token_ciphertext) ON user_invitations TO nexus_worker;
GRANT UPDATE(delivery_status,delivery_error,available_at,delivery_started_at) ON contractor_registrations TO nexus_worker;
GRANT UPDATE(status,last_error,available_at,started_at,token_ciphertext) ON password_recoveries TO nexus_worker;
DO $$ BEGIN
 IF to_regclass('public.deployment_migrations') IS NOT NULL THEN
  REVOKE ALL ON deployment_migrations FROM nexus_app,nexus_worker;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION ptw_actor() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT u.id FROM public.sessions s JOIN public.users u ON u.id=s.user_id
 WHERE s.token_hash=encode(sha256(convert_to(nullif(current_setting('nexus.session_token',true),''),'UTF8')),'hex')
 AND s.expires_at>now() AND s.last_seen_at>now()-interval '30 minutes' AND u.active AND NOT u.password_pending
$$;
CREATE OR REPLACE FUNCTION ptw_unit_access(target_unit uuid,target_contractor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.units un WHERE un.id=target_unit AND (
 EXISTS(SELECT 1 FROM public.company_admins ca WHERE ca.company_id=un.company_id AND ca.user_id=public.ptw_actor() AND ca.active)
 OR EXISTS(SELECT 1 FROM public.memberships m WHERE m.unit_id=un.id AND m.user_id=public.ptw_actor() AND m.active
 AND (m.contractor_id IS NULL OR target_contractor IS NULL OR m.contractor_id=target_contractor))))
$$;
CREATE OR REPLACE FUNCTION ptw_company_access(target_company uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.company_admins ca WHERE ca.company_id=target_company AND ca.user_id=public.ptw_actor() AND ca.active)
 OR EXISTS(SELECT 1 FROM public.memberships m JOIN public.units un ON un.id=m.unit_id
 WHERE un.company_id=target_company AND m.user_id=public.ptw_actor() AND m.active)
$$;
CREATE OR REPLACE FUNCTION ptw_document_access(target_document uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.documents d WHERE d.id=target_document AND public.ptw_unit_access(d.unit_id,d.contractor_id))
$$;
CREATE OR REPLACE FUNCTION ptw_identity_access(target_company uuid,target_contractor uuid,target_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.company_admins ca WHERE ca.company_id=target_company AND ca.user_id=public.ptw_actor() AND ca.active)
 OR EXISTS(SELECT 1 FROM public.memberships m JOIN public.units un ON un.id=m.unit_id
 WHERE un.company_id=target_company AND m.user_id=public.ptw_actor() AND m.active
 AND ((m.contractor_id IS NULL AND m.role IN ('admin','gestor'))
 OR (m.contractor_id=target_contractor AND (m.user_id=target_user OR m.role IN ('gestor','admin_contratada')))))
$$;
REVOKE ALL ON FUNCTION ptw_actor(),ptw_unit_access(uuid,uuid),ptw_company_access(uuid),ptw_document_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ptw_actor(),ptw_unit_access(uuid,uuid),ptw_company_access(uuid),ptw_document_access(uuid) TO nexus_app,nexus_worker;
REVOKE ALL ON FUNCTION ptw_identity_access(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ptw_identity_access(uuid,uuid,uuid) TO nexus_app;
CREATE OR REPLACE FUNCTION ptw_version_access(target_document uuid,target_version integer) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.document_versions v WHERE v.document_id=target_document AND v.version=target_version
 AND public.ptw_unit_access((v.snapshot->>'unit_id')::uuid,(v.snapshot->>'contractor_id')::uuid))
$$;
CREATE OR REPLACE FUNCTION ptw_print_document(target_document uuid,target_version integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(v.snapshot,to_jsonb(d)) || jsonb_build_object('current_version',d.version,'removed_at',d.removed_at,'contractor',c.name,'unit',un.name,'company',co.name)
 FROM public.documents d LEFT JOIN public.document_versions v ON v.document_id=d.id AND v.version=coalesce(target_version,d.version)
 JOIN public.units un ON un.id=d.unit_id JOIN public.companies co ON co.id=d.company_id
 JOIN public.contractors c ON c.id=coalesce((v.snapshot->>'contractor_id')::uuid,d.contractor_id)
 WHERE d.id=target_document AND (target_version IS NULL OR target_version=d.version OR v.version IS NOT NULL)
 AND public.ptw_unit_access(coalesce((v.snapshot->>'unit_id')::uuid,d.unit_id),coalesce((v.snapshot->>'contractor_id')::uuid,d.contractor_id))
$$;
REVOKE ALL ON FUNCTION ptw_version_access(uuid,integer),ptw_print_document(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ptw_version_access(uuid,integer),ptw_print_document(uuid,integer) TO nexus_app;

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_scope ON documents;
CREATE POLICY app_scope ON documents TO nexus_app USING(ptw_unit_access(unit_id,contractor_id)) WITH CHECK(ptw_unit_access(unit_id,contractor_id));
DROP POLICY IF EXISTS worker_scope ON documents;
CREATE POLICY worker_scope ON documents FOR SELECT TO nexus_worker USING(true);
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_scope ON document_versions;
CREATE POLICY app_scope ON document_versions TO nexus_app USING(ptw_document_access(document_id)) WITH CHECK(ptw_document_access(document_id));
DROP POLICY IF EXISTS worker_scope ON document_versions;
CREATE POLICY worker_scope ON document_versions FOR SELECT TO nexus_worker USING(true);
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_scope ON approvals;
CREATE POLICY app_scope ON approvals TO nexus_app USING(ptw_version_access(document_id,version)) WITH CHECK(ptw_document_access(document_id));
DROP POLICY IF EXISTS worker_scope ON approvals;
CREATE POLICY worker_scope ON approvals FOR SELECT TO nexus_worker USING(true);
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_scope ON photos;
CREATE POLICY app_scope ON photos TO nexus_app USING(ptw_document_access(document_id)) WITH CHECK(ptw_document_access(document_id));
DROP POLICY IF EXISTS worker_scope ON photos;
CREATE POLICY worker_scope ON photos FOR SELECT TO nexus_worker USING(true);
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_read ON audit_events;
CREATE POLICY app_read ON audit_events FOR SELECT TO nexus_app USING(
 (document_id IS NOT NULL AND ptw_document_access(document_id)) OR
 EXISTS(SELECT 1 FROM company_admins ca WHERE ca.company_id=audit_events.company_id AND ca.user_id=ptw_actor() AND ca.active));
-- Scope is assigned by the existing trigger; API authorization controls which action can be recorded.
DROP POLICY IF EXISTS app_insert ON audit_events;
CREATE POLICY app_insert ON audit_events FOR INSERT TO nexus_app WITH CHECK(true);
ALTER TABLE executor_identity_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE executor_identity_submissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_scope ON executor_identity_submissions;
CREATE POLICY app_scope ON executor_identity_submissions TO nexus_app USING(ptw_identity_access(company_id,contractor_id,user_id)) WITH CHECK(ptw_unit_access(unit_id,contractor_id));
ALTER TABLE executor_identity_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE executor_identity_files FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_scope ON executor_identity_files;
CREATE POLICY app_scope ON executor_identity_files TO nexus_app USING(EXISTS(SELECT 1 FROM executor_identity_submissions s WHERE s.id=submission_id)) WITH CHECK(EXISTS(SELECT 1 FROM executor_identity_submissions s WHERE s.id=submission_id));
