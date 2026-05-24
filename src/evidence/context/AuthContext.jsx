/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const value = useMemo(
    () => ({
      authMode: 'phase7-local',
      isAuthenticated: true,
      user: {
        displayName: 'Evidence Operator',
        email: null,
      },
      getAccessToken: async () => null,
      signOut: async () => undefined,
    }),
    [],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useEvidenceAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useEvidenceAuth must be used inside AuthProvider.');
  }
  return value;
}
