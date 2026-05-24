/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { DEFAULT_EVIDENCE_CASE, EVIDENCE_CASES } from '../evidenceConfig';

const CaseContext = createContext(null);

export function CaseProvider({ children }) {
  const [activeCaseId, setActiveCaseIdState] = useState(DEFAULT_EVIDENCE_CASE.caseId);

  const setActiveCaseId = useCallback((caseId) => {
    const nextCase = EVIDENCE_CASES.find((item) => item.caseId === caseId);
    if (nextCase) {
      setActiveCaseIdState(nextCase.caseId);
    }
  }, []);

  const value = useMemo(() => {
    const activeCase =
      EVIDENCE_CASES.find((item) => item.caseId === activeCaseId) || DEFAULT_EVIDENCE_CASE;

    return {
      activeCase,
      activeCaseId: activeCase.caseId,
      cases: EVIDENCE_CASES,
      defaultCaseId: DEFAULT_EVIDENCE_CASE.caseId,
      isKnownCase: (caseId) => EVIDENCE_CASES.some((item) => item.caseId === caseId),
      setActiveCaseId,
    };
  }, [activeCaseId, setActiveCaseId]);

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>;
}

export function useCaseContext() {
  const value = useContext(CaseContext);
  if (!value) {
    throw new Error('useCaseContext must be used inside CaseProvider.');
  }
  return value;
}
