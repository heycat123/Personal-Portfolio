import { Info, KeyRound, Mail, RefreshCw, ShieldCheck, Trash2, UserPlus, UserX, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
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
const USER_STATUSES = ['active', 'revoked', 'deleted'];

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
    emailMessages: [],
    deliveryConfig: null,
    error: null,
    result: null,
    invitationResult: null,
    fingerprint: null,
    selectedUser: null,
    selectedUserMemberships: [],
    loadingUserDetail: false,
  });
  const [filters, setFilters] = useState({
    search: '',
    globalRole: '',
    caseRole: '',
    status: '',
    membershipStatus: '',
  });
  const [sort, setSort] = useState({ key: 'email', desc: false });
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
      const [usersResult, membershipsResult, invitationsResult, emailMessagesResult] = await Promise.all([
        evidenceApi.getAdminUsers({ token }),
        evidenceApi.getCaseMemberships(caseId, { token }),
        evidenceApi.getCaseInvitations(caseId, { token }),
        evidenceApi.getCaseEmailMessages(caseId, { token }),
      ]);
      recordFingerprint(usersResult, 'Admin users');
      recordFingerprint(membershipsResult, 'Case memberships');
      recordFingerprint(invitationsResult, 'Case invitations');
      recordFingerprint(emailMessagesResult, 'Email communications');
      setState((current) => ({
        ...current,
        loading: false,
        users: usersResult.data?.users || [],
        memberships: membershipsResult.data?.memberships || [],
        invitations: invitationsResult.data?.invitations || [],
        emailMessages: emailMessagesResult.data?.email_messages || [],
        deliveryConfig: emailMessagesResult.data?.delivery_config || null,
        fingerprint: emailMessagesResult.requestFingerprintId || invitationsResult.requestFingerprintId || membershipsResult.requestFingerprintId || usersResult.requestFingerprintId,
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

  async function updateRole(userId, role, targetCaseId = caseId) {
    setState((current) => ({ ...current, saving: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.grantCaseMembership(userId, { case_id: targetCaseId, role }, { token });
      recordFingerprint(result, 'Grant case access');
      await loadAdmin();
      if (state.selectedUser?.user_id === userId) {
        await openUserDrawer(state.selectedUser);
      }
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    } finally {
      setState((current) => ({ ...current, saving: false }));
    }
  }

  const openUserDrawer = useCallback(async (user) => {
    setState((current) => ({
      ...current,
      selectedUser: user,
      selectedUserMemberships: [],
      loadingUserDetail: true,
      error: null,
    }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getAdminUserCaseMemberships(user.user_id, { token });
      recordFingerprint(result, 'User case memberships');
      setState((current) => ({
        ...current,
        selectedUser: result.data?.user || user,
        selectedUserMemberships: result.data?.memberships || [],
        loadingUserDetail: false,
        fingerprint: result.requestFingerprintId,
      }));
    } catch (error) {
      setState((current) => ({ ...current, loadingUserDetail: false, error }));
    }
  }, [getAccessToken, recordFingerprint]);

  async function updateGlobalRole(userId, globalRole) {
    setState((current) => ({ ...current, saving: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.updateAdminUser(userId, { global_role: globalRole }, { token });
      recordFingerprint(result, 'Update global role');
      await loadAdmin();
      if (state.selectedUser?.user_id === userId) {
        await openUserDrawer(result.data?.user || state.selectedUser);
      }
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    } finally {
      setState((current) => ({ ...current, saving: false }));
    }
  }

  async function updateUserStatus(userId, status) {
    setState((current) => ({ ...current, saving: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.updateAdminUser(userId, { status }, { token });
      recordFingerprint(result, 'Update user status');
      await loadAdmin();
      if (state.selectedUser?.user_id === userId) {
        await openUserDrawer(result.data?.user || state.selectedUser);
      }
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    } finally {
      setState((current) => ({ ...current, saving: false }));
    }
  }

  async function deleteUser(userId) {
    const confirmed = window.confirm('Delete this user? This marks the user deleted and revokes active case memberships.');
    if (!confirmed) {
      return;
    }
    setState((current) => ({ ...current, saving: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.deleteAdminUser(userId, { token });
      recordFingerprint(result, 'Delete user');
      setState((current) => ({
        ...current,
        selectedUser: null,
        selectedUserMemberships: [],
        fingerprint: result.requestFingerprintId,
      }));
      await loadAdmin();
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    } finally {
      setState((current) => ({ ...current, saving: false }));
    }
  }

  async function revokeAccess(userId, targetCaseId = caseId) {
    setState((current) => ({ ...current, saving: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.revokeCaseMember(targetCaseId, userId, { token });
      recordFingerprint(result, 'Revoke case access');
      await loadAdmin();
      if (state.selectedUser?.user_id === userId) {
        await openUserDrawer(state.selectedUser);
      }
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    } finally {
      setState((current) => ({ ...current, saving: false }));
    }
  }

  const membershipByUser = useMemo(
    () => new Map(state.memberships.map((item) => [item.user_id, item])),
    [state.memberships],
  );
  const adminRows = useMemo(() => state.users.map((user) => {
    const membership = membershipByUser.get(user.user_id);
    return {
      ...user,
      user: user.display_name || user.email || user.user_id,
      case_role: membership?.role || '',
      membership_status: membership?.status || 'none',
      membership,
    };
  }), [membershipByUser, state.users]);
  const filteredUsers = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    const rows = adminRows.filter((user) => {
      const haystack = `${user.display_name || ''} ${user.email || ''} ${user.user_id || ''}`.toLowerCase();
      if (needle && !haystack.includes(needle)) {
        return false;
      }
      if (filters.globalRole && user.global_role !== filters.globalRole) {
        return false;
      }
      if (filters.caseRole && (user.case_role || '') !== filters.caseRole) {
        return false;
      }
      if (filters.status && (user.status || '') !== filters.status) {
        return false;
      }
      if (filters.membershipStatus && (user.membership_status || 'none') !== filters.membershipStatus) {
        return false;
      }
      return true;
    });
    if (!sort?.key) {
      return rows;
    }
    return [...rows].sort((left, right) => {
      const leftValue = String(left[sort.key] || '').toLowerCase();
      const rightValue = String(right[sort.key] || '').toLowerCase();
      const result = leftValue.localeCompare(rightValue);
      return sort.desc ? -result : result;
    });
  }, [adminRows, filters, sort]);

  const tableFilterValues = {
    user: filters.search,
    global_role: filters.globalRole,
    case_role: filters.caseRole,
    status: filters.status,
    membership_status: filters.membershipStatus,
  };
  const setTableFilter = (columnId, value) => {
    const map = {
      user: 'search',
      global_role: 'globalRole',
      case_role: 'caseRole',
      status: 'status',
      membership_status: 'membershipStatus',
    };
    const key = map[columnId];
    if (key) {
      setFilters((current) => ({ ...current, [key]: value }));
    }
  };
  const clearTableFilter = (columnId) => setTableFilter(columnId, '');
  const resetFilters = () => {
    setFilters({ search: '', globalRole: '', caseRole: '', status: '', membershipStatus: '' });
    setSort({ key: 'email', desc: false });
  };
  const appliedFilters = Object.entries(tableFilterValues)
    .filter(([, value]) => String(value || '').trim())
    .map(([key, value]) => ({ id: key, label: `${key.replaceAll('_', ' ')}: ${value}` }));
  const adminColumns = [
    {
      key: 'user',
      header: t('User'),
      sortable: true,
      help: 'Searches display name, email, and user id.',
      render: (user) => (
        <div>
          <div className="font-medium text-gray-950 dark:text-white">{user.display_name || user.email}</div>
          <div className="break-all text-xs text-gray-500">{user.email}</div>
          <div className="text-xs text-gray-500">{t('Seen')} {user.last_seen_at ? formatDateTime(user.last_seen_at) : t('never')}</div>
        </div>
      ),
    },
    {
      key: 'global_role',
      header: t('Global'),
      sortable: true,
      filterOptions: GLOBAL_ROLES.map((role) => ({ value: role, label: role })),
    },
    {
      key: 'case_role',
      header: t('Case Role'),
      sortable: true,
      filterOptions: CASE_ROLES.map((role) => ({ value: role, label: role })),
      render: (user) => (
        <select
          value={user.case_role || 'viewer'}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => updateRole(user.user_id, event.target.value)}
          disabled={state.saving}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
        >
          {CASE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
      ),
    },
    {
      key: 'status',
      header: t('User Status'),
      sortable: true,
      filterOptions: USER_STATUSES.map((status) => ({ value: status, label: status })),
      render: (user) => <StatusBadge status={user.status || 'unknown'} />,
    },
    {
      key: 'membership_status',
      header: t('Access'),
      sortable: true,
      filterOptions: ['active', 'revoked', 'none'].map((status) => ({ value: status, label: status })),
      render: (user) => <StatusBadge status={user.membership_status || 'none'} />,
    },
    {
      key: 'action',
      header: t('Action'),
      sortable: false,
      filterable: false,
      render: (user) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            revokeAccess(user.user_id);
          }}
          disabled={state.saving || !user.membership || user.membership.status === 'revoked' || user.membership.can_revoke === false}
          title={user.membership?.revoke_disabled_reason || ''}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
        >
          <UserX size={13} aria-hidden="true" />
          {t('Revoke')}
        </button>
      ),
    },
  ];
  const deliveryConfigured = Boolean(state.deliveryConfig?.configured);
  const deliveryLabel = deliveryConfigured ? t('Email delivery configured') : t('Manual invite fallback');

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
                <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                  {t('Use admin-created credentials only as a fallback when self-registration or email delivery is unavailable. Share temporary passwords through a secure channel and require the user to set their own password.')}
                </span>
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
              {t('Create a workspace access invitation for a lawyer or authorized user. If email delivery is unavailable, use the invite link as the approved manual fallback.')}
            </p>
          </div>

          <div className="mb-4 space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                <p>{t('Only invite people who are authorized to see this case information. Family-law records may include private, privileged, child-related, financial, medical, school, or safety-sensitive information. You can limit and revoke access.')}</p>
              </div>
            </div>
            <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-100">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                <p>{t('Inviting a lawyer gives account access to this workspace. It does not by itself create an attorney-client relationship unless you and the lawyer separately agree.')}</p>
              </div>
            </div>
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

          <DataTable
            columns={adminColumns}
            rows={filteredUsers}
            rowKey="user_id"
            emptyTitle={t('No users match the current filters.')}
            loading={state.loading}
            enableHeaderMenus
            filterValues={tableFilterValues}
            sort={sort}
            appliedFilters={appliedFilters}
            sortLabel={
              sort?.key
                ? `${t('Sorted by')} ${sort.key.replaceAll('_', ' ')} (${sort.desc ? t('Descending') : t('Ascending')})`
                : null
            }
            onFilterChange={setTableFilter}
            onClearFilter={clearTableFilter}
            onClearAllFilters={resetFilters}
            onSort={(columnId, desc) => setSort({ key: columnId, desc })}
            onRowSelect={openUserDrawer}
            selectedRowKey={state.selectedUser?.user_id}
            mobileTitle={(user) => user.display_name || user.email}
            mobileSubtitle={(user) => user.email}
            tableClassName="overflow-visible"
          />

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

          <div className="mt-8 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-md border border-gray-200 p-2 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                  <Mail size={18} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Email communications')}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('Review invitation and account emails sent or prepared for this case.')}
                  </p>
                </div>
              </div>
              <StatusBadge status={deliveryConfigured ? 'succeeded' : 'pending'} label={deliveryLabel} />
            </div>
            <div className="space-y-2">
              {state.emailMessages.length ? (
                state.emailMessages.map((message) => {
                  const sender = message.sender_display_name || message.sender_user_email || message.sender_email || t('System');
                  return (
                    <div key={message.email_message_id} className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-gray-950 dark:text-white">{message.subject || message.template_key}</span>
                            <StatusBadge status={message.status || 'unknown'} />
                          </div>
                          <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400 sm:grid-cols-2">
                            <div>
                              <dt className="font-semibold text-gray-700 dark:text-gray-300">{t('From')}</dt>
                              <dd className="break-all">{sender}</dd>
                            </div>
                            <div>
                              <dt className="font-semibold text-gray-700 dark:text-gray-300">{t('To')}</dt>
                              <dd className="break-all">{message.recipient_email}</dd>
                            </div>
                            <div>
                              <dt className="font-semibold text-gray-700 dark:text-gray-300">{t('Template')}</dt>
                              <dd className="break-all">{message.template_key}</dd>
                            </div>
                            <div>
                              <dt className="font-semibold text-gray-700 dark:text-gray-300">{t('Provider')}</dt>
                              <dd className="break-all">{message.provider || t('manual')}</dd>
                            </div>
                          </dl>
                          {message.error_message ? (
                            <p className="mt-2 text-xs text-red-700 dark:text-red-300">{message.error_message}</p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                          {message.sent_at ? formatDateTime(message.sent_at) : formatDateTime(message.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('No email communications recorded yet.')}</p>
              )}
            </div>
          </div>
        </section>
      </div>

      {state.selectedUser ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label={t('Close')}
            className="absolute inset-0 bg-black/40"
            onClick={() => setState((current) => ({ ...current, selectedUser: null, selectedUserMemberships: [] }))}
          />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-[#101820]">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
              <div className="min-w-0">
                <h2 className="break-words text-lg font-semibold text-gray-950 dark:text-white">
                  {state.selectedUser.display_name || state.selectedUser.email}
                </h2>
                <p className="mt-1 break-all text-sm text-gray-600 dark:text-gray-400">{state.selectedUser.email}</p>
                <p className="mt-1 break-all font-mono text-xs text-gray-500 dark:text-gray-500">{state.selectedUser.user_id}</p>
              </div>
              <button
                type="button"
                onClick={() => setState((current) => ({ ...current, selectedUser: null, selectedUserMemberships: [] }))}
                className="rounded-md border border-gray-300 p-2 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
                aria-label={t('Close')}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Account Access')}</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Global role')}</span>
                    <select
                      value={state.selectedUser.global_role || 'member'}
                      onChange={(event) => updateGlobalRole(state.selectedUser.user_id, event.target.value)}
                      disabled={state.saving}
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                    >
                      {GLOBAL_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('User status')}</span>
                    <select
                      value={state.selectedUser.status || 'active'}
                      onChange={(event) => updateUserStatus(state.selectedUser.user_id, event.target.value)}
                      disabled={state.saving}
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                    >
                      <option value="active">active</option>
                      <option value="revoked">revoked</option>
                    </select>
                  </label>
                </div>
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                  {t('Revoke means suspend access. Delete marks the user deleted and revokes active case memberships while preserving audit history.')}
                </div>
                <button
                  type="button"
                  onClick={() => deleteUser(state.selectedUser.user_id)}
                  disabled={state.saving}
                  className="mt-4 inline-flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-950/50"
                >
                  <Trash2 size={16} aria-hidden="true" />
                  {t('Delete user')}
                </button>
              </section>

              <section className="mt-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Case Memberships')}</h3>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {t('Change case roles or suspend access for cases this user is linked to.')}
                    </p>
                  </div>
                  {state.loadingUserDetail ? <StatusBadge status="running" label={t('loading')} /> : null}
                </div>

                <div className="mt-4 space-y-3">
                  {state.selectedUserMemberships.length ? (
                    state.selectedUserMemberships.map((membership) => (
                      <div key={membership.case_membership_id} className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="break-words font-semibold text-gray-950 dark:text-white">
                              {membership.case_name || membership.case_id}
                            </div>
                            <div className="mt-1 break-all font-mono text-xs text-gray-500 dark:text-gray-400">{membership.case_id}</div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <StatusBadge status={membership.status || 'unknown'} />
                              <span className="text-xs text-gray-500 dark:text-gray-400">{membership.workspace_type || 'case'}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col gap-2">
                            <select
                              value={membership.role || 'viewer'}
                              onChange={(event) => updateRole(state.selectedUser.user_id, event.target.value, membership.case_id)}
                              disabled={state.saving || membership.status === 'revoked'}
                              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                            >
                              {CASE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                            </select>
                            <button
                              type="button"
                              onClick={() => revokeAccess(state.selectedUser.user_id, membership.case_id)}
                              disabled={state.saving || membership.status === 'revoked' || membership.can_revoke === false}
                              title={membership.revoke_disabled_reason || ''}
                              className="inline-flex items-center justify-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
                            >
                              <UserX size={13} aria-hidden="true" />
                              {t('Revoke')}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {state.loadingUserDetail ? t('Loading case memberships.') : t('No case memberships found.')}
                    </p>
                  )}
                </div>
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
