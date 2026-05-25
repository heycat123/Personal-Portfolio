import { Outlet } from 'react-router-dom';
import { useApiStatus } from '../context/ApiStatusContext';
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
  const apiVersion = status.health?.version || 'unknown';

  return (
    <div className="fixed bottom-2 left-2 z-40 rounded-md border border-gray-200 bg-white/95 px-2 py-1 text-[11px] font-semibold text-gray-500 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-[#101820]/95 dark:text-gray-400">
      site {shortVersion(EVIDENCE_SITE_VERSION)} · api {apiVersion}
    </div>
  );
}

export default function EvidenceLayout({ darkTheme, setDarkTheme }) {
  return (
    <section className="min-h-screen bg-[#f6f7f9] text-gray-900 dark:bg-[#0b0f14] dark:text-gray-100">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <EvidenceSidebar />
        <div className="min-w-0 flex-1">
          <EvidenceTopbar darkTheme={darkTheme} setDarkTheme={setDarkTheme} />
          <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
            <Outlet />
          </div>
        </div>
      </div>
      <EvidenceVersionBadge />
    </section>
  );
}
