/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { DEFAULT_EVIDENCE_CASE, EVIDENCE_CASES } from '../evidenceConfig';

const CaseContext = createContext(null);

function normalizeCase(item) {
  const caseId = item?.caseId || item?.case_id;
  if (!caseId) {
    return null;
  }
  return {
    tenantId: item.tenantId || item.tenant_id || DEFAULT_EVIDENCE_CASE.tenantId,
    organizationId: item.organizationId || item.organization_id || DEFAULT_EVIDENCE_CASE.organizationId,
    caseId,
    tenantName: item.tenantName || item.tenant_name || DEFAULT_EVIDENCE_CASE.tenantName,
    organizationName: item.organizationName || item.organization_name || DEFAULT_EVIDENCE_CASE.organizationName,
    caseName: item.caseName || item.case_name || caseId,
    workspaceType: item.workspaceType || item.workspace_type || null,
    matterType: item.matterType || item.matter_type || null,
    caseSubtype: item.caseSubtype || item.case_subtype || null,
    role: item.role || null,
    globalRole: item.globalRole || item.global_role || null,
    userStatus: item.userStatus || item.user_status || null,
    canRename: Boolean(item.canRename ?? item.can_rename),
    status: item.status || 'active',
    environment: item.environment,
  };
}

function mergeCases(currentCases, nextCases) {
  const merged = new Map(currentCases.map((item) => [item.caseId, item]));
  nextCases.map(normalizeCase).filter(Boolean).forEach((item) => {
    merged.set(item.caseId, { ...(merged.get(item.caseId) || {}), ...item });
  });
  return Array.from(merged.values());
}

export function CaseProvider({ children }) {
  const [activeCaseId, setActiveCaseIdState] = useState(DEFAULT_EVIDENCE_CASE.caseId);
  const [knownCases, setKnownCases] = useState(EVIDENCE_CASES);

  const setActiveCaseId = useCallback((caseId) => {
    const nextCase = knownCases.find((item) => item.caseId === caseId);
    if (nextCase) {
      setActiveCaseIdState(nextCase.caseId);
    }
  }, [knownCases]);

  const registerCases = useCallback((cases) => {
    setKnownCases((current) => mergeCases(current, cases || []));
  }, []);

  const value = useMemo(() => {
    const activeCase =
      knownCases.find((item) => item.caseId === activeCaseId) || knownCases[0] || DEFAULT_EVIDENCE_CASE;

    return {
      activeCase,
      activeCaseId: activeCase.caseId,
      cases: knownCases,
      defaultCaseId: DEFAULT_EVIDENCE_CASE.caseId,
      isKnownCase: (caseId) => knownCases.some((item) => item.caseId === caseId),
      registerCases,
      setActiveCaseId,
    };
  }, [activeCaseId, knownCases, registerCases, setActiveCaseId]);

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>;
}

export function useCaseContext() {
  const value = useContext(CaseContext);
  if (!value) {
    throw new Error('useCaseContext must be used inside CaseProvider.');
  }
  return value;
}
