import { ArrowLeft, LockKeyhole, LogIn, MailCheck, Scale, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import { useEvidenceAuth } from '../context/AuthContext';
import { useCaseContext } from '../context/CaseContext';

export default function LoginPage() {
  const location = useLocation();
  const { defaultCaseId } = useCaseContext();
  const {
    authMode,
    error,
    isAuthenticated,
    isConfigured,
    loading,
    confirmNewPassword,
    confirmSignUp,
    resendSignUpCode,
    signIn,
    signUp,
  } = useEvidenceAuth();
  const [view, setView] = useState('sign-in');
  const [form, setForm] = useState({
    identifier: '',
    email: '',
    displayName: '',
    password: '',
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [challengeStep, setChallengeStep] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const fallbackPath = `/evidence/cases/${defaultCaseId}/dashboard`;
  const destination = location.state?.from?.pathname || fallbackPath;

  if (!loading && isAuthenticated) {
    return <Navigate to={destination} replace />;
  }

  const cognitoNotConfigured = authMode === 'cognito' && !isConfigured;

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setNotice(null);
    try {
      const result = await signIn({ username: form.identifier, password: form.password });
      const nextStep = result?.nextStep?.signInStep;
      if (nextStep && nextStep !== 'DONE') {
        setChallengeStep(nextStep);
      }
    } catch (nextError) {
      setSubmitError(nextError);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignUpSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setNotice(null);
    try {
      await signUp({
        username: form.email,
        email: form.email,
        password: form.password,
        displayName: form.displayName,
      });
      setView('confirm-sign-up');
      setNotice('Confirmation code sent.');
    } catch (nextError) {
      setSubmitError(nextError);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmSignUpSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setNotice(null);
    try {
      await confirmSignUp({
        username: form.email,
        email: form.email,
        confirmationCode,
      });
      setView('sign-in');
      setConfirmationCode('');
      setForm((current) => ({ ...current, identifier: current.email, password: '' }));
      setNotice('Account confirmed. Sign in to continue.');
    } catch (nextError) {
      setSubmitError(nextError);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendCode() {
    setSubmitting(true);
    setSubmitError(null);
    setNotice(null);
    try {
      await resendSignUpCode({ username: form.email, email: form.email });
      setNotice('Confirmation code resent.');
    } catch (nextError) {
      setSubmitError(nextError);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNewPasswordSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      await confirmNewPassword({ newPassword });
      setChallengeStep(null);
      setNewPassword('');
    } catch (nextError) {
      setSubmitError(nextError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-950 dark:bg-[#0b1117] dark:text-gray-100">
      <header className="border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-[#101820]/95">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-md border border-gray-200 p-2 text-sky-700 dark:border-gray-700 dark:text-sky-300">
              <Scale size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-gray-950 dark:text-white">Evidence AI</h1>
              <p className="truncate text-sm text-gray-600 dark:text-gray-400">Legal evidence workspace</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/projects"
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Portfolio
            </Link>
            <button
              type="button"
              onClick={() => setView('sign-in')}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${
                view === 'sign-in'
                  ? 'bg-sky-700 text-white dark:bg-sky-600'
                  : 'border border-gray-200 text-gray-700 hover:bg-gray-100 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setView('sign-up')}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${
                view === 'sign-up'
                  ? 'bg-sky-700 text-white dark:bg-sky-600'
                  : 'border border-gray-200 text-gray-700 hover:bg-gray-100 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10'
              }`}
            >
              Create account
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 py-8">
        <PageHeader
          title={view === 'sign-up' ? 'Create Evidence Account' : view === 'confirm-sign-up' ? 'Confirm Evidence Account' : 'Evidence Sign In'}
          description="Sign in or create an account to access the Evidence AI workspace."
        />

        {error || submitError ? (
          <div className="mb-5">
            <ErrorPanel
              title={view === 'sign-up' ? 'Sign up unavailable' : view === 'confirm-sign-up' ? 'Account confirmation failed' : 'Sign in unavailable'}
              error={submitError || error}
            />
          </div>
        ) : null}
        {notice ? (
          <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
            {notice}
          </div>
        ) : null}

        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-md border border-gray-200 p-2 text-gray-600 dark:border-gray-700 dark:text-gray-300">
              <LockKeyhole size={18} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-semibold">Evidence Workspace</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">{authMode}</p>
            </div>
          </div>

          {cognitoNotConfigured ? (
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
              <p>Cognito mode is selected, but the frontend environment is missing required settings.</p>
              <div className="rounded-md bg-gray-100 p-3 font-mono text-xs text-gray-800 dark:bg-black/30 dark:text-gray-200">
                VITE_AWS_REGION
                <br />
                VITE_COGNITO_USER_POOL_ID
                <br />
                VITE_COGNITO_USER_POOL_CLIENT_ID
              </div>
            </div>
          ) : challengeStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' ? (
            <form className="space-y-4" onSubmit={handleNewPasswordSubmit}>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                This account requires a new permanent password before continuing.
              </p>
              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                />
              </label>
              <button
                type="submit"
                disabled={submitting || loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                <LogIn size={16} aria-hidden="true" />
                {submitting || loading ? 'Updating password' : 'Set password and sign in'}
              </button>
            </form>
          ) : view === 'confirm-sign-up' ? (
            <form className="space-y-4" onSubmit={handleConfirmSignUpSubmit}>
              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  autoComplete="email"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Confirmation code</span>
                <input
                  type="text"
                  value={confirmationCode}
                  onChange={(event) => setConfirmationCode(event.target.value)}
                  autoComplete="one-time-code"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                />
              </label>
              <button
                type="submit"
                disabled={submitting || loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                <MailCheck size={16} aria-hidden="true" />
                {submitting || loading ? 'Confirming' : 'Confirm account'}
              </button>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={submitting || loading}
                  className="font-semibold text-sky-700 hover:text-sky-900 disabled:cursor-not-allowed disabled:opacity-60 dark:text-sky-300 dark:hover:text-sky-100"
                >
                  Resend code
                </button>
                <button
                  type="button"
                  onClick={() => setView('sign-in')}
                  className="font-semibold text-gray-700 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white"
                >
                  Sign in
                </button>
              </div>
            </form>
          ) : view === 'sign-up' ? (
            <form className="space-y-4" onSubmit={handleSignUpSubmit}>
              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  autoComplete="email"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Display name</span>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                  autoComplete="name"
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Password</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                />
              </label>
              <button
                type="submit"
                disabled={submitting || loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                <UserPlus size={16} aria-hidden="true" />
                {submitting || loading ? 'Creating account' : 'Create account'}
              </button>
              <button
                type="button"
                onClick={() => setView('sign-in')}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-white/10"
              >
                Sign in instead
              </button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Email, username, or phone</span>
                <input
                  type="text"
                  value={form.identifier}
                  onChange={(event) => setForm((current) => ({ ...current, identifier: event.target.value }))}
                  autoComplete="username"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Password</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  autoComplete="current-password"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                />
              </label>
              <button
                type="submit"
                disabled={submitting || loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                <LogIn size={16} aria-hidden="true" />
                {submitting || loading ? 'Signing in' : 'Sign in'}
              </button>
              <button
                type="button"
                onClick={() => setView('sign-up')}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-white/10"
              >
                Create account
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
