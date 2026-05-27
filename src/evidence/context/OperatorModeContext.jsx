/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useCaseContext } from './CaseContext';

const OperatorModeContext = createContext(null);

const CASE_ROLE_RANK = {
  viewer: 10,
  client: 20,
  contributor: 30,
  lawyer: 40,
  admin: 50,
  owner: 60,
};

const PREVIEW_ROLES = ['viewer', 'client', 'contributor', 'lawyer', 'admin', 'owner'];

function readDebugDefault() {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem('evidence.debugMode') === 'true';
}

function readPreviewRole() {
  if (typeof window === 'undefined') {
    return '';
  }
  const params = new URLSearchParams(window.location.search);
  const roleFromUrl = params.get('preview_role');
  if (PREVIEW_ROLES.includes(roleFromUrl)) {
    return roleFromUrl;
  }
  const roleFromStorage = window.sessionStorage.getItem('evidence.previewRole') || '';
  return PREVIEW_ROLES.includes(roleFromStorage) ? roleFromStorage : '';
}

function rankForRole(role) {
  return CASE_ROLE_RANK[role || ''] || 0;
}

export function OperatorModeProvider({ children }) {
  const { activeCase } = useCaseContext();
  const [debugEnabled, setDebugEnabled] = useState(readDebugDefault);
  const [previewRole, setPreviewRoleState] = useState(readPreviewRole);

  const actualCaseRole = activeCase.role || 'viewer';
  const globalRole = activeCase.globalRole || 'member';
  const isRootAdmin = globalRole === 'root_admin';
  const isGlobalAdmin = globalRole === 'root_admin' || globalRole === 'admin';
  const effectiveCaseRole = isRootAdmin && previewRole ? previewRole : actualCaseRole;
  const isPreviewing = Boolean(isRootAdmin && previewRole);
  const effectiveRank = rankForRole(effectiveCaseRole);
  const canContribute = effectiveRank >= CASE_ROLE_RANK.contributor || isGlobalAdmin;
  const canManageCase = !isPreviewing && (isGlobalAdmin || rankForRole(actualCaseRole) >= CASE_ROLE_RANK.admin);
  const canSeeOperations = !isPreviewing && (isGlobalAdmin || rankForRole(actualCaseRole) >= CASE_ROLE_RANK.admin);
  const canSeeAdmin = !isPreviewing && isGlobalAdmin;

  const setDebugEnabledPersisted = useCallback((value) => {
    const next = Boolean(value);
    setDebugEnabled(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('evidence.debugMode', next ? 'true' : 'false');
    }
  }, []);

  const toggleDebug = useCallback(() => {
    setDebugEnabled((current) => {
      const next = !current;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('evidence.debugMode', next ? 'true' : 'false');
      }
      return next;
    });
  }, []);

  const setPreviewRole = useCallback((role) => {
    const normalized = PREVIEW_ROLES.includes(role) ? role : '';
    setPreviewRoleState(normalized);
    if (typeof window !== 'undefined') {
      if (normalized) {
        window.sessionStorage.setItem('evidence.previewRole', normalized);
      } else {
        window.sessionStorage.removeItem('evidence.previewRole');
      }
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;
      if (isTyping) {
        return;
      }
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        toggleDebug();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDebug]);

  const openPreviewTab = useCallback((role = 'contributor') => {
    if (!isRootAdmin || typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('preview_role', PREVIEW_ROLES.includes(role) ? role : 'contributor');
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  }, [isRootAdmin]);

  const value = useMemo(() => ({
    actualCaseRole,
    canContribute,
    canManageCase,
    canSeeAdmin,
    canSeeOperations,
    debugEnabled,
    effectiveCaseRole,
    globalRole,
    isGlobalAdmin,
    isPreviewing,
    isRootAdmin,
    openPreviewTab,
    previewRole: isRootAdmin ? previewRole : '',
    previewRoles: PREVIEW_ROLES,
    setDebugEnabled: setDebugEnabledPersisted,
    setPreviewRole,
    toggleDebug,
  }), [
    actualCaseRole,
    canContribute,
    canManageCase,
    canSeeAdmin,
    canSeeOperations,
    debugEnabled,
    effectiveCaseRole,
    globalRole,
    isGlobalAdmin,
    isPreviewing,
    isRootAdmin,
    openPreviewTab,
    previewRole,
    setDebugEnabledPersisted,
    setPreviewRole,
    toggleDebug,
  ]);

  return <OperatorModeContext.Provider value={value}>{children}</OperatorModeContext.Provider>;
}

export function useOperatorMode() {
  const value = useContext(OperatorModeContext);
  if (!value) {
    throw new Error('useOperatorMode must be used inside OperatorModeProvider.');
  }
  return value;
}
