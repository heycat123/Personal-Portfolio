import { useCallback, useEffect, useRef, useState } from 'react';
import { useEvidenceAuth } from '../context/AuthContext';
import { evidenceApi } from '../services/evidenceApi';

const ACTIVE_STATUSES = new Set(['queued', 'running', 'cancelling']);
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

export function isActiveJob(job) {
  return ACTIVE_STATUSES.has(job?.status);
}

export default function useJobStatusPolling({
  caseId,
  enabled = true,
  intervalMs = 5000,
  limit = 50,
  runImmediately = true,
  onJobsChange,
  onJobFinished,
} = {}) {
  const { getAccessToken } = useEvidenceAuth();
  const previousStatusesRef = useRef(new Map());
  const mountedRef = useRef(false);
  const inFlightRef = useRef(false);
  const [state, setState] = useState({
    jobs: [],
    activeCount: 0,
    lastFinishedJob: null,
    error: null,
    fingerprint: null,
  });

  const poll = useCallback(async () => {
    if (!enabled || !caseId) {
      return null;
    }
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return null;
    }
    if (inFlightRef.current) {
      return null;
    }

    try {
      inFlightRef.current = true;
      const token = await getAccessToken();
      const result = await evidenceApi.getJobs(caseId, { limit, offset: 0 }, { token });
      const jobs = result.data?.jobs || [];
      const previousStatuses = previousStatusesRef.current;
      const finishedJobs = jobs.filter((job) => {
        const previousStatus = previousStatuses.get(job.job_id);
        return ACTIVE_STATUSES.has(previousStatus) && TERMINAL_STATUSES.has(job.status);
      });

      previousStatusesRef.current = new Map(jobs.map((job) => [job.job_id, job.status]));

      if (mountedRef.current) {
        setState({
          jobs,
          activeCount: jobs.filter(isActiveJob).length,
          lastFinishedJob: finishedJobs[0] || null,
          error: null,
          fingerprint: {
            id: result.requestFingerprintId,
            correlationId: result.correlationId,
          },
        });
      }

      onJobsChange?.(jobs, result.data, result);
      finishedJobs.forEach((job) => onJobFinished?.(job, previousStatuses.get(job.job_id)));
      return result;
    } catch (error) {
      if (mountedRef.current) {
        setState((current) => ({ ...current, error }));
      }
      return null;
    } finally {
      inFlightRef.current = false;
    }
  }, [caseId, enabled, getAccessToken, limit, onJobFinished, onJobsChange]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled || !caseId) {
      return () => {
        mountedRef.current = false;
      };
    }

    if (runImmediately) {
      void poll();
    }
    const timerId = window.setInterval(() => {
      void poll();
    }, intervalMs);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void poll();
      }
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timerId);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [caseId, enabled, intervalMs, poll, runImmediately]);

  return {
    ...state,
    refresh: poll,
  };
}
