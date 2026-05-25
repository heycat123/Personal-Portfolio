import packageJson from '../../package.json';

export const EVIDENCE_API_BASE_URL = (
  import.meta.env.VITE_EVIDENCE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '/evidence-api')
).replace(/\/$/, '');

export const EVIDENCE_SITE_VERSION =
  import.meta.env.VITE_EVIDENCE_SITE_VERSION || packageJson.version || 'local';

export const EVIDENCE_ENVIRONMENT_LABEL =
  import.meta.env.VITE_EVIDENCE_ENVIRONMENT || 'local tunnel';

export const DEFAULT_EVIDENCE_CASE = {
  tenantId: 'forest-personal',
  organizationId: 'forest-lee-personal',
  caseId: 'relocation-hague-family-law',
  tenantName: 'Forest Personal',
  organizationName: 'Forest Lee Personal',
  caseName: 'Relocation / Hague / Family Law',
  status: 'active',
};

export const EVIDENCE_CASES = [DEFAULT_EVIDENCE_CASE];
