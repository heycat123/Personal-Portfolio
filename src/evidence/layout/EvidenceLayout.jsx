import { Outlet, useLocation, useParams } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { EVIDENCE_SITE_VERSION } from '../evidenceConfig';
import { evidenceApi } from '../services/evidenceApi';
import EvidenceSidebar from './EvidenceSidebar';
import EvidenceTopbar from './EvidenceTopbar';

function shortVersion(value) {
  if (!value) {
    return 'unknown';
  }
  return String(value).replace(/\b[0-9a-f]{40}\b/gi, (match) => match.slice(0, 7));
}

function EvidenceVersionBadge() {
  const { status } = useApiStatus();
  const { canSeeOperations, debugEnabled } = useOperatorMode();
  const apiVersion = status.health?.version || 'unknown';

  if (!canSeeOperations && !debugEnabled) {
    return null;
  }

  return (
    <div className="fixed bottom-2 right-2 z-40 hidden rounded-md border border-gray-200 bg-white/95 px-2 py-1 text-[11px] font-semibold text-gray-500 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-[#101820]/95 dark:text-gray-400 lg:block">
      web {shortVersion(EVIDENCE_SITE_VERSION)} | api {shortVersion(apiVersion)}
    </div>
  );
}

const EMPTY_JOBS_NAV_ALERT = {
  failedCount: 0,
  label: '',
};

function jobsNavAlertFromPayload(payload) {
  const alert = payload?.jobs_page_contract?.failed_jobs_alert || {};
  const rawCount = alert.count ?? alert.failed_job_count ?? 0;
  const failedCount = Number(rawCount);
  return {
    failedCount: Number.isFinite(failedCount) && failedCount > 0 ? failedCount : 0,
    label: alert.label || 'failed processing job(s) need attention',
  };
}

export default function EvidenceLayout({ darkTheme, setDarkTheme }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [jobsNavAlert, setJobsNavAlert] = useState(EMPTY_JOBS_NAV_ALERT);
  const location = useLocation();
  const { caseId } = useParams();
  const { getAccessToken, isAuthenticated, loading: authLoading } = useEvidenceAuth();
  const { canSeeOperations } = useOperatorMode();
  const isAskDocumentsRoute = /\/evidence\/cases\/[^/]+\/query(?:\/|$)/.test(location.pathname);

  useEffect(() => {
    document.documentElement.classList.add('evidence-viewport-lock');
    return () => {
      document.documentElement.classList.remove('evidence-viewport-lock');
    };
  }, []);

  const loadJobsNavAlert = useCallback(async () => {
    if (!caseId || !canSeeOperations || authLoading || !isAuthenticated) {
      setJobsNavAlert(EMPTY_JOBS_NAV_ALERT);
      return;
    }

    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getJobs(caseId, { limit: 1, offset: 0 }, { token });
      setJobsNavAlert(jobsNavAlertFromPayload(result.data));
    } catch {
      setJobsNavAlert(EMPTY_JOBS_NAV_ALERT);
    }
  }, [authLoading, canSeeOperations, caseId, getAccessToken, isAuthenticated]);

  useEffect(() => {
    const initialTimerId = window.setTimeout(loadJobsNavAlert, 0);

    if (!caseId || !canSeeOperations || authLoading || !isAuthenticated) {
      return () => window.clearTimeout(initialTimerId);
    }

    const intervalId = window.setInterval(() => {
      loadJobsNavAlert();
    }, 60000);
    const handleFocus = () => loadJobsNavAlert();
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearTimeout(initialTimerId);
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [authLoading, canSeeOperations, caseId, isAuthenticated, loadJobsNavAlert]);

  return (
    <section className="lakai-evidence h-dvh w-full max-w-full overflow-hidden bg-[var(--lakai-bg)] text-[var(--lakai-text)]">
      <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden lg:flex-row">
        <EvidenceSidebar
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          jobsAttentionCount={jobsNavAlert.failedCount}
          jobsAttentionLabel={jobsNavAlert.label}
        />
        <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden">
          <div className={isAskDocumentsRoute ? 'hidden lg:block' : ''}>
            <EvidenceTopbar
              darkTheme={darkTheme}
              setDarkTheme={setDarkTheme}
              onOpenMenu={() => setMobileMenuOpen(true)}
            />
          </div>
          <div className={`min-h-0 flex-1 overflow-x-hidden overscroll-contain ${isAskDocumentsRoute ? 'overflow-hidden' : 'overflow-y-auto'}`}>
            <div className={`${isAskDocumentsRoute ? 'h-full max-w-none px-0 py-0' : 'mx-auto max-w-7xl px-3 py-4 sm:px-4 lg:px-6 lg:py-6'} w-full min-w-0`}>
              <Outlet context={{ openMobileMenu: () => setMobileMenuOpen(true) }} />
            </div>
          </div>
        </div>
      </div>
      <EvidenceVersionBadge />
    </section>
  );
}
