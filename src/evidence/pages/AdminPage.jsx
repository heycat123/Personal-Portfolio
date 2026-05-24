import { KeyRound, RefreshCw, ShieldCheck, UserPlus, UserX } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { evidenceApi } from '../services/evidenceApi';
import { formatDateTime } from '../utils/formatters';

const CASE_ROLES = ['owner', 'admin', 'lawyer', 'client', 'viewer'];

export default function AdminPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const [state, setState] = useState({
    loading: true,
    saving: false,
    users: [],
    memberships: [],
    error: null,
    result: null,
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

  const loadAdmin = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const [usersResult, membershipsResult] = await Promise.all([
        evidenceApi.getAdminUsers({ token }),
        evidenceApi.getCaseMemberships(caseId, { token }),
      ]);
      recordFingerprint(usersResult, 'Admin users');
      recordFingerprint(membershipsResult, 'Case memberships');
      setState((current) => ({
        ...current,
        loading: false,
        users: usersResult.data?.users || [],
        memberships: membershipsResult.data?.memberships || [],
        fingerprint: membershipsResult.requestFingerprintId || usersResult.requestFingerprintId,
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
        actions={<StatusBadge status={state.loading ? 'pending' : 'succeeded'} label={state.loading ? 'loading' : 'ready'} />}
      />

      {state.error ? <div className="mb-5"><ErrorPanel title="Admin action failed" error={state.error} /></div> : null}

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-md border border-gray-200 p-2 text-gray-600 dark:border-gray-700 dark:text-gray-300">
              <UserPlus size={18} aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">Create Account</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Create an account and link it to this case.</p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleCreateUser}>
            <label className="block">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                required
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Display name</span>
              <input
                type="text"
                value={form.display_name}
                onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Global role</span>
                <select
                  value={form.global_role}
                  onChange={(event) => setForm((current) => ({ ...current, global_role: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                >
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Case role</span>
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
              Send Cognito invitation email
            </label>
            {!form.send_email ? (
              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Temporary password</span>
                <input
                  type="text"
                  value={form.temporary_password}
                  onChange={(event) => setForm((current) => ({ ...current, temporary_password: event.target.value }))}
                  placeholder="Leave blank to generate one"
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
              {state.saving ? 'Saving' : 'Create and Link'}
            </button>
          </form>

          {state.result?.cognito?.temporary_password ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              Temporary password: <span className="font-mono">{state.result.cognito.temporary_password}</span>
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
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">Case Access</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Current users and their access to this case.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={loadAdmin}
              className="rounded-md border border-gray-300 p-2 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
              title="Refresh admin data"
              aria-label="Refresh admin data"
            >
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800">
                <tr>
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Global</th>
                  <th className="py-2 pr-4">Case Role</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Action</th>
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
                        <div className="text-xs text-gray-500">Seen {user.last_seen_at ? formatDateTime(user.last_seen_at) : 'never'}</div>
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
                          Revoke
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
              <RequestFingerprint fingerprint={{ id: state.fingerprint, label: 'Admin latest' }} />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
