/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { evidenceApi } from '../services/evidenceApi';
import { useEvidenceAuth } from './AuthContext';

const ApiStatusContext = createContext(null);

export function ApiStatusProvider({ children }) {
  const { getAccessToken } = useEvidenceAuth();
  const [status, setStatus] = useState({
    state: 'checking',
    checkedAt: null,
    health: null,
    error: null,
  });
  const [fingerprints, setFingerprints] = useState([]);

  const recordFingerprint = useCallback((result, label = 'Evidence API request') => {
    const requestFingerprintId = result?.requestFingerprintId;
    if (!requestFingerprintId) {
      return;
    }

    setFingerprints((current) => [
      {
        id: requestFingerprintId,
        correlationId: result.correlationId || null,
        label,
        capturedAt: new Date().toISOString(),
      },
      ...current.filter((item) => item.id !== requestFingerprintId),
    ].slice(0, 10));
  }, []);

  const checkApiHealth = useCallback(async () => {
    setStatus((current) => ({ ...current, state: 'checking', error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getHealth({ token });
      recordFingerprint(result, 'API health');
      setStatus({
        state: result.data?.ok ? 'online' : 'degraded',
        checkedAt: new Date().toISOString(),
        health: result.data,
        error: null,
      });
      return result;
    } catch (error) {
      setStatus({
        state: 'offline',
        checkedAt: new Date().toISOString(),
        health: null,
        error,
      });
      return null;
    }
  }, [getAccessToken, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      checkApiHealth();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [checkApiHealth]);

  const value = useMemo(
    () => ({
      status,
      fingerprints,
      latestFingerprint: fingerprints[0] || null,
      checkApiHealth,
      recordFingerprint,
    }),
    [checkApiHealth, fingerprints, recordFingerprint, status],
  );

  return <ApiStatusContext.Provider value={value}>{children}</ApiStatusContext.Provider>;
}

export function useApiStatus() {
  const value = useContext(ApiStatusContext);
  if (!value) {
    throw new Error('useApiStatus must be used inside ApiStatusProvider.');
  }
  return value;
}
