import { ArrowLeft, LogIn, Mail, Scale, ShieldCheck, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import ErrorPanel from '../components/ErrorPanel';
import EvidenceThemeToggle from '../components/EvidenceThemeToggle';
import PageHeader from '../components/PageHeader';
import { useLocaleSettings } from '../context/LocaleContext';
import { evidenceApi } from '../services/evidenceApi';
import { formatDateTime } from '../utils/formatters';

export default function InvitationSplashPage({ darkTheme, setDarkTheme }) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t } = useLocaleSettings();
  const inviteCode = searchParams.get('invite_code') || '';
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({
    loading: Boolean(inviteCode),
    error: inviteCode ? null : new Error('Invite code is missing from this link.'),
    invitation: null,
  });

  useEffect(() => {
    if (!inviteCode) {
      return;
    }
    let cancelled = false;
    evidenceApi.previewInvitation(inviteCode)
      .then((result) => {
        if (!cancelled) {
          setState({ loading: false, error: null, invitation: result.data?.invitation || null });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ loading: false, error, invitation: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [inviteCode, reloadKey]);

  const retry = () => {
    setState((current) => ({ ...current, loading: Boolean(inviteCode), error: null }));
    setReloadKey((current) => current + 1);
  };

  const loginState = { from: location, preferredView: 'sign-in', inviteCode };
  const signupState = { from: location, preferredView: 'sign-up', inviteCode };
  const inviter =
    state.invitation?.invited_by_display_name ||
    state.invitation?.invited_by_email_masked ||
    t('A case administrator');

  return (
    <main className="min-h-screen bg-gray-50 text-gray-950 dark:bg-[#0b1117] dark:text-gray-100">
      <header className="border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-[#101820]/95">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-md border border-gray-200 p-2 text-sky-700 dark:border-gray-700 dark:text-sky-300">
              <Scale size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-gray-950 dark:text-white">{t('Evidence AI')}</h1>
              <p className="truncate text-sm text-gray-600 dark:text-gray-400">{t('Case invitation')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/projects"
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t('Portfolio')}
            </Link>
            <EvidenceThemeToggle darkTheme={darkTheme} setDarkTheme={setDarkTheme} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader
          title="Case Invitation"
          description="Review the invitation before signing in or creating an account."
        />

        {state.loading ? (
          <EmptyState title="Loading invitation" description="Checking whether this invitation is still available." />
        ) : state.error ? (
          <ErrorPanel title="Invitation unavailable" error={state.error} onRetry={retry} />
        ) : (
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">
                <Mail size={24} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold uppercase text-sky-700 dark:text-sky-300">
                  {t('You were invited')}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-gray-950 dark:text-white">
                  {state.invitation?.case_name || t('Evidence case')}
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                  {inviter} {t('invited you to join this Evidence AI workspace.')}
                </p>

                <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                    <dt className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{t('Case role')}</dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">{state.invitation?.role || 'viewer'}</dd>
                  </div>
                  <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                    <dt className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{t('Sent to')}</dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">
                      {state.invitation?.invited_email_masked || t('the invited email address')}
                    </dd>
                  </div>
                  <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                    <dt className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{t('Workspace type')}</dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">{state.invitation?.workspace_type || 'case'}</dd>
                  </div>
                  <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                    <dt className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{t('Created')}</dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">
                      {state.invitation?.created_at ? formatDateTime(state.invitation.created_at) : t('pending')}
                    </dd>
                  </div>
                </dl>

                {state.invitation?.message ? (
                  <div className="mt-5 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-700 dark:border-gray-800 dark:bg-[#0b1117] dark:text-gray-300">
                    <div className="mb-1 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{t('Message')}</div>
                    {state.invitation.message}
                  </div>
                ) : null}

                <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                    <p>
                      {t('After sign in, this invitation link continues forward and the system will add the case to your account.')}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Link
                    to="/evidence/login"
                    state={loginState}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500"
                  >
                    <LogIn size={16} aria-hidden="true" />
                    {t('Sign in to accept')}
                  </Link>
                  <Link
                    to="/evidence/login"
                    state={signupState}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100 dark:hover:bg-white/10"
                  >
                    <UserPlus size={16} aria-hidden="true" />
                    {t('Create account')}
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
