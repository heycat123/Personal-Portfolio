import { Eye, ExternalLink, ShieldCheck, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import StatusBadge from './StatusBadge';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { useOperatorMode } from '../context/OperatorModeContext';

export default function CognitoViewDrawer() {
  const { user } = useEvidenceAuth();
  const {
    effectiveCaseRole,
    isPreviewing,
    openPreviewTab,
    previewRole,
    previewRoles,
    setPreviewRole,
  } = useOperatorMode();
  const { t } = useLocaleSettings();
  const [open, setOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState(previewRole || 'viewer');

  function applyRoleHere() {
    setPreviewRole(selectedRole || '');
    setOpen(false);
  }

  function exitPreview() {
    setPreviewRole('');
    setSelectedRole('viewer');
  }

  const drawer = open ? (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={t('Close Cognito view')}
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/50"
      />
      <div className="absolute bottom-0 right-0 top-0 flex w-screen max-w-full flex-col overflow-x-hidden border-l border-gray-200 bg-gray-50 shadow-2xl dark:border-gray-800 dark:bg-[#0b1117] sm:w-[92vw] sm:max-w-xl">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-[#101820]">
          <div className="flex min-w-0 items-center gap-2">
            <ShieldCheck className="shrink-0 text-amber-700 dark:text-amber-300" size={18} aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-950 dark:text-white">{t('Cognito View')}</div>
              <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                {t('Root-admin perspective tools')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-gray-300 p-2 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="h-full overflow-auto overflow-x-hidden p-3 sm:p-4">
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-amber-950 dark:text-amber-100">{t('View this case as another role')}</h3>
                <p className="mt-1 text-sm leading-6 text-amber-900 dark:text-amber-100/80">
                  {t('Role preview changes what the interface shows in this browser. It does not change your account, case data, or audit identity.')}
                </p>
              </div>
              <StatusBadge status={isPreviewing ? 'running' : 'configured'} label={isPreviewing ? t('Previewing {role}', { role: effectiveCaseRole }) : t('Root admin')} />
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-semibold uppercase tracking-normal text-amber-900 dark:text-amber-100/80">{t('Perspective')}</span>
              <select
                value={selectedRole}
                onChange={(event) => setSelectedRole(event.target.value)}
                className="mt-2 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-gray-950 outline-none focus:border-amber-500 dark:border-amber-800 dark:bg-[#101820] dark:text-gray-100"
              >
                {previewRoles.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyRoleHere}
                className="inline-flex items-center gap-2 rounded-md border border-amber-700 bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800"
              >
                <Eye size={15} aria-hidden="true" />
                {t('Apply here')}
              </button>
              <button
                type="button"
                onClick={() => openPreviewTab(selectedRole)}
                className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-[#101820] dark:text-amber-100 dark:hover:bg-amber-900/50"
              >
                <ExternalLink size={15} aria-hidden="true" />
                {t('Open new window')}
              </button>
              {isPreviewing ? (
                <button
                  type="button"
                  onClick={exitPreview}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
                >
                  {t('Exit preview')}
                </button>
              ) : null}
            </div>
          </section>

          <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="flex items-start gap-3">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-2 text-gray-700 dark:border-gray-800 dark:bg-[#0b1117] dark:text-gray-200">
                <UserRound size={18} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('View as another user')}</h3>
                <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
                  {t('User impersonation needs a backend-issued, audited support session before it can be enabled.')}
                </p>
                <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-[#0b1117] dark:text-gray-300">
                  {t('Current root account')}: <span className="font-semibold text-gray-950 dark:text-white">{user?.displayName || t('Evidence User')}</span>
                </div>
                <button
                  type="button"
                  disabled
                  className="mt-3 inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-400 dark:border-gray-800 dark:text-gray-500"
                >
                  {t('Select user')}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSelectedRole(previewRole || 'viewer');
          setOpen(true);
        }}
        title={t('Cognito View')}
        aria-label={t('Cognito View')}
        className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs font-semibold text-amber-950 transition-colors hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-900/50"
      >
        <ShieldCheck size={15} aria-hidden="true" />
        <span>{t('Cognito')}</span>
      </button>

      {drawer && typeof document !== 'undefined' ? createPortal(drawer, document.body) : drawer}
    </>
  );
}
