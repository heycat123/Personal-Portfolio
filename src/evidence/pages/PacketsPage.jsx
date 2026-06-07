import {
  ArrowLeft,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Info,
  Loader2,
  NotepadText,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
            Document linking, packet export, sharing, and draft affidavit generation are coming later. For now, use statuses and notes
            to plan what belongs in this packet.
          </p>
        </div>
      </div>
    </section>
  );
}

function TemplatePicker({ templates, creating, onCreate, canContribute }) {
  if (!templates.length) {
    return (
      <EmptyState
        title="No packet templates available"
        description="Packet templates will appear here when they are available for this workspace."
      />
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

function RequirementEditor({ requirement, packetId, canContribute, saving, onSave }) {
  const [status, setStatus] = useState(requirement.status || 'needed');
  const [note, setNote] = useState(requirement.user_note || '');
  const [attentionReason, setAttentionReason] = useState(requirement.attention_reason || '');

  const changed =
    status !== (requirement.status || 'needed') ||
    note !== (requirement.user_note || '') ||
    attentionReason !== (requirement.attention_reason || '');

  const requirementId = requirement.requirement_id;
  const rowSaving = saving === requirementId;

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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Document linking for packet items is coming next. Use the note field to describe what belongs here for now.
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
  const createPacketRef = useRef(null);
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
  const showCreateSection = showCreateFlow || (!state.loading && !state.packets.length);

  function startPacketWorkflow() {
    setShowCreateFlow(true);
    window.setTimeout(() => {
      createPacketRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
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
                  onSave={saveRequirement}
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
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--lakai-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--lakai-primary-strong)]"
              >
                <Plus size={16} aria-hidden="true" />
                Add packet
              </button>
            ) : null}
          />
        </div>
      )}

      {canContribute && showCreateSection ? (
        <div ref={createPacketRef} id="create-packet" className="scroll-mt-6">
          <TemplatePicker
            templates={state.templates}
            creating={state.creating}
            onCreate={createPacket}
            canContribute={canContribute}
          />
        </div>
      ) : null}

      <RequestFingerprint fingerprint={state.fingerprint} />
    </div>
  );
}
