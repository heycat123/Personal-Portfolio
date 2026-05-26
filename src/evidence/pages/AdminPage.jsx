import { KeyRound, RefreshCw, ShieldCheck, UserPlus, UserX } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { evidenceApi } from '../services/evidenceApi';
import { formatDateTime } from '../utils/formatters';

const GLOBAL_ROLES = ['root_admin', 'admin', 'member'];
const CASE_ROLES = ['owner', 'admin', 'lawyer', 'contributor', 'client', 'viewer'];

export default function AdminPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
  const [state, setState] = useState({
    loading: true,
    saving: false,
    users: [],
    memberships: [],
    invitations: [],
    error: null,
    result: null,
    invitationResult: null,
    fingerprint: null,
  });
  const [form, setForm] = useState({
    email: '',
    display_name: '',
    global_role: 'member',
    case_role: 'lawyer',
    send_email: true,
    temporary_password: '',
  });
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'viewer',
    message: '',
  });

  const loadAdmin = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const [usersResult, membershipsResult, invitationsResult] = await Promise.all([
        evidenceApi.getAdminUsers({ token }),
        evidenceApi.getCaseMemberships(caseId, { token }),
        evidenceApi.getCaseInvitations(caseId, { token }),
      ]);
      recordFingerprint(usersResult, 'Admin users');
      recordFingerprint(membershipsResult, 'Case memberships');
      recordFingerprint(invitationsResult, 'Case invitations');
      setState((current) => ({
        ...current,
        loading: false,
        users: usersResult.data?.users || [],
        memberships: membershipsResult.data?.memberships || [],
        invitations: invitationsResult.data?.invitations || [],
        fingerprint: invitationsResult.requestFingerprintId || membershipsResult.requestFingerprintId || usersResult.requestFingerprintId,
      }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    loadAdmin();
  }, [loadAdmin]);

  async function handleCreateUser(event) {
    event.preventDefault();
    setState((current) => ({ ...current, saving: true, error: null, result: null }));
    try {
      const token = await getAccessToken();
      const payload = {
        ...form,
        case_id: caseId,
        temporary_password: form.temporary_password || null,
      };
      const result = await evidenceApi.createAdminUser(payload, { token });
      recordFingerprint(result, 'Create user');
      setForm({
        email: '',
        display_name: '',
        global_role: 'member',
        case_role: 'lawyer',
        send_email: true,
        temporary_password: '',
      });
      setState((current) => ({
        ...current,
        saving: false,
        result: result.data,
        fingerprint: result.requestFingerprintId,
      }));
      await loadAdmin();
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    }
  }

  async function handleCreateInvitation(event) {
    event.preventDefault();
    setState((current) => ({ ...current, saving: true, error: null, invitationResult: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.createCaseInvitation(caseId, inviteForm, { token });
      recordFingerprint(result, 'Create invitation');
      setInviteForm({ email: '', role: 'viewer', message: '' });
      setState((current) => ({
        ...current,
        saving: false,
        invitationResult: result.data,
        fingerprint: result.requestFingerprintId,
      }));
      await loadAdmin();
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    }
  }

  async function cancelInvitation(invitationId) {
    setState((current) => ({ ...current, saving: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.cancelCaseInvitation(caseId, invitationId, { token });
      recordFingerprint(result, 'Cancel invitation');
      await loadAdmin();
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    } finally {
      setState((current) => ({ ...current, saving: false }));
    }
  }

  async function updateRole(userId, role) {
    setState((current) => ({ ...current, saving: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.grantCaseMembership(userId, { case_id: caseId, role }, { token });
      recordFingerprint(result, 'Grant case access');
      await loadAdmin();
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    } finally {
      setState((current) => ({ ...current, saving: false }));
    }
  }

  async function revokeAccess(userId) {
    setState((current) => ({ ...current, saving: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.revokeCaseMembership(userId, caseId, { token });
      recordFingerprint(result, 'Revoke case access');
      await loadAdmin();
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    } finally {
      setState((current) => ({ ...current, saving: false }));
    }
  }

  const membershipByUser = new Map(state.memberships.map((item) => [item.user_id, item]));

  return (
    <div>
      <PageHeader
        title="Admin"
        description="Create Cognito-backed accounts and manage access to this case."
        actions={<StatusBadge status={state.loading ? 'pending' : 'succeeded'} label={state.loading ? t('loading') : t('ready')} />}
      />

      {state.error ? <div className="mb-5"><ErrorPanel title="Admin action failed" error={state.error} /></div> : null}

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-md border border-gray-200 p-2 text-gray-600 dark:border-gray-700 dark:text-gray-300">
              <UserPlus size={18} aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Create Account')}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('Create an account and link it to this case.')}</p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleCreateUser}>
            <label className="block">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Email')}</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                required
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Display name')}</span>
              <input
                type="text"
                value={form.display_name}
                onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Global role')}</span>
                <select
                  value={form.global_role}
                  onChange={(event) => setForm((current) => ({ ...current, global_role: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                >
                  {GLOBAL_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Case role')}</span>
                <select
                  value={form.case_role}
                  onChange={(event) => setForm((current) => ({ ...current, case_role: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                >
                  {CASE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.send_email}
                onChange={(event) => setForm((current) => ({ ...current, send_email: event.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-sky-700 focus:ring-sky-500"
              />
              {t('Send Cognito invitation email')}
            </label>
            {!form.send_email ? (
              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Temporary password')}</span>
                <input
                  type="text"
                  value={form.temporary_password}
                  onChange={(event) => setForm((current) => ({ ...current, temporary_password: event.target.value }))}
                  placeholder={t('Leave blank to generate one')}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                />
              </label>
            ) : null}
            <button
              type="submit"
              disabled={state.saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <KeyRound size={16} aria-hidden="true" />
              {state.saving ? t('Saving') : t('Create and Link')}
            </button>
          </form>

          {state.result?.cognito?.temporary_password ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              {t('Temporary password')}: <span className="font-mono">{state.result.cognito.temporary_password}</span>
            </div>
          ) : null}

          <div className="my-6 border-t border-gray-200 dark:border-gray-800" />

          <div className="mb-4">
            <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Invite to Case')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('Create an invitation code. Email delivery will be handled by a later SES integration.')}
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleCreateInvitation}>
            <label className="block">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Email')}</span>
              <input
                type="email"
                value={inviteForm.email}
                onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))}
                required
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Case role')}</span>
              <select
                value={inviteForm.role}
                onChange={(event) => setInviteForm((current) => ({ ...current, role: event.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              >
                {CASE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Message')}</span>
              <textarea
                value={inviteForm.message}
                onChange={(event) => setInviteForm((current) => ({ ...current, message: event.target.value }))}
                className="mt-1 min-h-20 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              />
            </label>
            <button
              type="submit"
              disabled={state.saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UserPlus size={16} aria-hidden="true" />
              {state.saving ? t('Saving') : t('Create Invitation')}
            </button>
          </form>

          {state.invitationResult?.invitation?.invite_code ? (
            <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
              <div className="font-semibold">{t('Invite code')}</div>
              <div className="mt-1 break-all font-mono">{state.invitationResult.invitation.invite_code}</div>
              <div className="mt-2 text-xs">{state.invitationResult.invite_url}</div>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-md border border-gray-200 p-2 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                <ShieldCheck size={18} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Case Access')}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('Current users and their access to this case.')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={loadAdmin}
              className="rounded-md border border-gray-300 p-2 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
              title={t('Refresh')}
              aria-label={t('Refresh')}
            >
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800">
                <tr>
                  <th className="py-2 pr-4">{t('User')}</th>
                  <th className="py-2 pr-4">{t('Global')}</th>
                  <th className="py-2 pr-4">{t('Case Role')}</th>
                  <th className="py-2 pr-4">{t('Status')}</th>
                  <th className="py-2">{t('Action')}</th>
                </tr>
              </thead>
              <tbody>
                {state.users.map((user) => {
                  const membership = membershipByUser.get(user.user_id);
                  return (
                    <tr key={user.user_id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-3 pr-4">
                        <div className="font-medium text-gray-950 dark:text-white">{user.display_name || user.email}</div>
                        <div className="text-xs text-gray-500">{user.email}</div>
                        <div className="text-xs text-gray-500">{t('Seen')} {user.last_seen_at ? formatDateTime(user.last_seen_at) : t('never')}</div>
                      </td>
                      <td className="py-3 pr-4">{user.global_role}</td>
                      <td className="py-3 pr-4">
                        <select
                          value={membership?.role || 'viewer'}
                          onChange={(event) => updateRole(user.user_id, event.target.value)}
                          disabled={state.saving}
                          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                        >
                          {CASE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                        </select>
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={membership?.status || 'none'} />
                      </td>
                      <td className="py-3">
                        <button
                          type="button"
                          onClick={() => revokeAccess(user.user_id)}
                          disabled={state.saving || !membership || membership.status === 'revoked'}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
                        >
                          <UserX size={13} aria-hidden="true" />
                          {t('Revoke')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {state.fingerprint ? (
            <div className="mt-4">
              <RequestFingerprint fingerprintId={state.fingerprint} label={t('Admin latest')} />
            </div>
          ) : null}

          <div className="mt-8">
            <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">{t('Pending Invitations')}</h3>
            <div className="space-y-2">
              {state.invitations.length ? (
                state.invitations.map((invitation) => (
                  <div key={invitation.invitation_id} className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-950 dark:text-white">{invitation.invited_email}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <StatusBadge status={invitation.status} />
                          <span>{invitation.role}</span>
                          <span>{formatDateTime(invitation.created_at)}</span>
                        </div>
                        <div className="mt-1 break-all font-mono text-xs text-gray-500 dark:text-gray-400">{invitation.invite_code}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => cancelInvitation(invitation.invitation_id)}
                        disabled={state.saving || invitation.status !== 'pending'}
                        className="inline-flex items-center justify-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
                      >
                        <UserX size={13} aria-hidden="true" />
                        {t('Cancel')}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('No invitations yet.')}</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
