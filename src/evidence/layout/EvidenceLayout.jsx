import { Outlet, useLocation } from 'react-router-dom';
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

export default function EvidenceLayout({ darkTheme, setDarkTheme }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const isAskDocumentsRoute = /\/evidence\/cases\/[^/]+\/query(?:\/|$)/.test(location.pathname);

  return (
    <section className="lakai-evidence h-dvh w-full max-w-full overflow-hidden bg-[var(--lakai-bg)] text-[var(--lakai-text)]">
      <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden lg:flex-row">
        <EvidenceSidebar open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
        <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden">
          <div className={isAskDocumentsRoute ? 'hidden lg:block' : ''}>
            <EvidenceTopbar
              darkTheme={darkTheme}
              setDarkTheme={setDarkTheme}
              onOpenMenu={() => setMobileMenuOpen(true)}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
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
