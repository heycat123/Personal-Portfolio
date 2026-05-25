import { LogOut, RefreshCw, Shield, UserCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import AxiomHelpDrawer from '../components/AxiomHelpDrawer';
import EvidenceThemeToggle from '../components/EvidenceThemeToggle';
import StatusBadge from '../components/StatusBadge';
import SupportFeedbackDrawer from '../components/SupportFeedbackDrawer';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useCaseContext } from '../context/CaseContext';
import { EVIDENCE_API_BASE_URL, EVIDENCE_ENVIRONMENT_LABEL } from '../evidenceConfig';
import { formatDateTime } from '../utils/formatters';

export default function EvidenceTopbar({ darkTheme, setDarkTheme }) {
  const { status, latestFingerprint, checkApiHealth } = useApiStatus();
  const { user, authMode, signOut } = useEvidenceAuth();
  const { activeCase } = useCaseContext();

  return (
    <header className="border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-[#101820]/95 lg:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-gray-950 dark:text-white">Evidence Control Plane</h1>
            <StatusBadge status={activeCase.status} />
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {activeCase.tenantName} / {activeCase.caseName}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="rounded-md border border-gray-200 px-3 py-2 text-gray-700 dark:border-gray-800 dark:text-gray-300">
            {EVIDENCE_ENVIRONMENT_LABEL}
          </div>
          <div className="hidden max-w-xs truncate rounded-md border border-gray-200 px-3 py-2 text-gray-700 dark:border-gray-800 dark:text-gray-300 md:block">
            {EVIDENCE_API_BASE_URL}
          </div>
          <StatusBadge status={status.state} />
          <AxiomHelpDrawer />
          <SupportFeedbackDrawer />
          <EvidenceThemeToggle darkTheme={darkTheme} setDarkTheme={setDarkTheme} />
          <button
            type="button"
            onClick={checkApiHealth}
            title="Refresh API health"
            aria-label="Refresh API health"
            className="rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-gray-700 dark:border-gray-800 dark:text-gray-300">
            <Shield size={16} aria-hidden="true" />
            <span>{user?.displayName || 'Evidence User'}</span>
            <span className="text-xs text-gray-500">({authMode})</span>
          </div>
          <Link
            to="/evidence/account"
            title="Account settings"
            aria-label="Account settings"
            className="rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <UserCircle size={16} aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={signOut}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-500">
        {status.checkedAt ? <span>API checked {formatDateTime(status.checkedAt)}</span> : null}
        {latestFingerprint ? <span>Last fingerprint {latestFingerprint.id}</span> : null}
      </div>
    </header>
  );
}
