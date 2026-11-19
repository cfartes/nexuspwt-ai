import type { Pool, PoolClient } from 'pg';
import type { IdentityPolicy, PersonalIdentityState } from './types';

type IdentitySubmissionState = {
  id: string;
  document_type: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  reviewed_at: Date | null;
  reviewed_by: string | null;
  identity_snapshot: { name: string; email: string; contractorId: string };
  name: string;
  email: string;
};

export async function readIdentityPolicy(
  client: Pool | PoolClient,
  companyId: string,
): Promise<IdentityPolicy> {
  const {
    rows: [policy],
  } = await client.query<IdentityPolicy>(
    'SELECT identity_upload_enabled enabled,identity_policy_version version FROM companies WHERE id=$1',
    [companyId],
  );
  return policy;
}

export async function personalIdentityState(
  client: Pool | PoolClient,
  userId: string,
  companyId: string,
  contractorId: string | null,
  enabled: boolean,
): Promise<PersonalIdentityState> {
  const base: PersonalIdentityState = {
    required: false,
    status: enabled ? 'not_required' : 'disabled',
    submissionId: null,
    documentType: null,
    reason: null,
    reviewedAt: null,
    reviewedBy: null,
  };
  if (!enabled || !contractorId) return base;
  const {
    rows: [submission],
  } = await client.query<IdentitySubmissionState>(
    `SELECT s.id,s.document_type,s.status,s.reason,s.reviewed_at,s.reviewed_by,s.identity_snapshot,u.name,u.email
     FROM executor_identity_submissions s JOIN users u ON u.id=s.user_id
     WHERE s.user_id=$1 AND s.company_id=$2 AND s.contractor_id=$3
     ORDER BY s.submitted_at DESC,s.id DESC LIMIT 1`,
    [userId, companyId, contractorId],
  );
  if (!submission) return { ...base, required: true, status: 'missing' };
  const matches =
    submission.identity_snapshot.name === submission.name &&
    submission.identity_snapshot.email === submission.email &&
    submission.identity_snapshot.contractorId === contractorId;
  const status = matches ? submission.status : 'missing';
  return {
    required: status !== 'approved',
    status,
    submissionId: submission.id,
    documentType: submission.document_type,
    reason: matches ? submission.reason : 'Cadastro alterado. Envie novamente o documento.',
    reviewedAt: submission.reviewed_at?.toISOString() ?? null,
    reviewedBy: submission.reviewed_by,
  };
}

export async function updateIdentityPolicy(
  client: PoolClient,
  companyId: string,
  enabled: boolean,
  version: number,
): Promise<boolean> {
  const { rowCount } = await client.query(
    'UPDATE companies SET identity_upload_enabled=$2,identity_policy_version=identity_policy_version+1 WHERE id=$1 AND identity_policy_version=$3',
    [companyId, enabled, version],
  );
  return rowCount === 1;
}
