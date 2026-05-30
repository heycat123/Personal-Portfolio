import { CheckCircle2, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { useEvidenceAuth } from '../context/AuthContext';
import { useCaseContext } from '../context/CaseContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { evidenceApi } from '../services/evidenceApi';
import { caseMatchesRouteId, evidenceCasePath } from '../utils/caseRouting';

export default function InvitationsPage() {
  const navigate = useNavigate();
  const { getAccessToken } = useEvidenceAuth();
  const { registerCases } = useCaseContext();
  const { t } = useLocaleSettings();
  const [state, setState] = useState({
    loading: true,
    saving: false,
    error: null,
    invitations: [],
    inviteCode: '',
  });

  const loadInvitations = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getPendingInvitations({ token });
      setState((current) => ({
        ...current,
        loading: false,
        invitations: result.data?.invitations || [],
      }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, [getAccessToken]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

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
      const acceptedCase = cases.find((item) => caseMatchesRouteId(item, result.data?.case_url_id || result.data?.case_id)) || result.data;
      navigate(evidenceCasePath(acceptedCase, '/dashboard'), { replace: true });
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    }
  }, [getAccessToken, navigate, registerCases]);

  return (
    <div>
      <PageHeader
        title="Invitations"
        description="Review pending case invitations or enter an invite code."
        actions={
          <button
            type="button"
            onClick={loadInvitations}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-white/10"
          >
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel title="Invitation action failed" error={state.error} /></div> : null}

      <section className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <p>
            {t('Only accept workspace access if you are authorized to see this case information. Family-law records may include private, privileged, child-related, financial, medical, school, or safety-sensitive information.')}
          </p>
        </div>
      </section>

      <section className="mb-5 rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
        <h3 className="text-base font-semibold text-gray-950 dark:text-white">Enter invite code</h3>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={state.inviteCode}
            onChange={(event) => setState((current) => ({ ...current, inviteCode: event.target.value }))}
            placeholder="case_xxxxxxxxxx_xxxxxxxxxx"
            className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-gray-700 dark:bg-[#0b1117] dark:text-white"
          />
          <button
            type="button"
            onClick={() => acceptInvitation(state.inviteCode)}
            disabled={state.saving || !state.inviteCode.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCircle2 size={16} aria-hidden="true" />
            Accept
          </button>
        </div>
      </section>

      {state.loading ? (
        <EmptyState title="Loading invitations" />
      ) : state.invitations.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {state.invitations.map((invitation) => (
            <section key={invitation.invitation_id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <div className="flex items-start gap-4">
                <div className="rounded-md border border-gray-200 p-2 text-sky-700 dark:border-gray-700 dark:text-sky-300">
                  <Mail size={18} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words text-base font-semibold text-gray-950 dark:text-white">
                      {invitation.case_name || invitation.case_id}
                    </h3>
                    <StatusBadge status={invitation.status || 'pending'} />
                  </div>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Role: <span className="font-semibold">{invitation.role}</span>
                  </p>
                  <p className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">
                    Code: {invitation.invite_code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => acceptInvitation(invitation.invite_code)}
                disabled={state.saving}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                Accept invitation
              </button>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState title="No pending invitations" description="If someone invited you, paste the invite code above." />
      )}
    </div>
  );
}
