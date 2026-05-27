import { ArrowRight, Briefcase, CheckCircle2, FolderPlus, Mail } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { useEvidenceAuth } from '../context/AuthContext';
import { useCaseContext } from '../context/CaseContext';
import { evidenceApi } from '../services/evidenceApi';

function caseName(item) {
  return item.caseName || item.case_name || item.caseId || item.case_id;
}

function caseId(item) {
  return item.caseId || item.case_id;
}

export default function CaseSelectorPage() {
  const navigate = useNavigate();
  const { getAccessToken } = useEvidenceAuth();
  const { registerCases } = useCaseContext();
  const [state, setState] = useState({
    loading: true,
    saving: false,
    error: null,
    cases: [],
    pendingInvitations: [],
  });

  const loadCases = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getCases({ token });
      const cases = result.data?.cases || [];
      registerCases(cases);
      setState({
        loading: false,
        saving: false,
        error: null,
        cases,
        pendingInvitations: result.data?.pending_invitations || [],
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, [getAccessToken, registerCases]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const acceptInvitation = useCallback(async (inviteCode) => {
    const code = String(inviteCode || '').trim();
    if (!code) {
      return;
    }
    setState((current) => ({ ...current, saving: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.acceptInvitation({ invite_code: code }, { token });
      const casesResult = await evidenceApi.getCases({ token });
      const cases = casesResult.data?.cases || [];
      registerCases(cases);
      navigate(`/evidence/cases/${encodeURIComponent(result.data.case_id)}/dashboard`, { replace: true });
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    }
  }, [getAccessToken, navigate, registerCases]);

  return (
    <div>
      <PageHeader
        title="My Cases"
        description="Choose a case or start onboarding if this account does not have access to a workspace yet."
        actions={
          <Link
            to="/evidence/onboarding"
            className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            <FolderPlus size={16} aria-hidden="true" />
            Start onboarding
          </Link>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadCases} /></div> : null}

      {state.pendingInvitations.length ? (
        <section className="mb-5 rounded-lg border border-sky-200 bg-sky-50 p-5 dark:border-sky-900/60 dark:bg-sky-950/30">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-md border border-sky-200 bg-white p-2 text-sky-700 dark:border-sky-900 dark:bg-[#0b1117] dark:text-sky-300">
              <Mail size={18} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-950 dark:text-white">Pending Invitations</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                These are cases you were invited to. Accepting one links it to this account.
              </p>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {state.pendingInvitations.map((invitation) => (
              <div key={invitation.invitation_id} className="rounded-md border border-sky-200 bg-white p-3 dark:border-sky-900/60 dark:bg-[#101820]">
                <div className="font-semibold text-gray-950 dark:text-white">{invitation.case_name || invitation.case_id}</div>
                <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">Role: {invitation.role}</div>
                <button
                  type="button"
                  onClick={() => acceptInvitation(invitation.invite_code)}
                  disabled={state.saving}
                  className="mt-3 inline-flex items-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  <CheckCircle2 size={16} aria-hidden="true" />
                  Accept and open
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {state.loading ? (
        <EmptyState title="Loading cases" description="Checking the workspaces available to this account." />
      ) : state.cases.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {state.cases.map((item) => {
            const id = caseId(item);
            return (
              <Link
                key={id}
                to={`/evidence/cases/${encodeURIComponent(id)}/dashboard`}
                className="group rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:border-sky-300 hover:bg-sky-50/40 dark:border-gray-800 dark:bg-[#101820] dark:hover:border-sky-800 dark:hover:bg-sky-950/20"
              >
                <div className="flex items-start gap-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-sky-700 dark:border-gray-800 dark:bg-[#0b1117] dark:text-sky-300">
                    <Briefcase size={22} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words text-base font-semibold text-gray-950 group-hover:text-sky-800 dark:text-white dark:group-hover:text-sky-200">
                        {caseName(item)}
                      </h3>
                      <StatusBadge status={item.status || 'active'} />
                    </div>
                    <p className="mt-2 break-all font-mono text-xs text-gray-500 dark:text-gray-400">{id}</p>
                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                      {item.environment ? `Environment: ${item.environment}` : 'Case workspace'}
                    </p>
                  </div>
                  <ArrowRight className="mt-1 text-gray-400 group-hover:text-sky-700 dark:group-hover:text-sky-300" size={18} aria-hidden="true" />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No cases yet"
          description="This account does not currently have access to a case or workspace. Start onboarding, join with an invitation, or request access from a case owner."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                to="/evidence/onboarding"
                className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                Start onboarding
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link
                to="/evidence/invitations"
                className="inline-flex items-center gap-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100 dark:hover:bg-sky-900/40"
              >
                Enter invite code
              </Link>
            </div>
          }
        />
      )}
    </div>
  );
}
