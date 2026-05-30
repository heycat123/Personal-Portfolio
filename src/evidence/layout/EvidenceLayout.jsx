import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { useApiStatus } from '../context/ApiStatusContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { EVIDENCE_SITE_VERSION } from '../evidenceConfig';
import EvidenceSidebar from './EvidenceSidebar';
import EvidenceTopbar from './EvidenceTopbar';

function shortVersion(value) {
  if (!value) {
    return 'unknown';
  }
  return value.length > 12 ? value.slice(0, 7) : value;
}

function EvidenceVersionBadge() {
  const { status } = useApiStatus();
  const { canSeeOperations, debugEnabled } = useOperatorMode();
  const apiVersion = status.health?.version || 'unknown';

  if (!canSeeOperations && !debugEnabled) {
    return null;
  }

  return (
    <div className="fixed bottom-2 left-2 z-40 rounded-md border border-gray-200 bg-white/95 px-2 py-1 text-[11px] font-semibold text-gray-500 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-[#101820]/95 dark:text-gray-400">
      web build {shortVersion(EVIDENCE_SITE_VERSION)} | api {shortVersion(apiVersion)}
    </div>
  );
}

export default function EvidenceLayout({ darkTheme, setDarkTheme }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <section className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#f6f7f9] text-gray-900 dark:bg-[#0b0f14] dark:text-gray-100">
      <div className="flex min-h-screen w-full max-w-full flex-col overflow-x-hidden lg:flex-row">
        <EvidenceSidebar open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
        <div className="min-w-0 max-w-full flex-1 overflow-x-hidden">
          <EvidenceTopbar
            darkTheme={darkTheme}
            setDarkTheme={setDarkTheme}
            onOpenMenu={() => setMobileMenuOpen(true)}
          />
          <div className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
            <Outlet />
          </div>
        </div>
      </div>
      <EvidenceVersionBadge />
    </section>
  );
}
