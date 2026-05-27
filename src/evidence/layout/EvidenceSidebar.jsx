import {
  Activity,
  Briefcase,
  ClipboardCheck,
  Database,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Network,
  Search,
  Settings,
  ShieldCheck,
  LifeBuoy,
  Upload,
  X,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useCaseContext } from '../context/CaseContext';
import { useLocaleSettings } from '../context/LocaleContext';

const NAV_ITEMS = [
  { label: 'My Cases', to: '/evidence/cases', icon: Briefcase },
  { label: 'Dashboard', path: 'dashboard', icon: LayoutDashboard },
  { label: 'Documents', path: 'documents', icon: FileText },
  { label: 'Intake', path: 'intake', icon: Upload },
  { label: 'Jobs', path: 'jobs', icon: Briefcase },
  { label: 'Query', path: 'query', icon: MessageSquare },
  { label: 'System Query', path: 'system-query', icon: Search },
  { label: 'Health', path: 'health', icon: Activity },
  { label: 'Entities', path: 'entities', icon: Network },
  { label: 'Tests', path: 'tests', icon: ClipboardCheck },
  { label: 'Settings', path: 'settings', icon: Settings },
  { label: 'Support', path: 'support', icon: LifeBuoy },
  { label: 'Admin', path: 'admin', icon: ShieldCheck },
];

export default function EvidenceSidebar({ open = false, onClose }) {
  const { activeCase } = useCaseContext();
  const { t } = useLocaleSettings();
  const basePath = `/evidence/cases/${activeCase.caseId}`;

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label={t('Close navigation')}
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col border-r border-gray-200 bg-white shadow-2xl transition-transform duration-200 dark:border-gray-800 dark:bg-[#101820] lg:static lg:z-auto lg:min-h-screen lg:w-64 lg:shrink-0 lg:translate-x-0 lg:shadow-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
      <div className="flex items-start gap-3 px-4 py-4 lg:px-5">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-[#0c1218]">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Database size={16} aria-hidden="true" />
            {t('Evidence')}
          </div>
          <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">{activeCase.caseName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-md border border-gray-200 p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-950 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white lg:hidden"
          aria-label={t('Close navigation')}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to || item.path}
              to={item.to || `${basePath}/${item.path}`}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-950'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                }`
              }
            >
              <Icon size={16} aria-hidden="true" />
              {t(item.label)}
            </NavLink>
          );
        })}
      </nav>
    </aside>
    </>
  );
}
