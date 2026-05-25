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
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useCaseContext } from '../context/CaseContext';

const NAV_ITEMS = [
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

export default function EvidenceSidebar() {
  const { activeCase } = useCaseContext();
  const basePath = `/evidence/cases/${activeCase.caseId}`;

  return (
    <aside className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-[#101820] lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="px-4 py-4 lg:px-5">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-[#0c1218]">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Database size={16} aria-hidden="true" />
            Evidence
          </div>
          <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">{activeCase.caseName}</p>
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto px-4 pb-4 lg:block lg:space-y-1 lg:overflow-visible lg:px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={`${basePath}/${item.path}`}
              className={({ isActive }) =>
                `flex min-w-fit items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-950'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                }`
              }
            >
              <Icon size={16} aria-hidden="true" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
