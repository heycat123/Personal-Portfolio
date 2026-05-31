import { Mail, RefreshCw, Send, ShieldCheck, UserPlus, UserX, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

const CASE_ROLES = ['owner', 'admin', 'lawyer', 'contributor', 'client', 'viewer'];
const CASE_ROLE_RANK = {
  viewer: 10,
  client: 20,
  contributor: 30,
  lawyer: 40,
  admin: 50,
  owner: 60,
  root_admin: 90,
};

const ROLE_HELP = {
  lawyer: 'Lawyer access for reviewing documents and using case tools. Workspace access does not itself create an attorney-client relationship.',
  contributor: 'Can add and review documents. Good for staff or trusted helpers who should help organize materials.',
  client: 'Client-style access for reviewing the workspace without managing access.',
  viewer: 'View-only access for people who should not add or manage case materials.',
  admin: 'Case admin access. Use sparingly because it can manage case access.',
  owner: 'Case owner access. Usually reserved for the person who controls the workspace.',
};

function roleRank(role) {
  return CASE_ROLE_RANK[role || ''] || 0;
}

function displayName(user) {
  return user?.display_name || user?.email || user?.user_id || 'Workspace user';
}

function deliveryStatus(message) {
  if (!message) {
    return 'unknown';
  }
  return message.status || 'unknown';
}

export default function AccessSharingPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
  const [state, setState] = useState({
    loading: true,
    saving: false,
    memberships: [],
    invitations: [],
    emailMessages: [],
    deliveryConfig: null,
    accessPolicy: null,
    error: null,
    notice: null,
    fingerprint: null,
  });
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'lawyer',
    message: '',
  });

  const loadAccess = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const [membershipsResult, invitationsResult, emailMessagesResult] = await Promise.all([
        evidenceApi.getCaseMemberships(caseId, { token }),
        evidenceApi.getCaseInvitations(caseId, { token }),
        evidenceApi.getCaseEmailMessages(caseId, { token }),
      ]);
      recordFingerprint(membershipsResult, 'Access memberships');
      recordFingerprint(invitationsResult, 'Access invitations');
      recordFingerprint(emailMessagesResult, 'Access email communications');
      setState((current) => ({
        ...current,
        loading: false,
        memberships: membershipsResult.data?.memberships || [],
        invitations: invitationsResult.data?.invitations || [],
        emailMessages: emailMessagesResult.data?.email_messages || [],
        deliveryConfig: emailMessagesResult.data?.delivery_config || null,
        accessPolicy: membershipsResult.data?.access_policy || invitationsResult.data?.access_policy || null,
        fingerprint: emailMessagesResult.requestFingerprintId || invitationsResult.requestFingerprintId || membershipsResult.requestFingerprintId,
      }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    loadAccess();
  }, [loadAccess]);

  const actorRole = state.accessPolicy?.actor_role || '';
  const roleOptions = useMemo(() => {
    if (!actorRole || actorRole === 'root_admin') {
      return CASE_ROLES;
    }
    const actorRank = roleRank(actorRole);
    return CASE_ROLES.filter((role) => roleRank(role) <= actorRank);
  }, [actorRole]);

  useEffect(() => {
    if (roleOptions.length && !roleOptions.includes(inviteForm.role)) {
      setInviteForm((current) => ({ ...current, role: roleOptions[0] }));
    }
  }, [inviteForm.role, roleOptions]);

  async function createInvitation(event) {
    event.preventDefault();
    setState((current) => ({ ...current, saving: true, error: null, notice: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.createCaseInvitation(caseId, inviteForm, { token });
      recordFingerprint(result, 'Create access invitation');
      const delivery = result.data?.delivery?.email_delivery_status || result.data?.email_message?.status || 'created';
      setInviteForm({ email: '', role: actorRole === 'lawyer' ? 'contributor' : 'lawyer', message: '' });
      setState((current) => ({
        ...current,
        saving: false,
        notice: `Invitation created. Delivery status: ${delivery}.`,
        fingerprint: result.requestFingerprintId,
      }));
      await loadAccess();
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    }
  }

  async function cancelInvitation(invitation) {
    setState((current) => ({ ...current, saving: true, error: null, notice: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.cancelCaseInvitation(caseId, invitation.invitation_id, { token });
      recordFingerprint(result, 'Cancel access invitation');
      setState((current) => ({ ...current, saving: false, notice: 'Invitation canceled.', fingerprint: result.requestFingerprintId }));
      await loadAccess();
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    }
  }

  async function revokeMembership(membership) {
    const confirmed = window.confirm('Revoke this workspace access? Past activity, uploaded documents, and audit history will be preserved.');
    if (!confirmed) {
      return;
    }
    setState((current) => ({ ...current, saving: true, error: null, notice: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.revokeCaseMember(caseId, membership.user_id, { token });
      recordFingerprint(result, 'Revoke workspace access');
      const delivery = result.data?.email_message?.status;
      setState((current) => ({
        ...current,
        saving: false,
        notice: delivery ? `Access revoked. Notification status: ${delivery}.` : 'Access revoked.',
        fingerprint: result.requestFingerprintId,
      }));
      await loadAccess();
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    }
  }

  const activeMemberships = state.memberships.filter((item) => item.status === 'active');
  const revokedMemberships = state.memberships.filter((item) => item.status !== 'active');
  const pendingInvitations = state.invitations.filter((item) => item.status === 'pending');
  const deliveryConfigured = Boolean(state.deliveryConfig?.configured);

  return (
    <div>
      <PageHeader
        title="Access & Sharing"
        description="Invite lawyers or authorized users, review who has workspace access, and revoke access when needed."
        actions={
          <button
            type="button"
            onClick={loadAccess}
            disabled={state.loading || state.saving}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            <RefreshCw size={16} aria-hidden="true" />
            {t('Refresh')}
          </button>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel title="Access action failed" error={state.error} /></div> : null}
      {state.notice ? (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
          {t(state.notice)}
        </div>
      ) : null}

      <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-semibold">{t('Only invite people who are authorized to see this case information.')}</p>
        <p className="mt-1">
          {t('Family-law records may include private, privileged, child-related, financial, medical, school, or safety-sensitive information. Inviting a lawyer gives workspace access; it does not by itself create an attorney-client relationship.')}
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-md border border-gray-200 p-2 text-gray-600 dark:border-gray-700 dark:text-gray-300">
              <UserPlus size={18} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t('Invite authorized user')}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {deliveryConfigured ? t('Email delivery is configured.') : t('Email delivery is not fully configured; manual invite link fallback may be needed.')}
              </p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={createInvitation}>
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
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              >
                {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">{t(ROLE_HELP[inviteForm.role] || '')}</span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Optional message')}</span>
              <textarea
                value={inviteForm.message}
                onChange={(event) => setInviteForm((current) => ({ ...current, message: event.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              />
            </label>
            <button
              type="submit"
              disabled={state.saving || !inviteForm.email.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              <Send size={16} aria-hidden="true" />
              {state.saving ? t('Sending') : t('Create invitation')}
            </button>
          </form>
        </section>

        <div className="space-y-5">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t('People with access')}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('Case owners/admins can revoke within scope. Invite creators can revoke access they created.')}
                </p>
              </div>
              <StatusBadge status={state.loading ? 'pending' : 'succeeded'} label={`${activeMemberships.length} ${t('active')}`} />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {activeMemberships.map((membership) => {
                const management = membership.access_management || {};
                return (
                  <article key={membership.case_membership_id || membership.user_id} className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-[#0b1117]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-gray-950 dark:text-white">{displayName(membership)}</h3>
                        <p className="break-all text-xs text-gray-500 dark:text-gray-400">{membership.email}</p>
                      </div>
                      <StatusBadge status="active" label={membership.role || 'viewer'} />
                    </div>
                    <p className="mt-3 text-xs leading-5 text-gray-600 dark:text-gray-400">{management.label || membership.granted_by_display_name || t('Managed by case access policy')}</p>
                    <button
                      type="button"
                      onClick={() => revokeMembership(membership)}
                      disabled={state.saving || !membership.can_revoke}
                      title={membership.revoke_disabled_reason || management.revoke_disabled_reason || ''}
                      className="mt-3 inline-flex items-center gap-2 rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/70 dark:text-red-200 dark:hover:bg-red-950/30"
                    >
                      <UserX size={15} aria-hidden="true" />
                      {t('Revoke access')}
                    </button>
                    {!membership.can_revoke ? (
                      <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{membership.revoke_disabled_reason || management.revoke_disabled_reason}</p>
                    ) : null}
                  </article>
                );
              })}
              {!activeMemberships.length ? (
                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
                  {t('No active workspace access found.')}
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck size={17} aria-hidden="true" className="text-gray-500" />
              <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t('Pending invitations')}</h2>
            </div>
            <div className="space-y-3">
              {pendingInvitations.map((invitation) => (
                <article key={invitation.invitation_id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="break-all text-sm font-semibold text-gray-950 dark:text-white">{invitation.invited_email}</h3>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t('Role')}: {invitation.role} · {invitation.created_at ? formatDateTime(invitation.created_at) : t('pending')}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{invitation.access_management?.label}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => cancelInvitation(invitation)}
                      disabled={state.saving || !invitation.can_cancel}
                      title={invitation.cancel_disabled_reason || invitation.access_management?.cancel_disabled_reason || ''}
                      className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
                    >
                      <XCircle size={15} aria-hidden="true" />
                      {t('Cancel')}
                    </button>
                  </div>
                  {!invitation.can_cancel ? (
                    <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{invitation.cancel_disabled_reason || invitation.access_management?.cancel_disabled_reason}</p>
                  ) : null}
                </article>
              ))}
              {!pendingInvitations.length ? (
                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
                  {t('No pending invitations.')}
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="mb-4 flex items-center gap-2">
              <Mail size={17} aria-hidden="true" className="text-gray-500" />
              <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t('Email communications')}</h2>
            </div>
            <div className="space-y-3">
              {state.emailMessages.slice(0, 8).map((message) => (
                <article key={message.email_message_id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-gray-950 dark:text-white">{message.subject || message.template_key}</h3>
                      <p className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">
                        {t('To')}: {message.recipient_email}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t('From')}: {message.sender_display_name || message.sender_user_email || message.sender_email || t('system')}
                      </p>
                    </div>
                    <StatusBadge status={deliveryStatus(message)} />
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {message.created_at ? formatDateTime(message.created_at) : ''} · {message.provider}
                  </p>
                  {message.error_message ? (
                    <p className="mt-2 text-xs text-red-700 dark:text-red-200">{message.error_message}</p>
                  ) : null}
                </article>
              ))}
              {!state.emailMessages.length ? (
                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
                  {t('No email communications recorded yet.')}
                </div>
              ) : null}
            </div>
          </section>

          {revokedMemberships.length ? (
            <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t('Access history')}</h2>
              <div className="mt-4 space-y-2">
                {revokedMemberships.slice(0, 6).map((membership) => (
                  <div key={membership.case_membership_id || membership.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
                    <span className="break-all text-gray-700 dark:text-gray-300">{membership.email || membership.user_id}</span>
                    <StatusBadge status={membership.status} label={t('Access revoked')} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {state.fingerprint ? (
        <div className="mt-5">
          <RequestFingerprint fingerprintId={state.fingerprint} label={t('Access latest')} />
        </div>
      ) : null}
    </div>
  );
}
