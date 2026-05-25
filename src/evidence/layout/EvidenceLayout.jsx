import { Outlet } from 'react-router-dom';
import EvidenceSidebar from './EvidenceSidebar';
import EvidenceTopbar from './EvidenceTopbar';

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
    </section>
  );
}
