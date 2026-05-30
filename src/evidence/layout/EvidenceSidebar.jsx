import {
  Activity,
  Briefcase,
  ClipboardCheck,
  Database,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Network,
  Search,
  Settings,
  ShieldCheck,
  UserCircle,
  LifeBuoy,
  Upload,
  X,
} from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import AxiomHelpDrawer from '../components/AxiomHelpDrawer';
import SupportFeedbackDrawer from '../components/SupportFeedbackDrawer';
import { useEvidenceAuth } from '../context/AuthContext';
import { useCaseContext } from '../context/CaseContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { evidenceCasePath } from '../utils/caseRouting';

const NAV_ITEMS = [
  { group: 'Workspace', label: 'Dashboard', path: 'dashboard', icon: LayoutDashboard },
  { group: 'Workspace', label: 'Documents', path: 'documents', icon: FileText },
  { group: 'Workspace', label: 'Query', path: 'query', icon: MessageSquare },
  { group: 'Workspace', label: 'Add Documents', path: 'intake', icon: Upload, requiresContribute: true },
  { group: 'Workspace', label: 'Settings', path: 'settings', icon: Settings },
  { group: 'Help', label: 'Support Records', path: 'support', icon: LifeBuoy },
  { group: 'Review', label: 'Entities', path: 'entities', icon: Network, requiresOperations: true },
  { group: 'Operations', label: 'Jobs', path: 'jobs', icon: Briefcase, requiresOperations: true },
  { group: 'Operations', label: 'System Query', path: 'system-query', icon: Search, requiresOperations: true },
  { group: 'Operations', label: 'Health', path: 'health', icon: Activity, requiresOperations: true },
  { group: 'Operations', label: 'Tests', path: 'tests', icon: ClipboardCheck, requiresOperations: true },
  { group: 'Operations', label: 'Admin', path: 'admin', icon: ShieldCheck, requiresAdmin: true },
];

export default function EvidenceSidebar({ open = false, onClose }) {
  const { activeCase } = useCaseContext();
  const { signOut, user } = useEvidenceAuth();
  const { t } = useLocaleSettings();
  const { canContribute, canSeeAdmin, canSeeOperations, isPreviewing, effectiveCaseRole } = useOperatorMode();
  const basePath = evidenceCasePath(activeCase);
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.requiresAdmin) {
      return canSeeAdmin;
    }
    if (item.requiresOperations) {
      return canSeeOperations;
    }
    if (item.requiresContribute) {
      return canContribute;
    }
    return true;
  });
  const groupedItems = visibleItems.reduce((groups, item) => {
    const group = item.group || 'Workspace';
    return {
      ...groups,
      [group]: [...(groups[group] || []), item],
    };
  }, {});
  const groupOrder = ['Workspace', 'Review', 'Operations', 'Help'];

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
        <div className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-[#0c1218]">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Database size={16} aria-hidden="true" />
            {t('Evidence')}
          </div>
          <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">{activeCase.caseName}</p>
          <Link
            to="/evidence/cases"
            onClick={onClose}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-950 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-200 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <Briefcase size={15} aria-hidden="true" />
            {t('My Cases')}
          </Link>
          {isPreviewing ? (
            <p className="mt-2 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {t('Previewing {role}', { role: effectiveCaseRole })}
            </p>
          ) : null}
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

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groupOrder.map((group) => {
          const items = groupedItems[group] || [];
          if (!items.length) {
            return null;
          }
          return (
            <div key={group}>
              <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-500">
                {t(group)}
              </div>
              <div className="space-y-1">
                {group === 'Help' ? (
                  <>
                    <AxiomHelpDrawer trigger="sidebar" onOpen={onClose} />
                    <SupportFeedbackDrawer trigger="sidebar" onOpen={onClose} />
                  </>
                ) : null}
                {items.map((item) => {
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
              </div>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-gray-200 p-3 dark:border-gray-800">
        <div className="mb-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-[#0b1117]">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white">
            <UserCircle size={16} aria-hidden="true" />
            <span className="truncate">{user?.displayName || t('Evidence User')}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/evidence/account"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-950 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <UserCircle size={16} aria-hidden="true" />
            {t('Account')}
          </Link>
          <button
            type="button"
            onClick={() => {
              onClose?.();
              signOut();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-950 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <LogOut size={16} aria-hidden="true" />
            {t('Sign out')}
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
