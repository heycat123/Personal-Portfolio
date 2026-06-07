import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FileUp,
  Folder,
  FolderOpen,
  Info,
  Link2,
  Loader2,
  NotepadText,
  PackageCheck,
  Paperclip,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import ProgressMeter from '../components/ProgressMeter';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useCaseContext } from '../context/CaseContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { evidenceApi } from '../services/evidenceApi';
import { evidenceCasePath } from '../utils/caseRouting';
import { formatCount, formatDateTime, humanizeKey } from '../utils/formatters';

const REQUIREMENT_STATUS_OPTIONS = [
  {
    value: 'needed',
    label: 'Needed',
    helper: 'You may need to add a document or note for this item.',
  },
  {
    value: 'added',
    label: 'Added',
    helper: 'You marked this checklist item as covered.',
  },
  {
    value: 'needs_attention',
    label: 'Needs attention',
    helper: 'This item needs a document, note, or decision.',
  },
  {
    value: 'may_not_apply',
    label: 'May not apply',
    helper: 'You marked this item as possibly not relevant to your situation.',
  },
  {
    value: 'skipped',
    label: 'Skipped',
    helper: 'You chose to skip this item for now.',
  },
];

const REQUIREMENT_STATUS_MAP = Object.fromEntries(REQUIREMENT_STATUS_OPTIONS.map((item) => [item.value, item]));
const COVERED_STATUSES = ['added', 'may_not_apply', 'skipped'];
const GOOGLE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const REQUIREMENT_UPLOAD_GUIDANCE = {
  financial_affidavit_draft_form: [
    'Draft or completed Florida financial affidavit form 12.902(b) or 12.902(c), if you already have one.',
    'Notes or questions about which financial affidavit form applies.',
    'Child support worksheet notes if child support is part of the case.',
  ],
  income_employment: [
    'Pay stubs or other earned-income proof for the last 6 months.',
    'Income from any other source for the last 6 months if it is not already shown on pay stubs.',
    'Employment changes, bonuses, payouts, cash income, or non-recurring income notes if they apply.',
  ],
  tax_returns_documents: [
    'Complete federal and state personal income tax returns for the past 3 years, with attachments and schedules.',
    'W-2, 1099, and K-1 forms for the past year if that tax return has not been prepared.',
    'Gift, foreign, state, business, partnership, corporate, or trust tax returns if they apply.',
  ],
  bank_account_statements: [
    'Periodic statements for all checking accounts for the last 12 months.',
    'Statements for savings, money market, certificate of deposit, and similar accounts for the last 12 months.',
    'Canceled checks or registers for accounts with check-writing privileges, if available.',
  ],
  digital_wallets_payment_apps: [
    'Most recent statement and the past 12 months of virtual-currency or digital-asset transaction records, if applicable.',
    'Payment app transfer history or balance screenshots if those accounts are relevant to income, expenses, debts, or support.',
    'Notes if you do not use these accounts or they may not apply.',
  ],
  debts_liabilities: [
    'Credit card and charge account statements or other debt records for the last 24 months.',
    'Promissory notes, loan records, liens, judgments, or other money owed by either party within the last 24 months.',
    'Current lease agreements and debt balance records if they apply.',
  ],
  housing_recurring_expenses: [
    'Rent, mortgage, lease, property, or housing payment records.',
    'Utility, transportation, insurance, food, and recurring household expense records used for your affidavit numbers.',
    'Short notes explaining recurring expenses if documents are not available.',
  ],
  insurance_benefits_retirement: [
    'Insurance declarations page, last periodic statement, and past 12 months of life insurance statements.',
    'Current health and dental insurance cards covering either party or dependent children.',
    'Most recent and past 12 months of retirement, pension, deferred compensation, 401(k), IRA, or similar statements.',
  ],
  business_self_employment: [
    'Business, partnership, corporate, or trust tax returns for the last 3 tax years if you have an ownership interest.',
    'Business bank statements, profit/loss records, invoices, account balances, or self-employment income records.',
    'Business ownership/status note if this may not apply or documents are incomplete.',
  ],
  child_household_support_expenses: [
    'Childcare, school, medical, dental, insurance, therapy, activity, or household support expense records if they apply.',
    'Support payments, household support transfers, or reimbursement records.',
    'Notes for child-related expenses that do not have a document yet.',
  ],
  orders_agreements_support_obligations: [
    'Existing child support, alimony/spousal support, or other financial orders if they apply.',
    'Written agreements, settlement terms, premarital or marital agreements, or support obligation records.',
    'Court notices or orders related to financial disclosure.',
  ],
  notes_questions: [
    'Questions for your lawyer, trusted helper, or your own review.',
    'A missing documents list.',
    'Items to verify before sharing, serving, or filing anything.',
  ],
};

function normalizeStatus(value) {
  return String(value || '').toLowerCase();
}

function packetStatusLabel(status) {
  const normalized = normalizeStatus(status || 'not_started');
  if (normalized === 'not_started') return 'Not started';
  if (normalized === 'in_progress') return 'In progress';
  if (normalized === 'needs_attention') return 'Needs attention';
  if (normalized === 'complete') return 'Complete';
  return humanizeKey(normalized);
}

function requirementStatusLabel(status) {
  return REQUIREMENT_STATUS_MAP[normalizeStatus(status)]?.label || humanizeKey(status || 'needed');
}

function requirementStatusHelper(status) {
  return REQUIREMENT_STATUS_MAP[normalizeStatus(status)]?.helper || 'Use status and notes to track what belongs in this packet.';
}

function statusTone(status) {
  const normalized = normalizeStatus(status);
  if (normalized === 'complete' || normalized === 'added') return 'succeeded';
  if (normalized === 'in_progress') return 'running';
  if (normalized === 'needs_attention' || normalized === 'needed') return 'needs_review';
  if (normalized === 'may_not_apply' || normalized === 'skipped' || normalized === 'not_started') return 'pending';
  return normalized || 'unknown';
}

function coverageFromPacket(packet) {
  const summary = packet?.requirements_status_summary || {};
  const requirements = Array.isArray(packet?.requirements) ? packet.requirements : [];
  const counts = summary.counts_by_status || {};
  const total = Number(summary.total_requirements ?? requirements.length ?? 0);
  const responded = Number(summary.responded_requirements ?? COVERED_STATUSES.reduce((sum, key) => sum + Number(counts[key] || 0), 0));
  const open = Number(summary.open_requirements ?? Number(counts.needed || 0) + Number(counts.needs_attention || 0));
  const percent = total > 0 ? Math.round((responded / total) * 100) : 0;
  return {
    counts,
    total,
    responded,
    open,
    percent,
    complete: Boolean(summary.packet_complete),
    definition: summary.packet_complete_definition,
  };
}

function groupRequirements(requirements = []) {
  const groups = new Map();
  requirements.forEach((requirement) => {
    const group = requirement.group_label || requirement.group || 'Checklist';
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group).push(requirement);
  });
  return Array.from(groups.entries()).map(([group, items]) => ({ group, items }));
}

function friendlyError(error) {
  const detail = error?.payload?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.user_message) return detail.user_message;
  return error?.message || 'Packet request failed.';
}

function googleDriveReconnectDetail(error) {
  const detail = error?.payload?.detail;
  if (!detail || typeof detail !== 'object') {
    return null;
  }
  const issueState = String(detail.issue_state || detail.status || '').toLowerCase();
  const actionLabel = String(detail.action_label || '').toLowerCase();
  if (
    issueState === 'google_drive_reconnect_required' ||
    issueState === 'needs_reconnect' ||
    actionLabel.includes('reconnect google drive')
  ) {
    return detail;
  }
  return null;
}

function documentDisplayName(document) {
  return document?.filename || document?.original_filename || document?.file_name || document?.document_id || document?.file_id || 'Document';
}

function documentFileId(document) {
  return document?.file_id || document?.document_id || document?.upload_id || document?.matched_s3_upload_id || '';
}

function formatBytes(value) {
  const numeric = Number(value || 0);
  if (!numeric) return 'Unknown size';
  if (numeric < 1024) return `${numeric.toLocaleString()} B`;
  if (numeric < 1024 * 1024) return `${(numeric / 1024).toFixed(1)} KB`;
  return `${(numeric / 1024 / 1024).toFixed(1)} MB`;
}

async function sha256File(selectedFile) {
  if (!window.crypto?.subtle) {
    return null;
  }
  const buffer = await selectedFile.arrayBuffer();
  const digest = await window.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function uploadItemId(selectedFile, index) {
  return `${selectedFile.name}-${selectedFile.size}-${selectedFile.lastModified}-${index}`;
}

function uploadWithProgress(url, { method = 'PUT', headers = {}, file, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.entries(headers || {}).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && typeof onProgress === 'function') {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ status: xhr.status });
      } else {
        reject(new Error(`Upload failed with HTTP ${xhr.status}.`));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Upload failed before the secure workspace copy was created.')));
    xhr.addEventListener('abort', () => reject(new Error('Upload was cancelled.')));
    xhr.send(file);
  });
}

function GuardrailPanel({ guardrails, completionDefinition }) {
  const message = guardrails?.user_message ||
    'This packet helps organize documents and notes for review. It does not decide what must be filed, served, exchanged, or omitted.';
  const definition = completionDefinition || guardrails?.packet_complete_definition ||
    'Packet complete means each checklist item has a document, note, skipped, or may-not-apply response. Review carefully before sharing, serving, or filing.';
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
        <div className="space-y-2">
          <p className="font-semibold">Organizational checklist only</p>
          <p>{message}</p>
          <p>{definition} It does not mean the packet has been reviewed by a lawyer or accepted by any court.</p>
        </div>
      </div>
    </section>
  );
}

function ComingLaterPanel() {
  return (
    <section className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 shadow-sm dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
      <div className="flex items-start gap-3">
        <NotepadText className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
        <div>
          <p className="font-semibold">Checklist planning is available now</p>
          <p className="mt-1">
            Link existing case documents to checklist items, import from Google Drive, or upload files from this screen. Packet export,
            sharing, and draft affidavit generation are coming later.
          </p>
        </div>
      </div>
    </section>
  );
}

function TemplatePicker({ templates, creating, onCreate, canContribute, templatesLoading, onRefresh }) {
  if (!templates.length) {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold">No packet templates available</h3>
            <p className="mt-2 text-sm">
              Packet setup opened, but this workspace is not receiving packet templates yet. Refresh templates and try again.
              If this keeps happening, use Help & Support so we can check the packet template connection.
            </p>
          </div>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={templatesLoading}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100 dark:hover:bg-amber-900/40"
            >
              {templatesLoading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
              Refresh templates
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-md border border-gray-200 bg-gray-50 p-2 text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200">
          <PackageCheck size={18} aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-950 dark:text-white">Choose a packet template</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            You can start with what you know. Mark items as needed, added, skipped, or may not apply, and add notes for review.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {templates.map((template) => (
          <article
            key={`${template.template_id}:${template.version}`}
            className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-[#0b1117]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-base font-semibold text-gray-950 dark:text-white">{template.name}</h4>
                <p className="mt-1 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Version {template.version || 'current'}
                </p>
              </div>
              <StatusBadge status={template.status || 'active'} />
            </div>
            <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
              {template.description ||
                'Organize documents and notes that may support a Florida family-law financial affidavit and disclosure review.'}
            </p>
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              This packet helps organize checklist coverage. It does not decide what must be filed, served, exchanged, or omitted.
            </div>
            <button
              type="button"
              onClick={() => onCreate(template)}
              disabled={!canContribute || creating === template.template_id}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              {creating === template.template_id ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
              {canContribute ? 'Create packet' : 'Create packet unavailable'}
            </button>
            {!canContribute ? (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">This account can view packets but cannot create or edit them.</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function PacketCreateDialog({
  open,
  templates,
  creating,
  onCreate,
  canContribute,
  onClose,
  onRefresh,
  templatesLoading,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 pt-16 backdrop-blur-sm sm:p-6 sm:pt-20">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="packet-setup-title"
        className="w-full max-w-4xl rounded-2xl border border-[var(--lakai-border)] bg-[var(--lakai-surface)] p-5 shadow-2xl"
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-[var(--lakai-text-muted)]">Packet setup</p>
            <h2 id="packet-setup-title" className="mt-1 text-xl font-semibold text-[var(--lakai-text)]">
              Choose a packet template
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-[var(--lakai-text-muted)]">
              Create a packet to organize checklist items, notes, and materials for review. You can start with what you know and
              update the checklist later.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--lakai-border)] bg-[var(--lakai-surface)] px-3 py-2 text-sm font-semibold text-[var(--lakai-text)] transition hover:bg-[var(--lakai-surface-muted)]"
          >
            <X size={16} aria-hidden="true" />
            Close
          </button>
        </div>
        <TemplatePicker
          templates={templates}
          creating={creating}
          onCreate={onCreate}
          canContribute={canContribute}
          templatesLoading={templatesLoading}
          onRefresh={onRefresh}
        />
      </section>
    </div>
  );
}

function PacketDocumentPicker({
  open,
  requirement,
  mode,
  onModeChange,
  documents,
  loading,
  selectedFileIds,
  search,
  onSearchChange,
  onRefresh,
  onToggle,
  onClose,
  onLink,
  linking,
  canContribute,
  localUploadItems,
  localUploading,
  onLocalFilesChange,
  onUploadLocalFiles,
  connectorsLoading,
  connectorError,
  connectorAction,
  activeGoogleConnection,
  onConnectGoogleDrive,
  driveSearch,
  onDriveSearchChange,
  driveLoading,
  driveItems,
  drivePath,
  driveSelectedIds,
  driveAction,
  onDriveSearch,
  onBrowseDriveRoot,
  onToggleDriveItem,
  onToggleAllDriveFiles,
  onPreviewDriveItem,
  onImportDriveItems,
}) {
  if (!open || !requirement) {
    return null;
  }

  const tabs = [
    { id: 'existing', label: 'Choose from Documents', icon: Paperclip },
    { id: 'google_drive', label: 'Google Drive', icon: FolderOpen },
    { id: 'local_upload', label: 'Upload from computer', icon: FileUp },
  ];
  const selectedDriveItems = driveItems.filter((item) => driveSelectedIds.includes(item.id));
  const busy = linking || localUploading || Boolean(driveAction);
  const reconnectDetail = googleDriveReconnectDetail(connectorError);
  const currentDrivePath = drivePath?.length ? drivePath : [{ id: 'root', name: 'My Drive' }];
  const parentDriveFolder = currentDrivePath.length > 1 ? currentDrivePath[currentDrivePath.length - 2] : null;
  const visibleDriveFiles = driveItems.filter((item) => item.mimeType !== GOOGLE_FOLDER_MIME_TYPE);
  const allVisibleDriveFilesSelected = visibleDriveFiles.length > 0 && visibleDriveFiles.every((item) => driveSelectedIds.includes(item.id));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 pt-16 backdrop-blur-sm sm:p-6 sm:pt-20">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="packet-document-picker-title"
        className="w-full max-w-6xl rounded-2xl border border-[var(--lakai-border)] bg-[var(--lakai-surface)] p-5 shadow-2xl"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-[var(--lakai-text-muted)]">Add documents</p>
            <h2 id="packet-document-picker-title" className="mt-1 text-xl font-semibold text-[var(--lakai-text)]">
              Choose documents for this checklist item
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-[var(--lakai-text-muted)]">
              Selected files stay in the case Documents library and are linked to <span className="font-semibold text-[var(--lakai-text)]">{requirement.label}</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--lakai-border)] bg-[var(--lakai-surface)] px-3 py-2 text-sm font-semibold text-[var(--lakai-text)] transition hover:bg-[var(--lakai-surface-muted)]"
          >
            <X size={16} aria-hidden="true" />
            Close
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
          Add files here without leaving this packet. New uploads and Drive imports are added to the case Documents library, then linked to this checklist item.
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {tabs.map((tab) => {
            const TabIcon = tab.icon;
            return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onModeChange(tab.id)}
              disabled={busy}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                mode === tab.id
                  ? 'border-[var(--lakai-primary)] bg-[var(--lakai-primary)] text-white'
                  : 'border-[var(--lakai-border)] bg-[var(--lakai-surface)] text-[var(--lakai-text)] hover:bg-[var(--lakai-surface-muted)]'
              }`}
            >
              <TabIcon size={16} aria-hidden="true" />
              {tab.label}
            </button>
            );
          })}
        </div>

        {mode === 'existing' ? (
          <>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--lakai-text-muted)]" size={16} aria-hidden="true" />
            <span className="sr-only">Search documents</span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search Documents"
              className="min-h-11 w-full rounded-md border border-[var(--lakai-border)] bg-[var(--lakai-surface)] py-2 pl-10 pr-3 text-sm text-[var(--lakai-text)] outline-none transition focus:border-[var(--lakai-primary)] focus:ring-2 focus:ring-[var(--lakai-primary)]/20"
            />
          </label>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--lakai-border)] bg-[var(--lakai-surface)] px-3 py-2 text-sm font-semibold text-[var(--lakai-text)] transition hover:bg-[var(--lakai-surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
            Refresh
          </button>
        </div>

        <div className="mt-4 max-h-[48vh] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <EmptyState title="Loading documents" description="Checking the case Documents library." />
          ) : documents.length ? (
            documents.map((document) => {
              const fileId = documentFileId(document);
              const checked = selectedFileIds.includes(fileId);
              return (
                <label
                  key={fileId || document.content_hash || documentDisplayName(document)}
                  className="flex cursor-pointer gap-3 rounded-lg border border-[var(--lakai-border)] bg-[var(--lakai-surface-muted)] p-3 transition hover:border-[var(--lakai-primary)]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(fileId)}
                    disabled={!fileId || !canContribute}
                    className="mt-1 h-4 w-4 accent-[var(--lakai-primary)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold text-[var(--lakai-text)]">{documentDisplayName(document)}</p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--lakai-text-muted)]">
                      <span>{document.origin_label || document.source_provider || 'Documents'}</span>
                      {document.canonical_storage_label ? <span>{document.canonical_storage_label}</span> : null}
                      {document.page_rows || document.page_count ? <span>Ready for search</span> : <span>Processing</span>}
                    </div>
                  </div>
                </label>
              );
            })
          ) : (
            <EmptyState title="No matching documents" description="Try a different search, or use the upload options in this dialog." />
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-[var(--lakai-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--lakai-text-muted)]">
            {selectedFileIds.length ? `${selectedFileIds.length} document(s) selected.` : 'Select one or more documents to link.'}
          </p>
          <button
            type="button"
            onClick={onLink}
            disabled={!canContribute || !selectedFileIds.length || linking}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--lakai-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--lakai-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {linking ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Paperclip size={16} aria-hidden="true" />}
            Link selected documents
          </button>
        </div>
          </>
        ) : null}

        {mode === 'google_drive' ? (
          <div className="mt-4 space-y-4">
            {reconnectDetail ? (
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold">{reconnectDetail.display_status || 'Reconnect Google Drive'}</p>
                    <p className="mt-1">
                      {reconnectDetail.user_message || reconnectDetail.display_message || friendlyError(connectorError)}
                    </p>
                    {reconnectDetail.preserves_source_selections ? (
                      <p className="mt-2 text-xs">Your selected Drive folders stay saved after you reconnect.</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={onConnectGoogleDrive}
                    disabled={Boolean(connectorAction)}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-[var(--lakai-primary)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {connectorAction ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
                    {reconnectDetail.action_label || 'Reconnect Google Drive'}
                  </button>
                </div>
              </section>
            ) : connectorError ? (
              <ErrorPanel title="Google Drive connection needs attention" error={{ message: friendlyError(connectorError) }} />
            ) : null}
            {connectorsLoading ? (
              <EmptyState title="Checking Google Drive" description="Looking for a connected Google Drive account." />
            ) : !activeGoogleConnection ? (
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">Reconnect Google Drive</p>
                    <p className="mt-1">Connect or reconnect Google Drive before selecting files for this packet item.</p>
                  </div>
                  <button
                    type="button"
                    onClick={onConnectGoogleDrive}
                    disabled={Boolean(connectorAction)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--lakai-primary)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {connectorAction ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
                    Reconnect Google Drive
                  </button>
                </div>
              </section>
            ) : (
              <>
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <label className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--lakai-text-muted)]" size={16} aria-hidden="true" />
                    <span className="sr-only">Search Google Drive</span>
                    <input
                      value={driveSearch}
                      onChange={(event) => onDriveSearchChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          onDriveSearch();
                        }
                      }}
                      placeholder="Search Google Drive"
                      className="min-h-11 w-full rounded-md border border-[var(--lakai-border)] bg-[var(--lakai-surface)] py-2 pl-10 pr-3 text-sm text-[var(--lakai-text)] outline-none transition focus:border-[var(--lakai-primary)] focus:ring-2 focus:ring-[var(--lakai-primary)]/20"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={onDriveSearch}
                    disabled={driveLoading}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--lakai-border)] bg-[var(--lakai-surface)] px-3 py-2 text-sm font-semibold text-[var(--lakai-text)] transition hover:bg-[var(--lakai-surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {driveLoading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
                    Search
                  </button>
                  <button
                    type="button"
                    onClick={() => onBrowseDriveRoot('root', 'My Drive', [{ id: 'root', name: 'My Drive' }])}
                    disabled={driveLoading}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--lakai-border)] bg-[var(--lakai-surface)] px-3 py-2 text-sm font-semibold text-[var(--lakai-text)] transition hover:bg-[var(--lakai-surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Folder size={16} aria-hidden="true" />
                    My Drive
                  </button>
                </div>

                <div className="rounded-lg border border-[var(--lakai-border)] bg-[var(--lakai-surface-muted)] px-3 py-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <nav aria-label="Google Drive folder path" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
                      <span className="mr-1 text-xs font-semibold uppercase tracking-normal text-[var(--lakai-text-muted)]">Location</span>
                      {currentDrivePath.map((crumb, index) => {
                        const isLast = index === currentDrivePath.length - 1;
                        const crumbPath = currentDrivePath.slice(0, index + 1);
                        return (
                          <span key={`${crumb.id || crumb.name}-${index}`} className="inline-flex min-w-0 items-center gap-1">
                            {index > 0 ? <span className="text-[var(--lakai-text-muted)]">/</span> : null}
                            {isLast || crumb.search ? (
                              <span className="max-w-[14rem] truncate font-semibold text-[var(--lakai-text)]">{crumb.name}</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onBrowseDriveRoot(crumb.id, crumb.name, crumbPath)}
                                disabled={driveLoading}
                                className="max-w-[14rem] truncate font-semibold text-[var(--lakai-primary)] hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {crumb.name}
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </nav>
                    <button
                      type="button"
                      onClick={() => parentDriveFolder ? onBrowseDriveRoot(parentDriveFolder.id, parentDriveFolder.name, currentDrivePath.slice(0, -1)) : undefined}
                      disabled={!parentDriveFolder || driveLoading}
                      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-[var(--lakai-border)] bg-[var(--lakai-surface)] px-3 py-2 text-sm font-semibold text-[var(--lakai-text)] transition hover:bg-[var(--lakai-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ArrowLeft size={16} aria-hidden="true" />
                      Back
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-[var(--lakai-text-muted)]">
                    {visibleDriveFiles.length
                      ? `${selectedDriveItems.length} of ${visibleDriveFiles.length} visible file(s) selected.`
                      : 'Open folders or search Google Drive to choose files.'}
                  </p>
                  <button
                    type="button"
                    onClick={onToggleAllDriveFiles}
                    disabled={!canContribute || driveLoading || !visibleDriveFiles.length}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--lakai-border)] bg-[var(--lakai-surface)] px-3 py-2 text-sm font-semibold text-[var(--lakai-text)] transition hover:bg-[var(--lakai-surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CheckCircle2 size={16} aria-hidden="true" />
                    {allVisibleDriveFilesSelected ? 'Deselect visible files' : 'Select visible files'}
                  </button>
                </div>

                <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
                  {driveLoading ? (
                    <EmptyState title="Loading Drive files" description="Checking your connected Google Drive." />
                  ) : driveItems.length ? (
                    driveItems.map((item) => {
                      const isFolder = item.mimeType === GOOGLE_FOLDER_MIME_TYPE;
                      const checked = driveSelectedIds.includes(item.id);
                      return (
                        <div key={item.id} className="flex gap-3 rounded-lg border border-[var(--lakai-border)] bg-[var(--lakai-surface-muted)] p-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleDriveItem(item)}
                            disabled={isFolder || !canContribute || Boolean(driveAction)}
                            className="mt-1 h-4 w-4 accent-[var(--lakai-primary)]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex min-w-0 items-center gap-2">
                                {isFolder ? <Folder size={16} className="shrink-0 text-amber-600" aria-hidden="true" /> : <FileText size={16} className="shrink-0 text-[var(--lakai-text-muted)]" aria-hidden="true" />}
                                <button
                                  type="button"
                                  onClick={() => isFolder ? onBrowseDriveRoot(item.id, item.name, [...currentDrivePath.filter((crumb) => !crumb.search), { id: item.id, name: item.name || 'Folder' }]) : onToggleDriveItem(item)}
                                  className={`min-w-0 break-words text-left text-sm font-semibold ${isFolder ? 'text-[var(--lakai-primary)] hover:underline' : 'text-[var(--lakai-text)]'}`}
                                >
                                  {item.name || item.id}
                                </button>
                              </div>
                              {!isFolder ? (
                                <button
                                  type="button"
                                  onClick={() => onPreviewDriveItem(item)}
                                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-[var(--lakai-border)] bg-[var(--lakai-surface)] px-3 py-2 text-xs font-semibold text-[var(--lakai-text)] transition hover:bg-[var(--lakai-surface-muted)]"
                                >
                                  Preview
                                </button>
                              ) : null}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--lakai-text-muted)]">
                              <span>{isFolder ? 'Folder' : formatBytes(item.size)}</span>
                              {item.modifiedTime ? <span>Updated {new Date(item.modifiedTime).toLocaleDateString()}</span> : null}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <EmptyState title="No Drive files shown" description="Search Google Drive or open My Drive to choose files." />
                  )}
                </div>

                <div className="flex flex-col gap-3 border-t border-[var(--lakai-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-[var(--lakai-text-muted)]">
                    {selectedDriveItems.length ? `${selectedDriveItems.length} Drive file(s) selected.` : 'Select one or more Drive files to import and link.'}
                  </p>
                  <button
                    type="button"
                    onClick={onImportDriveItems}
                    disabled={!canContribute || !selectedDriveItems.length || Boolean(driveAction)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--lakai-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--lakai-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {driveAction ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <UploadCloud size={16} aria-hidden="true" />}
                    Import and link selected
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {mode === 'local_upload' ? (
          <div className="mt-4 space-y-4">
            <label className="block rounded-lg border border-dashed border-[var(--lakai-border)] bg-[var(--lakai-surface-muted)] p-5 text-center">
              <FileUp className="mx-auto text-[var(--lakai-text-muted)]" size={24} aria-hidden="true" />
              <span className="mt-2 block text-sm font-semibold text-[var(--lakai-text)]">Choose files from this computer</span>
              <span className="mt-1 block text-sm text-[var(--lakai-text-muted)]">
                Files are uploaded to this case, registered for processing, and linked to {requirement.label}.
              </span>
              <input
                type="file"
                multiple
                disabled={!canContribute || localUploading}
                onChange={(event) => onLocalFilesChange(Array.from(event.target.files || []))}
                className="sr-only"
              />
            </label>

            <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
              {localUploadItems.length ? (
                localUploadItems.map((item) => (
                  <div key={item.id} className="rounded-lg border border-[var(--lakai-border)] bg-[var(--lakai-surface-muted)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-[var(--lakai-text)]">{item.name}</p>
                        <p className="mt-1 text-xs text-[var(--lakai-text-muted)]">{formatBytes(item.size)} · {item.message || 'Ready to upload.'}</p>
                      </div>
                      {item.progress >= 100 ? <CheckCircle2 className="shrink-0 text-emerald-600" size={18} aria-hidden="true" /> : null}
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                      <div
                        className="h-full rounded-full bg-[var(--lakai-primary)] transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, item.progress || 0))}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="No files selected" description="Choose files from this computer to upload and link here." />
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-[var(--lakai-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[var(--lakai-text-muted)]">
                {localUploadItems.length ? `${localUploadItems.length} file(s) ready.` : 'Select files to start upload.'}
              </p>
              <button
                type="button"
                onClick={onUploadLocalFiles}
                disabled={!canContribute || !localUploadItems.length || localUploading}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--lakai-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--lakai-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {localUploading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <UploadCloud size={16} aria-hidden="true" />}
                Upload and link files
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function PacketCard({ packet, caseId }) {
  const coverage = coverageFromPacket(packet);
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-base font-semibold text-gray-950 dark:text-white">{packet.name || 'Packet'}</h3>
            <StatusBadge status={statusTone(packet.status)} label={packetStatusLabel(packet.status)} />
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {packet.template_id === 'florida_financial_disclosure_packet' ? 'Florida Financial Disclosure Packet' : humanizeKey(packet.packet_type || packet.template_id || 'packet')}
            {packet.template_version ? ` · ${packet.template_version}` : ''}
          </p>
          {packet.purpose ? <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{packet.purpose}</p> : null}
        </div>
        <Link
          to={evidenceCasePath({ caseId }, `/packets/${packet.packet_id}`)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100 dark:hover:bg-white/10"
        >
          <FolderOpen size={16} aria-hidden="true" />
          Open
        </Link>
      </div>
      <ProgressMeter
        className="mt-4"
        value={coverage.percent}
        label="Checklist coverage"
        valueLabel={`${coverage.responded}/${coverage.total || 0}`}
        detail={`${formatCount(coverage.open)} item(s) still need a document, note, skip, or may-not-apply response.`}
      />
      <div className="mt-4 grid gap-2 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-3">
        <span>Created {formatDateTime(packet.created_at)}</span>
        <span>Updated {formatDateTime(packet.updated_at)}</span>
        <span>{coverage.complete ? 'Coverage complete' : 'Coverage in progress'}</span>
      </div>
    </article>
  );
}

function RequirementEditor({
  requirement,
  packetId,
  canContribute,
  saving,
  unlinking,
  onSave,
  onOpenDocumentPicker,
  onUnlinkDocument,
}) {
  const [status, setStatus] = useState(requirement.status || 'needed');
  const [note, setNote] = useState(requirement.user_note || '');
  const [attentionReason, setAttentionReason] = useState(requirement.attention_reason || '');

  const changed =
    status !== (requirement.status || 'needed') ||
    note !== (requirement.user_note || '') ||
    attentionReason !== (requirement.attention_reason || '');

  const requirementId = requirement.requirement_id;
  const rowSaving = saving === requirementId;
  const linkedDocuments = Array.isArray(requirement.linked_documents) ? requirement.linked_documents : [];
  const links = Array.isArray(requirement.links) ? requirement.links : [];
  const templateGuidance = requirement.metadata_json?.upload_guidance;
  const uploadGuidance = Array.isArray(templateGuidance) && templateGuidance.length
    ? templateGuidance
    : REQUIREMENT_UPLOAD_GUIDANCE[requirementId] || [];

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="break-words text-sm font-semibold text-gray-950 dark:text-white">{requirement.label}</h4>
            <StatusBadge status={statusTone(status)} label={requirementStatusLabel(status)} />
          </div>
          {requirement.description ? <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{requirement.description}</p> : null}
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{requirementStatusHelper(status)}</p>
        </div>
        {requirement.export_folder_path ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-800 dark:bg-white/5 dark:text-gray-300">
            Folder: {requirement.export_folder_path}
          </div>
        ) : null}
      </div>

      {uploadGuidance.length ? (
        <section className="mt-4 rounded-lg border border-[var(--lakai-border)] bg-[var(--lakai-surface-muted)] p-3">
          <p className="text-sm font-semibold text-[var(--lakai-text)]">What to upload</p>
          <ul className="mt-2 space-y-1.5 text-sm text-[var(--lakai-text-muted)]">
            {uploadGuidance.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--lakai-primary)]" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[var(--lakai-text-muted)]">
            This checklist is for organization and review. Your situation, court order, or lawyer may require different or additional documents.
          </p>
        </section>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        <label className="block">
          <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            disabled={!canContribute || rowSaving}
            className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100 dark:disabled:bg-black/30"
          >
            {REQUIREMENT_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={!canContribute || rowSaving}
            rows={3}
            maxLength={4000}
            placeholder="Add a short note for your own review or for a lawyer later."
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100 dark:placeholder:text-gray-500 dark:disabled:bg-black/30"
          />
        </label>
      </div>

      {status === 'needs_attention' ? (
        <label className="mt-3 block">
          <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">What needs attention?</span>
          <input
            type="text"
            value={attentionReason}
            onChange={(event) => setAttentionReason(event.target.value)}
            disabled={!canContribute || rowSaving}
            maxLength={1000}
            placeholder="Example: waiting for bank statements or review with lawyer."
            className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100 dark:placeholder:text-gray-500 dark:disabled:bg-black/30"
          />
        </label>
      ) : null}

      <section className="mt-4 rounded-lg border border-[var(--lakai-border)] bg-[var(--lakai-surface-muted)] p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--lakai-text)]">
              {linkedDocuments.length ? `${linkedDocuments.length} document(s) linked` : 'No documents linked yet'}
            </p>
            <p className="mt-1 text-xs text-[var(--lakai-text-muted)]">
              Packet links organize case documents under this checklist item. Removing a link does not delete the document.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onOpenDocumentPicker(requirement)}
              disabled={!canContribute}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--lakai-border)] bg-[var(--lakai-surface)] px-3 py-2 text-sm font-semibold text-[var(--lakai-text)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-white/10"
            >
              <Paperclip size={16} aria-hidden="true" />
              Add documents
            </button>
          </div>
        </div>

        {links.length ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {links.map((link) => {
              const document = link.document || linkedDocuments.find((item) => documentFileId(item) === link.file_id) || {};
              const linkId = link.packet_requirement_link_id;
              return (
                <div key={linkId || documentFileId(document)} className="rounded-md border border-[var(--lakai-border)] bg-[var(--lakai-surface)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-[var(--lakai-text)]">{documentDisplayName(document)}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--lakai-text-muted)]">
                        <span>{document.source_label || document.source_provider || 'Linked from Documents'}</span>
                        {document.readiness_label ? <span>{document.readiness_label}</span> : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onUnlinkDocument(requirement, link)}
                      disabled={!canContribute || unlinking === linkId}
                      className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-md border border-[var(--lakai-border)] px-2 text-xs font-semibold text-[var(--lakai-text-muted)] transition hover:bg-[var(--lakai-surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                      title="Remove from this packet item"
                    >
                      {unlinking === linkId ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
                      Remove link
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Financial packets may contain sensitive personal and financial information. Review carefully before sharing, serving, or filing.
        </p>
        <button
          type="button"
          disabled={!canContribute || !changed || rowSaving}
          onClick={() => onSave(packetId, requirementId, { status, user_note: note, attention_reason: attentionReason })}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
        >
          {rowSaving ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          Save item
        </button>
      </div>
    </article>
  );
}

export default function PacketsPage() {
  const { caseId, packetId } = useParams();
  const navigate = useNavigate();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { activeCase } = useCaseContext();
  const { canContribute } = useOperatorMode();
  const [state, setState] = useState({
    loading: true,
    templatesLoading: true,
    creating: null,
    savingRequirement: null,
    error: null,
    notice: null,
    templates: [],
    packets: [],
    packet: null,
    fingerprint: null,
  });
  const [showCreateFlow, setShowCreateFlow] = useState(false);
  const [documentPicker, setDocumentPicker] = useState({
    open: false,
    requirement: null,
    mode: 'existing',
    loading: false,
    linking: false,
    search: '',
    documents: [],
    selectedFileIds: [],
    localUploading: false,
    localUploadItems: [],
    connectorsLoading: false,
    connectorAction: null,
    connectorError: null,
    connectors: [],
    driveSearch: '',
    driveLoading: false,
    driveAction: null,
    driveItems: [],
    drivePath: [{ id: 'root', name: 'My Drive' }],
    driveSelectedIds: [],
  });
  const [unlinking, setUnlinking] = useState(null);

  useEffect(() => {
    if (!documentPicker.open || documentPicker.mode !== 'existing') {
      return undefined;
    }
    const timeoutId = window.setTimeout(async () => {
      setDocumentPicker((current) => ({ ...current, loading: true }));
      try {
        const token = await getAccessToken();
        const result = await evidenceApi.getDocuments(
          caseId,
          {
            limit: 50,
            offset: 0,
            q: documentPicker.search || undefined,
            sort_by: 'updated_at',
            sort_dir: 'desc',
          },
          { token },
        );
        recordFingerprint(result, 'Packet document picker');
        setDocumentPicker((current) => ({
          ...current,
          loading: false,
          documents: result.data?.documents || [],
        }));
      } catch (error) {
        setDocumentPicker((current) => ({ ...current, loading: false }));
        setState((current) => ({ ...current, error }));
      }
    }, 350);
    return () => window.clearTimeout(timeoutId);
  }, [caseId, documentPicker.mode, documentPicker.open, documentPicker.search, getAccessToken, recordFingerprint]);

  const loadPackets = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const [packetsResult, templatesResult] = await Promise.all([
        evidenceApi.getPackets(caseId, { token }),
        evidenceApi.getPacketTemplates({}, { token }),
      ]);
      recordFingerprint(packetsResult, 'Packets');
      const packets = packetsResult.data?.packets || [];
      const templates = templatesResult.data?.templates || [];
      let packet = null;
      let fingerprint = packetsResult.requestFingerprintId;
      if (packetId) {
        const packetResult = await evidenceApi.getPacket(caseId, packetId, { token });
        recordFingerprint(packetResult, 'Packet detail');
        packet = packetResult.data?.packet || null;
        fingerprint = packetResult.requestFingerprintId;
      }
      setState((current) => ({
        ...current,
        loading: false,
        templatesLoading: false,
        error: null,
        packets,
        templates,
        packet,
        fingerprint,
      }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, templatesLoading: false, error }));
    }
  }, [caseId, packetId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    loadPackets();
  }, [loadPackets]);

  const selectedPacket = state.packet;
  const coverage = useMemo(() => coverageFromPacket(selectedPacket), [selectedPacket]);
  const groupedRequirements = useMemo(
    () => groupRequirements(selectedPacket?.requirements || []),
    [selectedPacket?.requirements],
  );
  const activeGoogleConnection = useMemo(() => {
    const google = documentPicker.connectors.find((provider) => provider.provider === 'google_drive');
    return google?.connections?.find((connection) => (
      connection.status === 'active' &&
      (connection.can_browse || connection.owned_by_current_user)
    )) || null;
  }, [documentPicker.connectors]);

  function startPacketWorkflow() {
    setShowCreateFlow(true);
  }

  function closePacketWorkflow() {
    if (!state.creating) {
      setShowCreateFlow(false);
    }
  }

  async function createPacket(template) {
    if (!canContribute) {
      return;
    }
    setState((current) => ({ ...current, creating: template.template_id, error: null, notice: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.createPacket(
        caseId,
        {
          template_id: template.template_id,
          template_version: template.version,
          name: template.name,
          purpose: 'Organize documents and notes for financial disclosure review.',
          jurisdiction_context: template.jurisdiction || {},
        },
        { token },
      );
      recordFingerprint(result, 'Create packet');
      const packet = result.data?.packet;
      setState((current) => ({
        ...current,
        creating: null,
        notice: result.data?.message || 'Packet checklist created.',
        fingerprint: result.requestFingerprintId,
      }));
      setShowCreateFlow(false);
      if (packet?.packet_id) {
        navigate(evidenceCasePath(activeCase, `/packets/${packet.packet_id}`));
      } else {
        await loadPackets();
      }
    } catch (error) {
      setState((current) => ({ ...current, creating: null, error }));
    }
  }

  async function saveRequirement(nextPacketId, requirementId, payload) {
    if (!canContribute) {
      return;
    }
    setState((current) => ({ ...current, savingRequirement: requirementId, error: null, notice: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.updatePacketRequirement(caseId, nextPacketId, requirementId, payload, { token });
      recordFingerprint(result, 'Update packet item');
      setState((current) => ({
        ...current,
        savingRequirement: null,
        packet: result.data?.packet || current.packet,
        notice: result.data?.message || 'Packet checklist item updated.',
        fingerprint: result.requestFingerprintId,
      }));
    } catch (error) {
      setState((current) => ({ ...current, savingRequirement: null, error }));
    }
  }

  async function loadPickerDocuments(nextSearch = documentPicker.search) {
    setDocumentPicker((current) => ({ ...current, loading: true }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getDocuments(
        caseId,
        {
          limit: 50,
          offset: 0,
          q: nextSearch || undefined,
          sort_by: 'updated_at',
          sort_dir: 'desc',
        },
        { token },
      );
      recordFingerprint(result, 'Packet document picker');
      setDocumentPicker((current) => ({
        ...current,
        loading: false,
        documents: result.data?.documents || [],
      }));
    } catch (error) {
      setDocumentPicker((current) => ({ ...current, loading: false }));
      setState((current) => ({ ...current, error }));
    }
  }

  function openDocumentPicker(requirement) {
    setDocumentPicker({
      open: true,
      requirement,
      mode: 'existing',
      loading: false,
      linking: false,
      search: '',
      documents: [],
      selectedFileIds: [],
      localUploading: false,
      localUploadItems: [],
      connectorsLoading: false,
      connectorAction: null,
      connectorError: null,
      connectors: [],
      driveSearch: '',
      driveLoading: false,
      driveAction: null,
      driveItems: [],
      drivePath: [{ id: 'root', name: 'My Drive' }],
      driveSelectedIds: [],
    });
  }

  function closeDocumentPicker() {
    if (!documentPicker.linking && !documentPicker.localUploading && !documentPicker.driveAction) {
      setDocumentPicker((current) => ({ ...current, open: false, requirement: null, selectedFileIds: [] }));
    }
  }

  function updatePickerSearch(search) {
    setDocumentPicker((current) => ({ ...current, search }));
  }

  async function loadPacketConnectors() {
    setDocumentPicker((current) => ({ ...current, connectorsLoading: true, connectorError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getSourceConnectors(caseId, { token });
      recordFingerprint(result, 'Packet source connectors');
      setDocumentPicker((current) => ({
        ...current,
        connectorsLoading: false,
        connectors: result.data?.providers || [],
      }));
    } catch (error) {
      setDocumentPicker((current) => ({ ...current, connectorsLoading: false, connectorError: error }));
    }
  }

  async function connectGoogleDrive() {
    setDocumentPicker((current) => ({ ...current, connectorAction: 'google_drive', connectorError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.authorizeGoogleDrive(caseId, { display_name: 'Google Drive' }, { token });
      recordFingerprint(result, 'Authorize Google Drive from packet');
      window.location.assign(result.data.auth_url);
    } catch (error) {
      setDocumentPicker((current) => ({ ...current, connectorAction: null, connectorError: error }));
    }
  }

  async function browseDriveFolder(folderId = 'root', folderName = 'My Drive', nextPath = null) {
    if (!activeGoogleConnection?.source_connection_id) {
      await loadPacketConnectors();
      return;
    }
    setDocumentPicker((current) => ({ ...current, driveLoading: true, driveAction: null, connectorError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.browseGoogleDrive(
        caseId,
        activeGoogleConnection.source_connection_id,
        { folder_id: folderId, page_size: 100 },
        { token },
      );
      recordFingerprint(result, 'Packet Google Drive browse');
      setDocumentPicker((current) => ({
        ...current,
        driveLoading: false,
        driveItems: result.data?.files || [],
        drivePath: nextPath || [{ id: folderId, name: folderName || 'My Drive' }],
        driveSelectedIds: [],
      }));
    } catch (error) {
      setDocumentPicker((current) => ({ ...current, driveLoading: false, connectorError: error }));
    }
  }

  async function searchDriveFiles() {
    if (!activeGoogleConnection?.source_connection_id) {
      await loadPacketConnectors();
      return;
    }
    const query = documentPicker.driveSearch.trim();
    if (!query) {
      await browseDriveFolder('root', 'My Drive', [{ id: 'root', name: 'My Drive' }]);
      return;
    }
    setDocumentPicker((current) => ({ ...current, driveLoading: true, connectorError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.searchGoogleDrive(
        caseId,
        activeGoogleConnection.source_connection_id,
        { q: query, page_size: 50 },
        { token },
      );
      recordFingerprint(result, 'Packet Google Drive search');
      setDocumentPicker((current) => ({
        ...current,
        driveLoading: false,
        driveItems: result.data?.files || [],
        drivePath: [{ id: 'root', name: 'My Drive' }, { id: `search:${query}`, name: `Search: ${query}`, search: true }],
        driveSelectedIds: [],
      }));
    } catch (error) {
      setDocumentPicker((current) => ({ ...current, driveLoading: false, connectorError: error }));
    }
  }

  function setPickerMode(mode) {
    setDocumentPicker((current) => ({ ...current, mode }));
    if (mode === 'google_drive') {
      window.setTimeout(() => {
        loadPacketConnectors();
      }, 0);
    }
  }

  function togglePickerDocument(fileId) {
    if (!fileId) {
      return;
    }
    setDocumentPicker((current) => {
      const selected = current.selectedFileIds.includes(fileId)
        ? current.selectedFileIds.filter((item) => item !== fileId)
        : [...current.selectedFileIds, fileId];
      return { ...current, selectedFileIds: selected };
    });
  }

  async function linkSelectedDocuments() {
    const requirement = documentPicker.requirement;
    if (!requirement || !documentPicker.selectedFileIds.length) {
      return;
    }
    setDocumentPicker((current) => ({ ...current, linking: true }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.linkPacketRequirementDocuments(
        caseId,
        selectedPacket.packet_id,
        requirement.requirement_id,
        { file_ids: documentPicker.selectedFileIds },
        { token },
      );
      recordFingerprint(result, 'Link packet documents');
      setState((current) => ({
        ...current,
        packet: result.data?.packet || current.packet,
        notice: result.data?.message || 'Selected documents linked to this checklist item.',
        fingerprint: result.requestFingerprintId,
      }));
      setDocumentPicker((current) => ({ ...current, open: false, requirement: null, linking: false, selectedFileIds: [] }));
    } catch (error) {
      setDocumentPicker((current) => ({ ...current, linking: false }));
      setState((current) => ({ ...current, error }));
    }
  }

  function updateLocalUploadItem(id, patch) {
    setDocumentPicker((current) => ({
      ...current,
      localUploadItems: current.localUploadItems.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }

  function setLocalFiles(files) {
    setDocumentPicker((current) => ({
      ...current,
      localUploadItems: files.map((file, index) => ({
        id: uploadItemId(file, index),
        file,
        name: file.name,
        size: file.size,
        status: 'ready',
        progress: 0,
        message: 'Ready to upload.',
      })),
    }));
  }

  async function uploadLocalFiles() {
    const requirement = documentPicker.requirement;
    const items = documentPicker.localUploadItems;
    if (!requirement || !items.length || !selectedPacket?.packet_id) {
      return;
    }
    setDocumentPicker((current) => ({ ...current, localUploading: true }));
    const uploadedFileIds = [];
    try {
      const token = await getAccessToken();
      for (const item of items) {
        const selectedFile = item.file;
        updateLocalUploadItem(item.id, { status: 'hashing', progress: 8, message: 'Creating file fingerprint.' });
        const contentHash = await sha256File(selectedFile);

        updateLocalUploadItem(item.id, { status: 'preparing', progress: 18, message: 'Preparing secure workspace upload.' });
        const presignResult = await evidenceApi.presignDocumentUpload(
          caseId,
          {
            file_name: selectedFile.name,
            content_type: selectedFile.type || 'application/octet-stream',
            content_length: selectedFile.size,
            content_hash: contentHash || undefined,
            content_hash_algorithm: contentHash ? 'sha256' : undefined,
            source_of_truth_mode: 'web_upload',
            source_provider: 'web_upload',
          },
          { token },
        );
        recordFingerprint(presignResult, `Packet presign upload: ${selectedFile.name}`);

        if (presignResult.data?.already_uploaded) {
          const existingFileId = presignResult.data?.upload?.upload_id;
          if (existingFileId) {
            uploadedFileIds.push(existingFileId);
          }
          updateLocalUploadItem(item.id, {
            status: 'already_uploaded',
            progress: 90,
            message: presignResult.data?.display_message || 'This exact file is already in the workspace.',
          });
          continue;
        }

        const presign = presignResult.data?.presign;
        updateLocalUploadItem(item.id, { status: 'uploading', progress: 30, message: 'Uploading secure workspace copy.' });
        await uploadWithProgress(presign.upload_url, {
          method: presign.method || 'PUT',
          headers: presign.headers || { 'Content-Type': selectedFile.type || 'application/octet-stream' },
          file: selectedFile,
          onProgress: (percent) => updateLocalUploadItem(item.id, {
            progress: 30 + Math.round(Math.min(100, percent) * 0.35),
            message: 'Uploading secure workspace copy.',
          }),
        });

        updateLocalUploadItem(item.id, { status: 'registering', progress: 75, message: 'Registering file and starting processing.' });
        const registerResult = await evidenceApi.registerDocumentUpload(
          caseId,
          { upload_id: presignResult.data.upload.upload_id },
          { token },
        );
        recordFingerprint(registerResult, `Packet register upload: ${selectedFile.name}`);
        const uploadId = registerResult.data?.upload?.upload_id || presignResult.data?.upload?.upload_id;
        if (uploadId) {
          uploadedFileIds.push(uploadId);
        }
        updateLocalUploadItem(item.id, {
          status: 'registered',
          progress: 90,
          message: registerResult.data?.display_message || 'Processing started. Linking to packet item.',
        });
      }

      if (uploadedFileIds.length) {
        const linkResult = await evidenceApi.linkPacketRequirementDocuments(
          caseId,
          selectedPacket.packet_id,
          requirement.requirement_id,
          { file_ids: uploadedFileIds },
          { token },
        );
        recordFingerprint(linkResult, 'Link packet uploads');
        setState((current) => ({
          ...current,
          packet: linkResult.data?.packet || current.packet,
          notice: 'Uploaded files were added to Documents and linked to this packet item. Processing may continue in the background.',
          fingerprint: linkResult.requestFingerprintId,
        }));
        setDocumentPicker((current) => ({
          ...current,
          open: false,
          requirement: null,
          localUploading: false,
          localUploadItems: [],
          selectedFileIds: [],
        }));
      } else {
        setDocumentPicker((current) => ({ ...current, localUploading: false }));
      }
    } catch (error) {
      setDocumentPicker((current) => ({ ...current, localUploading: false }));
      setState((current) => ({ ...current, error }));
    }
  }

  function toggleDriveItem(driveItem) {
    if (!driveItem?.id || driveItem.mimeType === GOOGLE_FOLDER_MIME_TYPE) {
      return;
    }
    setDocumentPicker((current) => {
      const selected = current.driveSelectedIds.includes(driveItem.id)
        ? current.driveSelectedIds.filter((item) => item !== driveItem.id)
        : [...current.driveSelectedIds, driveItem.id];
      return { ...current, driveSelectedIds: selected };
    });
  }

  function toggleAllVisibleDriveFiles() {
    setDocumentPicker((current) => {
      const visibleFileIds = current.driveItems
        .filter((item) => item.mimeType !== GOOGLE_FOLDER_MIME_TYPE)
        .map((item) => item.id)
        .filter(Boolean);
      if (!visibleFileIds.length) {
        return current;
      }
      const visibleSet = new Set(visibleFileIds);
      const selectedSet = new Set(current.driveSelectedIds);
      const allSelected = visibleFileIds.every((fileId) => selectedSet.has(fileId));
      if (allSelected) {
        return {
          ...current,
          driveSelectedIds: current.driveSelectedIds.filter((fileId) => !visibleSet.has(fileId)),
        };
      }
      return {
        ...current,
        driveSelectedIds: Array.from(new Set([...current.driveSelectedIds, ...visibleFileIds])),
      };
    });
  }

  function previewDriveItem(item) {
    const previewUrl = item?.webViewLink || item?.webContentLink || item?.url;
    if (previewUrl) {
      window.open(previewUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setState((current) => ({
      ...current,
      notice: 'Preview is available after this Drive file is imported into Documents.',
    }));
  }

  async function importSelectedDriveItems() {
    const requirement = documentPicker.requirement;
    if (!requirement || !selectedPacket?.packet_id || !activeGoogleConnection?.source_connection_id) {
      return;
    }
    const selectedItems = documentPicker.driveItems.filter((item) => documentPicker.driveSelectedIds.includes(item.id));
    if (!selectedItems.length) {
      return;
    }
    setDocumentPicker((current) => ({ ...current, driveAction: 'import', connectorError: null }));
    const importedFileIds = [];
    try {
      const token = await getAccessToken();
      for (const item of selectedItems) {
        setDocumentPicker((current) => ({ ...current, driveAction: `import:${item.id}` }));
        const result = await evidenceApi.importGoogleDriveFile(
          caseId,
          activeGoogleConnection.source_connection_id,
          { drive_file_id: item.id, add_to_watch: true, register: true },
          { token },
        );
        recordFingerprint(result, 'Import packet Google Drive file');
        const uploadId = result.data?.upload?.upload_id;
        if (uploadId) {
          importedFileIds.push(uploadId);
        }
      }
      if (importedFileIds.length) {
        const linkResult = await evidenceApi.linkPacketRequirementDocuments(
          caseId,
          selectedPacket.packet_id,
          requirement.requirement_id,
          { file_ids: importedFileIds },
          { token },
        );
        recordFingerprint(linkResult, 'Link packet Drive imports');
        setState((current) => ({
          ...current,
          packet: linkResult.data?.packet || current.packet,
          notice: 'Google Drive files were imported into Documents and linked to this packet item. Processing may continue in the background.',
          fingerprint: linkResult.requestFingerprintId,
        }));
        setDocumentPicker((current) => ({
          ...current,
          open: false,
          requirement: null,
          driveAction: null,
          driveSelectedIds: [],
        }));
      } else {
        setDocumentPicker((current) => ({ ...current, driveAction: null }));
      }
    } catch (error) {
      setDocumentPicker((current) => ({ ...current, driveAction: null, connectorError: error }));
    }
  }

  async function unlinkDocument(requirement, link) {
    const linkId = link?.packet_requirement_link_id;
    if (!requirement?.requirement_id || !linkId) {
      return;
    }
    setUnlinking(linkId);
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.unlinkPacketRequirementDocument(
        caseId,
        selectedPacket.packet_id,
        requirement.requirement_id,
        linkId,
        { token },
      );
      recordFingerprint(result, 'Unlink packet document');
      setState((current) => ({
        ...current,
        packet: result.data?.packet || current.packet,
        notice: result.data?.message || 'Document removed from this packet item. It stayed in your case Documents library.',
        fingerprint: result.requestFingerprintId,
      }));
    } catch (error) {
      setState((current) => ({ ...current, error }));
    } finally {
      setUnlinking(null);
    }
  }

  if (selectedPacket) {
    return (
      <div>
        <PageHeader
          title={selectedPacket.name || 'Packet'}
          translateTitle={false}
          description="Track what you have, what still needs attention, and what may not apply."
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={evidenceCasePath(activeCase, '/packets')}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Packets
              </Link>
              <button
                type="button"
                onClick={loadPackets}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
              >
                <RefreshCw size={16} aria-hidden="true" />
                Refresh
              </button>
            </div>
          )}
        />

        {state.error ? <div className="mb-5"><ErrorPanel title="Packet request failed" error={{ message: friendlyError(state.error) }} onRetry={loadPackets} /></div> : null}
        {state.notice ? (
          <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
            {state.notice}
          </div>
        ) : null}

        <PacketDocumentPicker
          open={documentPicker.open}
          requirement={documentPicker.requirement}
          mode={documentPicker.mode}
          onModeChange={setPickerMode}
          documents={documentPicker.documents}
          loading={documentPicker.loading}
          selectedFileIds={documentPicker.selectedFileIds}
          search={documentPicker.search}
          onSearchChange={updatePickerSearch}
          onRefresh={() => loadPickerDocuments(documentPicker.search)}
          onToggle={togglePickerDocument}
          onClose={closeDocumentPicker}
          onLink={linkSelectedDocuments}
          linking={documentPicker.linking}
          canContribute={canContribute}
          localUploadItems={documentPicker.localUploadItems}
          localUploading={documentPicker.localUploading}
          onLocalFilesChange={setLocalFiles}
          onUploadLocalFiles={uploadLocalFiles}
          connectorsLoading={documentPicker.connectorsLoading}
          connectorError={documentPicker.connectorError}
          connectorAction={documentPicker.connectorAction}
          activeGoogleConnection={activeGoogleConnection}
          onConnectGoogleDrive={connectGoogleDrive}
          driveSearch={documentPicker.driveSearch}
          onDriveSearchChange={(driveSearch) => setDocumentPicker((current) => ({ ...current, driveSearch }))}
          driveLoading={documentPicker.driveLoading}
          driveItems={documentPicker.driveItems}
          drivePath={documentPicker.drivePath}
          driveSelectedIds={documentPicker.driveSelectedIds}
          driveAction={documentPicker.driveAction}
          onDriveSearch={searchDriveFiles}
          onBrowseDriveRoot={browseDriveFolder}
          onToggleDriveItem={toggleDriveItem}
          onToggleAllDriveFiles={toggleAllVisibleDriveFiles}
          onPreviewDriveItem={previewDriveItem}
          onImportDriveItems={importSelectedDriveItems}
        />

        <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <GuardrailPanel
            guardrails={selectedPacket.guardrails}
            completionDefinition={coverage.definition || selectedPacket.packet_complete_definition}
          />
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Packet status</p>
                <div className="mt-2"><StatusBadge status={statusTone(selectedPacket.status)} label={packetStatusLabel(selectedPacket.status)} /></div>
              </div>
              <ClipboardCheck className="text-gray-400" size={24} aria-hidden="true" />
            </div>
            <ProgressMeter
              className="mt-4"
              value={coverage.percent}
              label="Checklist coverage"
              valueLabel={`${coverage.responded}/${coverage.total || 0}`}
              detail={`${formatCount(coverage.open)} item(s) still need a document, note, skip, or may-not-apply response.`}
            />
          </section>
        </div>

        <ComingLaterPanel />

        <section className="mt-5 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-950 dark:text-white">Checklist</h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Update each item with a status and note. This is a planning checklist, not a legal completeness review.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              {REQUIREMENT_STATUS_OPTIONS.map((option) => (
                <div key={option.value} className="rounded-md border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-[#101820]">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">{option.label}</div>
                  <div className="text-lg font-semibold text-gray-950 dark:text-white">
                    {formatCount(coverage.counts?.[option.value] || 0)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {groupedRequirements.map(({ group, items }) => (
            <section key={group} className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-gray-500 dark:text-gray-400" aria-hidden="true" />
                <h4 className="text-sm font-semibold uppercase text-gray-600 dark:text-gray-300">{group}</h4>
              </div>
              {items.map((requirement) => (
                <RequirementEditor
                  key={`${requirement.requirement_id}:${requirement.status}:${requirement.updated_at || ''}`}
                  requirement={requirement}
                  packetId={selectedPacket.packet_id}
                  canContribute={canContribute}
                  saving={state.savingRequirement}
                  unlinking={unlinking}
                  onSave={saveRequirement}
                  onOpenDocumentPicker={openDocumentPicker}
                  onUnlinkDocument={unlinkDocument}
                />
              ))}
            </section>
          ))}
        </section>

        {Array.isArray(selectedPacket.events) && selectedPacket.events.length ? (
          <section className="mt-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <h3 className="text-base font-semibold text-gray-950 dark:text-white">Recent packet activity</h3>
            <div className="mt-3 space-y-2">
              {selectedPacket.events.slice(0, 8).map((event) => (
                <div key={event.case_packet_event_id || `${event.event_type}-${event.created_at}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-800 dark:bg-white/5">
                  <span className="font-medium text-gray-800 dark:text-gray-200">{event.message || humanizeKey(event.event_type)}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(event.created_at)}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <RequestFingerprint fingerprint={state.fingerprint} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Packets"
        description="Organize document groups, notes, and checklist items for review or lawyer handoff."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {canContribute ? (
              <button
                type="button"
                onClick={startPacketWorkflow}
                aria-haspopup="dialog"
                aria-expanded={showCreateFlow}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--lakai-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--lakai-primary-strong)]"
              >
                <Plus size={16} aria-hidden="true" />
                Add packet
              </button>
            ) : null}
            <button
              type="button"
              onClick={loadPackets}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </button>
          </div>
        )}
      />

      <PacketCreateDialog
        open={showCreateFlow && canContribute}
        templates={state.templates}
        creating={state.creating}
        onCreate={createPacket}
        canContribute={canContribute}
        onClose={closePacketWorkflow}
        onRefresh={loadPackets}
        templatesLoading={state.templatesLoading || state.loading}
      />

      {state.error ? <div className="mb-5"><ErrorPanel title="Packets failed" error={{ message: friendlyError(state.error) }} onRetry={loadPackets} /></div> : null}
      {state.notice ? (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
          {state.notice}
        </div>
      ) : null}

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Packets</p>
              <p className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{formatCount(state.packets.length)}</p>
            </div>
            <PackageCheck className="text-gray-400" size={22} aria-hidden="true" />
          </div>
        </section>
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Templates</p>
              <p className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{formatCount(state.templates.length)}</p>
            </div>
            <ClipboardCheck className="text-gray-400" size={22} aria-hidden="true" />
          </div>
        </section>
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" size={18} aria-hidden="true" />
            <p className="text-sm text-amber-950 dark:text-amber-100">
              Packet completion means checklist coverage only. Review carefully before sharing, serving, or filing anything.
            </p>
          </div>
        </section>
      </div>

      {state.loading ? (
        <EmptyState title="Loading packets" description="Checking packet templates and packet checklists for this case." />
      ) : state.packets.length ? (
        <section className="mb-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-gray-950 dark:text-white">Your packets</h3>
            {canContribute ? (
              <button
                type="button"
                onClick={startPacketWorkflow}
                aria-haspopup="dialog"
                aria-expanded={showCreateFlow}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--lakai-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--lakai-primary-strong)]"
              >
                <Plus size={16} aria-hidden="true" />
                Add packet
              </button>
            ) : null}
          </div>
          <div className="grid gap-4">
            {state.packets.map((packet) => (
              <PacketCard key={packet.packet_id} packet={packet} caseId={caseId} />
            ))}
          </div>
        </section>
      ) : (
        <div className="mb-5">
          <EmptyState
            title="Create a packet"
            description="Create a packet to organize documents, notes, and checklist items for a specific case purpose."
            action={canContribute ? (
              <button
                type="button"
                onClick={startPacketWorkflow}
                aria-haspopup="dialog"
                aria-expanded={showCreateFlow}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--lakai-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--lakai-primary-strong)]"
              >
                <Plus size={16} aria-hidden="true" />
                Add packet
              </button>
            ) : null}
          />
        </div>
      )}

      <RequestFingerprint fingerprint={state.fingerprint} />
    </div>
  );
}
