import type { DocumentInput } from './validation';
import type { ContractorDetails } from './contractors';
import type { Company } from './companies';
export type Unit = {
  id: string;
  company_id: string;
  company_name: string;
  name: string;
  kind: string;
  region_id: string | null;
  role: string;
  contractor_id: string | null;
  company_admin?: boolean;
};
export type Person = {
  id: string;
  platform_admin?: boolean;
  name: string;
  email: string;
  phone: string;
  role: string;
  active: boolean;
  contractor_id: string | null;
  membership_version: number;
  password_pending: boolean;
  company_admin?: boolean;
  identity_verified_at?: string | null;
  identity_verified_by?: string | null;
  authenticator_enabled?: boolean;
  invitation_status?: Record<string, { status: string; error: string | null }>;
};
export type DocumentRow = {
  id: string;
  unit_id: string;
  contractor_id: string;
  kind: 'APR' | 'PT';
  number: string;
  title: string;
  location: string;
  starts_at: string;
  ends_at: string;
  apr_id: string | null;
  apr_version: number | null;
  version: number;
  status: string;
  data: DocumentInput['data'];
  updated_at: string;
  created_by: string;
  author: string;
};
export type Approval = {
  id: string;
  document_id: string;
  version: number;
  profile: string;
  user_id: string;
  user_name: string;
  decision: string | null;
  decided_at: string | null;
  comment: string | null;
  assignment_version: number;
};
export type WorkspaceData = {
  user: {
    id: string;
    name: string;
    email: string;
    platform_admin: boolean;
    session_expires_at: string;
  };
  units: Unit[];
  companies: Company[];
  registeredUnits: Pick<Unit, 'id' | 'company_id' | 'name' | 'kind' | 'region_id'>[];
  unit: Unit;
  documents: DocumentRow[];
  contractors: {
    id: string;
    name: string;
    cnpj: string;
    details?: Partial<ContractorDetails>;
    version: number;
  }[];
  companyPeople: { id: string; name: string; email: string; units: string[] }[];
  availableContractors?: { id: string; name: string; cnpj: string }[];
  unitQuota: { limit: number; used: number; version: number } | null;
  securityPolicy?: { required: boolean; version: number };
  authenticatorEnabled?: boolean;
  people: Person[];
  regions: { id: string; name: string }[];
  approvers: {
    id: string;
    user_id: string;
    unit_id: string | null;
    version: number;
    active: boolean;
    eligible: boolean;
    approver_contractor_id: string | null;
    kind: string;
    profile: string;
    user_name: string;
    region_id: string | null;
  }[];
  approvals: Approval[];
};
export const statuses: Record<string, string> = {
  rascunho: 'Rascunho',
  em_aprovacao: 'Em aprovação',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
};
export const dateLabel = (value: string) =>
  new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR');
export function asInput(d: DocumentRow): DocumentInput {
  return {
    id: d.id,
    unitId: d.unit_id,
    contractorId: d.contractor_id,
    kind: d.kind,
    title: d.title,
    location: d.location,
    startsAt: d.starts_at.slice(0, 10),
    endsAt: d.ends_at.slice(0, 10),
    aprId: d.apr_id,
    version: d.version,
    data: d.data,
  };
}
