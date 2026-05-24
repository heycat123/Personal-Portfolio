import { LockKeyhole, LogIn } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
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
    signIn,
  } = useEvidenceAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [submitError, setSubmitError] = useState(null);
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
    try {
      await signIn(form);
    } catch (nextError) {
      setSubmitError(nextError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-950 dark:bg-[#0b1117] dark:text-gray-100">
      <div className="mx-auto max-w-md">
        <PageHeader
          title="Evidence Sign In"
          description="Access to the evidence control plane requires an authenticated session."
        />

        {error || submitError ? (
          <div className="mb-5">
            <ErrorPanel title="Sign in unavailable" error={submitError || error} />
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
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
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
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
