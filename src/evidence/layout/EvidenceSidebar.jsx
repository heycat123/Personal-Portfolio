import {
  Activity,
  Briefcase,
  ClipboardCheck,
  ContactRound,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  PackageCheck,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCircle,
  X,
} from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { useEvidenceAuth } from '../context/AuthContext';
import { useCaseContext } from '../context/CaseContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { evidenceCasePath } from '../utils/caseRouting';

const NAV_ITEMS = [
  { group: 'Workspace', label: 'My Cases', to: '/evidence/cases', icon: Briefcase },
  { group: 'Workspace', label: 'Case Home', path: 'dashboard', icon: LayoutDashboard },
  { group: 'Workspace', label: 'Documents', path: 'documents', icon: FileText },
  { group: 'Workspace', label: 'Ask Documents', path: 'query', icon: MessageSquare },
  { group: 'Review', label: 'Document categories', path: 'document-categories', icon: ClipboardCheck, requiresContribute: true },
  { group: 'Review', label: 'People & Contacts', path: 'entities', icon: ContactRound, requiresContribute: true },
  { group: 'Review', label: 'Packets', path: 'packets', icon: PackageCheck },
  { group: 'Sharing', label: 'Sharing & Lawyer Access', path: 'access', icon: ShieldCheck, requiresAccessManagement: true },
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
  const { canContribute, canManageAccess, canSeeAdmin, canSeeOperations, isPreviewing, effectiveCaseRole } = useOperatorMode();
  const basePath = evidenceCasePath(activeCase);
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.requiresAdmin) {
      return canSeeAdmin;
    }
    if (item.requiresOperations) {
      return canSeeOperations;
    }
    if (item.requiresAccessManagement) {
      return canManageAccess;
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
  const groupOrder = ['Workspace', 'Review', 'Sharing', 'Operations'];

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
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col border-r border-[var(--lakai-border-soft)] bg-[var(--lakai-surface)] text-[var(--lakai-text)] shadow-2xl transition-transform duration-200 lg:static lg:z-auto lg:h-full lg:min-h-0 lg:w-64 lg:shrink-0 lg:translate-x-0 lg:shadow-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
      <div className="flex items-start gap-3 px-4 py-4 lg:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--lakai-primary)] text-[var(--lakai-primary-text)] shadow-sm">
              <Sparkles size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-serif text-2xl font-semibold leading-7 text-[var(--lakai-primary-strong)] dark:text-[var(--lakai-primary-strong)]">
                {t('Lak.ai')}
              </div>
              <p className="truncate text-xs font-medium text-[var(--lakai-text-muted)]">
                {t('Family law sanctuary')}
              </p>
            </div>
          </div>
          <p className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--lakai-text-muted)]">{activeCase.caseName}</p>
          {isPreviewing ? (
            <p className="mt-2 rounded-md bg-[var(--lakai-review-soft)] px-2 py-1 text-xs font-semibold text-[var(--lakai-review)]">
              {t('Previewing {role}', { role: effectiveCaseRole })}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-md border border-[var(--lakai-border-soft)] p-2 text-[var(--lakai-text-muted)] hover:bg-[var(--lakai-surface-muted)] hover:text-[var(--lakai-text)] lg:hidden"
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
              <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-normal text-[var(--lakai-text-muted)]">
                {t(group)}
              </div>
              <div className="space-y-1">
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
                            ? 'bg-[var(--lakai-primary)] text-[var(--lakai-primary-text)] shadow-sm'
                            : 'text-[var(--lakai-text-muted)] hover:bg-[var(--lakai-surface-muted)] hover:text-[var(--lakai-text)]'
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
      <div className="border-t border-[var(--lakai-border-soft)] p-3">
        <Link
          to={`${basePath}/settings`}
          onClick={onClose}
          className="mb-2 flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--lakai-border-soft)] px-3 py-2 text-sm font-semibold text-[var(--lakai-text-muted)] hover:bg-[var(--lakai-surface-muted)] hover:text-[var(--lakai-text)]"
        >
          <Settings size={16} aria-hidden="true" />
          {t('Case Settings')}
        </Link>
        <div className="mb-2 rounded-md border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface-muted)] px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--lakai-text)]">
            <UserCircle size={16} aria-hidden="true" />
            <span className="truncate">{user?.displayName || t('Evidence User')}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/evidence/account"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--lakai-border-soft)] px-3 py-2 text-sm font-semibold text-[var(--lakai-text-muted)] hover:bg-[var(--lakai-surface-muted)] hover:text-[var(--lakai-text)]"
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
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--lakai-border-soft)] px-3 py-2 text-sm font-semibold text-[var(--lakai-text-muted)] hover:bg-[var(--lakai-surface-muted)] hover:text-[var(--lakai-text)]"
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
