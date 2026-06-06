import {
  AlertTriangle,
  Bot,
  Check,
  Clipboard,
  ExternalLink,
  FileText,
  History,
  Info,
  ListChecks,
  Loader2,
  LockKeyhole,
  Menu,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  UsersRound,
  Wrench,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import NeedsAttentionPanel from '../components/NeedsAttentionPanel';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { evidenceApi } from '../services/evidenceApi';
import { buildCaseAttentionItems, filterAttentionItems } from '../utils/caseAttention';

const EXAMPLE_QUESTION = 'Which documents mention the parenting schedule?';
const QUERY_JOB_ACTIVE_STATUSES = new Set(['queued', 'running', 'cancelling']);

function waitFor(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function queryJobStatus(job) {
  return String(job?.status || '').toLowerCase();
}

function queryJobIsActive(job) {
  return QUERY_JOB_ACTIVE_STATUSES.has(queryJobStatus(job));
}

function queryJobDisplayMessage(job) {
  return job?.result_json?.display_message
    || job?.display?.display_message
    || job?.display_message
    || job?.current_step
    || job?.result_json?.answer_preview
    || 'Ask Documents is searching your sources.';
}

function queryJobResponse(job) {
  return job?.result_json?.query_response || job?.query_response || null;
}

function queryJobConversationId(job) {
  return job?.result_json?.conversation_id || job?.conversation_id || job?.request_payload?.conversation_id || null;
}

function queryJobFingerprint(job) {
  return job?.result_json?.request_fingerprint_id || job?.request_fingerprint_id || null;
}

function Panel({ title, children }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
      <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">{title}</h3>
      {children}
    </section>
  );
}

function citationLabel(citation) {
  if (typeof citation === 'string') {
    return citation;
  }
  return citation?.citation_label || citation?.citation || `${citation?.source || 'Source'}${citationPage(citation) ? `, p. ${citationPage(citation)}` : ''}`;
}

function citationSourceTarget(citation) {
  if (!citation || typeof citation === 'string') {
    return {};
  }
  return citation.source_target && typeof citation.source_target === 'object' ? citation.source_target : {};
}

function citationPage(citation) {
  const target = citationSourceTarget(citation);
  return target.page_number || target.page || citation?.page_number || citation?.page || null;
}

function citationOpenId(citation) {
  if (!citation || typeof citation === 'string') {
    return null;
  }
  const target = citationSourceTarget(citation);
  return target.file_id || target.file_hash || target.content_hash || citation.file_id || citation.file_hash || citation.content_hash || null;
}

function communicationCitationDetails(citation) {
  const target = citationSourceTarget(citation);
  const rawCitation = typeof citation === 'string' ? citation : citation?.citation || '';
  const sourceType = typeof citation === 'string' ? '' : String(target.source_type || citation?.source_type || '');
  const conversationMatch = rawCitation.match(/\b([A-Za-z0-9_-]+)\s+conversation\s+([^,\]]+)/i);
  const messageMatch = rawCitation.match(/\bmessage_id\s+([A-Za-z0-9_-]+)/i);
  const timestampMatch = rawCitation.match(/\bconversation\s+[^,]+,\s*([^,]+),\s*from\s+/i);
  const senderRecipientMatch = rawCitation.match(/,\s*from\s+(.+?)\s+to\s+(.+?),\s*message_id\s+/i);
  const details = {
    source_type: sourceType || (conversationMatch || messageMatch ? 'communication_message' : ''),
    platform: typeof citation === 'string' ? conversationMatch?.[1] : citation?.platform || conversationMatch?.[1],
    conversation_id: typeof citation === 'string' ? conversationMatch?.[2] : target.conversation_id || citation?.conversation_id || conversationMatch?.[2],
    message_id: typeof citation === 'string' ? messageMatch?.[1] : target.message_id || citation?.message_id || messageMatch?.[1],
    timestamp_iso: typeof citation === 'string' ? timestampMatch?.[1] : target.timestamp_iso || citation?.timestamp_iso || timestampMatch?.[1],
    sender_display_name: typeof citation === 'string' ? senderRecipientMatch?.[1] : citation?.sender_display_name || senderRecipientMatch?.[1],
    sender_address: typeof citation === 'string' ? null : citation?.sender_address,
    recipient_display_name: typeof citation === 'string' ? senderRecipientMatch?.[2] : citation?.recipient_display_name || senderRecipientMatch?.[2],
    recipient_address: typeof citation === 'string' ? null : citation?.recipient_address,
    chat_name: typeof citation === 'string' ? null : citation?.chat_name,
    message_text_preview: typeof citation === 'string' ? null : citation?.message_text_preview,
    citation: rawCitation,
  };
  const isCommunication = ['communication_message', 'communication_behavior_audit'].includes(details.source_type)
    || Boolean(details.message_id)
    || Boolean(details.conversation_id && /conversation/i.test(rawCitation));
  return isCommunication ? details : null;
}

function citationOpenTarget(citation) {
  const target = citationSourceTarget(citation);
  const targetType = String(target.source_type || '').toLowerCase();
  if (targetType.includes('communication') || target.message_id || target.conversation_id) {
    const communication = communicationCitationDetails(citation);
    if (communication) {
      return { type: 'communication', communication };
    }
  }
  const documentId = citationOpenId(citation);
  if (documentId) {
    return { type: 'document', documentId, page: citationPage(citation), sourceTarget: target };
  }
  const communication = communicationCitationDetails(citation);
  if (communication) {
    return { type: 'communication', communication };
  }
  return null;
}

function normalizeCitationLabel(value) {
  return String(value || '')
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function citationCandidates(citation) {
  if (!citation || typeof citation === 'string') {
    return [citation].filter(Boolean);
  }
  const page = citationPage(citation);
  return [
    citation.packet_item_id,
    citation.packet_item_id ? `[${citation.packet_item_id}]` : null,
    citationLabel(citation),
    citation.citation_label,
    citation.citation,
    citation.source && page ? `${citation.source}, p. ${page}` : null,
    citation.source && page ? `${citation.source} p. ${page}` : null,
    citation.source && page ? `${citation.source}, page ${page}` : null,
  ].filter(Boolean);
}

function citationLookup(citations = []) {
  const lookup = new Map();
  citations.forEach((citation) => {
    citationCandidates(citation).forEach((candidate) => {
      const normalized = normalizeCitationLabel(candidate);
      if (normalized && !lookup.has(normalized)) {
        lookup.set(normalized, citation);
      }
    });
  });
  return lookup;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchingCitationsForBracket(part, citations, lookup) {
  const exact = lookup.get(normalizeCitationLabel(part));
  if (exact) {
    return [exact];
  }
  const inner = normalizeCitationLabel(part);
  const evidenceMatches = [...inner.matchAll(/\be\s*(\d{1,3})\b/g)]
    .map((match) => citations[Number(match[1]) - 1])
    .filter(Boolean);
  if (evidenceMatches.length) {
    return [...new Set(evidenceMatches)];
  }

  const matches = [];
  citations.forEach((citation) => {
    let bestIndex = Infinity;
    citationCandidates(citation).forEach((candidate) => {
      const normalized = normalizeCitationLabel(candidate);
      if (normalized && normalized.length > 4) {
        const index = inner.indexOf(normalized);
        if (index >= 0 && index < bestIndex) {
          bestIndex = index;
        }
      }
    });

    if (bestIndex === Infinity && citation && typeof citation !== 'string') {
      const source = normalizeCitationLabel(citation.source);
      const page = citationPage(citation);
      const pagePattern = page ? new RegExp(`\\bp(?:age)?\\.?\\s*${escapeRegex(page)}\\b`) : null;
      if (source && pagePattern && inner.includes(source) && pagePattern.test(inner)) {
        bestIndex = inner.indexOf(source);
      }
    }

    if (bestIndex !== Infinity) {
      matches.push({ citation, index: bestIndex });
    }
  });

  return matches
    .sort((left, right) => left.index - right.index)
    .map((match) => match.citation)
    .filter((citation, index, all) => all.indexOf(citation) === index);
}

function CitationChip({ citation, onOpenCitation }) {
  const label = citationLabel(citation);
  const canOpen = Boolean(citationOpenTarget(citation));
  return (
    <button
      type="button"
      onClick={canOpen ? () => onOpenCitation(citation) : undefined}
      disabled={!canOpen}
      className="mx-0.5 inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 align-baseline text-xs font-semibold text-sky-900 hover:border-sky-400 hover:bg-sky-100 disabled:cursor-default disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-600 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100 dark:disabled:border-gray-800 dark:disabled:bg-black/20 dark:disabled:text-gray-400"
      title={label}
    >
      <FileText size={12} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 max-w-[calc(100vw-6rem)] truncate sm:max-w-[18rem]">{label}</span>
    </button>
  );
}

function InlineAnswer({ answer, citations, onOpenCitation }) {
  const text = String(answer || 'No answer returned.');
  const lookup = citationLookup(citations);
  const parts = text.split(/(\[[^\]\n]{2,260}\])/g);
  return (
    <div className="min-w-0 max-w-full overflow-hidden whitespace-pre-wrap break-words leading-6 text-gray-900 dark:text-gray-100">
      {parts.map((part, index) => {
        const bracketed = part.startsWith('[') && part.endsWith(']');
        const matchedCitations = bracketed ? matchingCitationsForBracket(part, citations, lookup) : [];
        if (!matchedCitations.length) {
          return <span key={`${index}-${part.slice(0, 24)}`}>{part}</span>;
        }
        return (
          <span key={`${index}-${part.slice(0, 24)}`} className="inline">
            [
            {matchedCitations.map((citation, citationIndex) => (
              <span key={`${citationLabel(citation)}-${citationIndex}`} className="inline">
                {citationIndex > 0 ? '; ' : ''}
                <CitationChip citation={citation} onOpenCitation={onOpenCitation} />
              </span>
            ))}
            ]
          </span>
        );
      })}
    </div>
  );
}

function CitationList({ citations, onOpenCitation, t }) {
  if (!citations?.length) {
    return <p className="text-sm text-gray-600 dark:text-gray-400">{t('No citations returned.')}</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {citations.map((citation, index) => {
        const label = citationLabel(citation);
        const canOpen = Boolean(citationOpenTarget(citation));
        return canOpen ? (
          <button
            type="button"
            key={`${label}-${index}`}
            onClick={() => onOpenCitation(citation)}
            className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-left text-xs font-semibold text-sky-900 hover:border-sky-400 hover:bg-sky-100 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100"
            title={label}
          >
            <FileText size={14} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">{label}</span>
          </button>
        ) : (
          <span
            key={`${label}-${index}`}
            className="inline-flex max-w-full min-w-0 items-center rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:border-gray-800 dark:bg-black/20 dark:text-gray-300"
            title={label}
          >
            <span className="min-w-0 truncate">{label}</span>
          </span>
        );
      })}
    </div>
  );
}

function agenticPlannerTrace(result) {
  return result?.retrieval_trace?.find((item) => item.stage === 'web_agentic_tool_planner') || null;
}

function agenticToolTrace(result) {
  return result?.retrieval_trace?.find((item) => item.stage === 'web_agentic_tool_execution') || null;
}

function toolLabel(tool) {
  return String(tool || '')
    .replace(/^postgres_/, 'Postgres ')
    .replace(/^neo4j_/, 'Neo4j ')
    .replace(/_/g, ' ');
}

function AgenticSummary({ result, t }) {
  const plannerTrace = agenticPlannerTrace(result);
  const toolTrace = agenticToolTrace(result);
  const plan = plannerTrace?.plan || {};
  const selectedTools = plan.selected_tools || [];
  const executedTools = toolTrace?.tools || [];
  const verifier = result?.verifier_status || {};
  const verified = Boolean(verifier.verified && verifier.sufficient);

  return (
    <div className="mt-4 min-w-0 max-w-full overflow-hidden rounded-md border border-sky-100 bg-sky-50 p-3 text-xs text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-100">
      <div className="flex flex-wrap items-center gap-2">
        <Bot size={15} aria-hidden="true" />
        <span className="font-semibold">{t('Advanced processing')}</span>
        <StatusBadge status={verified ? 'succeeded' : 'degraded'} label={verified ? t('Source citations available') : t('Needs review')} />
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        <div>
          <div className="font-semibold uppercase tracking-normal opacity-75">{t('Query type')}</div>
          <div>{plan.query_type || 'agentic'}</div>
        </div>
        <div>
          <div className="font-semibold uppercase tracking-normal opacity-75">{t('Retrieved rows')}</div>
          <div>{toolTrace?.final_rows ?? result?.evidence_packet?.length ?? 0}</div>
        </div>
        <div>
          <div className="font-semibold uppercase tracking-normal opacity-75">{t('Verifier')}</div>
          <div>{verifier.failure || (verified ? 'none' : 'needs_review')}</div>
        </div>
      </div>
      {plan.public_reason ? <p className="mt-2 leading-5">{plan.public_reason}</p> : null}
      {selectedTools.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedTools.map((tool) => (
            <span
              key={tool}
              className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-white px-2 py-1 font-semibold text-sky-900 dark:border-sky-900 dark:bg-black/20 dark:text-sky-100"
            >
              <Wrench size={13} aria-hidden="true" />
              {toolLabel(tool)}
            </span>
          ))}
        </div>
      ) : null}
      {executedTools.length ? (
        <div className="mt-3 overflow-hidden rounded-md border border-sky-200 bg-white dark:border-sky-900 dark:bg-black/20">
          {executedTools.map((tool) => (
            <div key={tool.tool} className="flex min-w-0 items-center justify-between gap-3 border-b border-sky-100 px-2 py-1.5 last:border-b-0 dark:border-sky-900/60">
              <span className="min-w-0 truncate font-medium">{toolLabel(tool.tool)}</span>
              <span className="shrink-0 text-right text-sky-700 dark:text-sky-200">
                {tool.status || 'ok'} - {tool.rows ?? 0} rows
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function QueryMessage({ message, caseId, currentUserName, onCopyAnswer, copied, onOpenCitation, onOpenCitationList, showDiagnostics, showCitations = true, t }) {
  if (message.role === 'user') {
    return (
      <div className="flex min-w-0 max-w-full justify-end gap-3">
        <div className="min-w-0 max-w-[calc(100vw-5rem)] overflow-hidden break-words rounded-2xl rounded-tr-md bg-[var(--lakai-primary)] px-4 py-3 text-sm text-[var(--lakai-primary-text)] shadow-sm sm:max-w-[78%]">
          <div className="mb-1 text-xs font-semibold opacity-80">{t('You')}</div>
          {message.content}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--lakai-accent)] text-sm font-bold text-[var(--lakai-primary-strong)]">
          {initialsForName(message.authorName || currentUserName || t('You'))}
        </div>
      </div>
    );
  }

  const result = message.result;
  const verifier = result?.verifier_status;
  const verified = Boolean(verifier?.verified || verifier?.sufficient);
  const citations = result?.citations || [];
  const sourceReferenceCount = Number(result?.source_reference_count ?? citations.length);
  const hasSourceReferences = sourceReferenceCount > 0 || citations.length > 0;
  const insufficientEvidence = Boolean(result?.insufficient_evidence) || result?.answer_status === 'insufficient_evidence';
  const needsMoreSourceMaterial = insufficientEvidence || !verified || !hasSourceReferences;
  const displayGuidance = typeof result?.display_guidance === 'string'
    ? result.display_guidance
    : result?.display_guidance?.message || result?.display_guidance?.summary || null;
  const jobId = message.job?.job_id;
  const jobLabel = queryJobDisplayMessage(message.job);
  return (
    <div className="flex min-w-0 max-w-full justify-start">
      <div className="min-w-0 w-full max-w-full overflow-hidden rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-sm dark:border-gray-800 dark:bg-[#101820] sm:max-w-[92%] sm:p-4">
        {message.running ? (
          <div className="space-y-3 text-gray-700 dark:text-gray-200">
            <div className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              <span className="font-semibold">{t('Ask Documents is working')}</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t(jobLabel)}
            </p>
            {jobId ? (
              <Link
                to={`/evidence/cases/${caseId}/jobs/${jobId}`}
                className="inline-flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:border-sky-400 hover:bg-sky-100 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100"
              >
                <ExternalLink size={13} aria-hidden="true" />
                {t('Open query job')}
              </Link>
            ) : null}
          </div>
        ) : message.error ? (
          <ErrorPanel title="Query failed" error={message.error} />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge
                status={hasSourceReferences ? 'succeeded' : 'degraded'}
                label={hasSourceReferences ? t('Source citations available') : t('Needs source review')}
              />
              {result?.answer ? (
                <button
                  type="button"
                  onClick={() => onCopyAnswer(result.answer)}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 dark:border-gray-800 dark:bg-black/20 dark:text-gray-200 dark:hover:border-sky-900 dark:hover:bg-sky-950/30 dark:hover:text-sky-100"
                  title={t('Copy answer')}
                >
                  {copied ? <Check size={13} aria-hidden="true" /> : <Clipboard size={13} aria-hidden="true" />}
                  {copied ? t('Copied') : t('Copy')}
                </button>
              ) : null}
              {message.fingerprint?.id ? (
                <RequestFingerprint
                  fingerprintId={message.fingerprint.id}
                  correlationId={message.fingerprint.correlationId}
                  label="Query fingerprint"
                />
              ) : null}
            </div>
            <InlineAnswer answer={result?.answer} citations={citations} onOpenCitation={onOpenCitation} />
            {needsMoreSourceMaterial ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 shrink-0" size={15} aria-hidden="true" />
                  <span>{t('Not enough source material to answer confidently. Review source citations or add more source documents.')}</span>
                </div>
              </div>
            ) : null}
            {displayGuidance ? (
              <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-100">
                {displayGuidance}
              </div>
            ) : null}
            {showDiagnostics ? (
              <div className="hidden lg:block">
                <AgenticSummary result={result} t={t} />
              </div>
            ) : null}
            {showCitations && citations.length ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => onOpenCitationList(citations)}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 dark:border-gray-800 dark:bg-black/20 dark:text-gray-200 dark:hover:border-sky-900 dark:hover:bg-sky-950/30 dark:hover:text-sky-100"
                >
                  <ListChecks size={14} aria-hidden="true" />
                  {t('Open source references')} ({citations.length})
                </button>
              </div>
            ) : null}
            {showDiagnostics ? <div className="mt-4 hidden gap-3 text-xs text-gray-600 dark:text-gray-400 lg:grid lg:grid-cols-3">
              <div>
                <div className="font-semibold uppercase tracking-normal">{t('Verifier')}</div>
                <div>{verifier?.failure || (verified ? 'verified' : 'not verified')}</div>
              </div>
              <div>
                <div className="font-semibold uppercase tracking-normal">{t('Confidence')}</div>
                <div>{verifier?.confidence ?? 0}</div>
              </div>
              <div>
                <div className="font-semibold uppercase tracking-normal">{t('Cost')}</div>
                <div>${Number(result?.cost?.actual_usd || 0).toFixed(4)}</div>
              </div>
            </div> : null}
          </>
        )}
      </div>
    </div>
  );
}

function CitationDrawer({ drawer, caseId, onClose, t }) {
  if (!drawer.open) {
    return null;
  }
  const page = drawer.document?.pages?.find((item) => Number(item.page_number) === Number(drawer.page));
  const communication = drawer.communication;
  const citationPreview = typeof drawer.citation === 'object'
    ? drawer.citation?.page_text_preview || drawer.citation?.message_text_preview || ''
    : '';
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <aside className="h-full w-screen max-w-full overflow-y-auto overflow-x-hidden border-l border-gray-200 bg-white p-3 shadow-xl dark:border-gray-800 dark:bg-[#0b1117] sm:w-[92vw] sm:max-w-xl sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t(communication ? 'Communication source' : 'Citation')}</div>
            <h2 className="truncate text-lg font-semibold text-gray-950 dark:text-white">{citationLabel(drawer.citation)}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label={t('Close')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {drawer.error ? <ErrorPanel title="Document preview failed" error={drawer.error} /> : null}
        {communication ? (
          <div className="space-y-4">
            <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
              <div className="flex flex-wrap gap-2">
                {communication.platform ? <StatusBadge status="configured" label={communication.platform} /> : null}
                {communication.timestamp_iso ? <span className="rounded-full border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">{communication.timestamp_iso}</span> : null}
              </div>
              <div className="mt-3 text-gray-700 dark:text-gray-300">
                <span className="font-semibold">{communication.sender_display_name || communication.sender_address || t('Unknown sender')}</span>
                {' '}
                {t('to')}
                {' '}
                <span className="font-semibold">{communication.recipient_display_name || communication.recipient_address || t('Unknown recipient')}</span>
              </div>
              <div className="mt-2 space-y-1 break-all text-xs text-gray-500 dark:text-gray-400">
                {communication.conversation_id ? <div>{t('Conversation')}: {communication.conversation_id}</div> : null}
                {communication.message_id ? <div>{t('Message')}: {communication.message_id}</div> : null}
              </div>
            </div>
            <Panel title={t('Message preview')}>
              {communication.message_text_preview ? (
                <div className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-900 dark:text-gray-100">
                  {communication.message_text_preview}
                </div>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('This saved answer only included the communication citation. Use the message id above for support lookup; new answers include a message preview when available.')}
                </p>
              )}
            </Panel>
            <Panel title={t('Full citation')}>
              <div className="whitespace-pre-wrap break-words rounded-md bg-gray-950 p-3 text-xs leading-5 text-gray-100">
                {communication.citation || citationLabel(drawer.citation)}
              </div>
            </Panel>
          </div>
        ) : drawer.loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {t('Loading document.')}
          </div>
        ) : drawer.document ? (
          <div className="space-y-4">
            <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
              <div className="font-semibold text-gray-950 dark:text-white">{drawer.document.original_filename || drawer.document.file_id}</div>
              <div className="mt-1 text-gray-600 dark:text-gray-400">
                {t('Page')} {drawer.page || 'n/a'} | {drawer.document.source_provider || 'unknown'} | {drawer.document.source_of_truth_mode || 'unknown'}
              </div>
              <Link
                to={`/evidence/cases/${caseId}/documents/${drawer.document.file_id}`}
                className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-300"
              >
                <ExternalLink size={15} aria-hidden="true" />
                {t('Open document details')}
              </Link>
            </div>

            <Panel title={page?.page_number || drawer.page ? `${t('Page')} ${drawer.page || page?.page_number || ''}` : t('Source excerpt')}>
              {page?.page_text_preview || citationPreview ? (
                <pre className="max-h-[520px] whitespace-pre-wrap rounded-md bg-gray-950 p-3 text-xs leading-5 text-gray-100">
                  {page?.page_text_preview || citationPreview}
                </pre>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('No page text preview returned.')}</p>
              )}
            </Panel>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function CitationListDrawer({ drawer, onClose, onOpenCitation, t }) {
  if (!drawer.open) {
    return null;
  }
  const citations = drawer.citations || [];
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
      <aside className="h-full w-screen max-w-full overflow-y-auto overflow-x-hidden border-l border-gray-200 bg-white p-3 shadow-xl dark:border-gray-800 dark:bg-[#0b1117] sm:w-[92vw] sm:max-w-lg sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Answer citations')}</div>
            <h2 className="truncate text-lg font-semibold text-gray-950 dark:text-white">
              {citations.length} {citations.length === 1 ? t('citation') : t('citations')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label={t('Close')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <CitationList citations={citations} onOpenCitation={onOpenCitation} t={t} />
      </aside>
    </div>
  );
}

function conversationStorageKey(caseId) {
  return `evidence.query.activeConversation.${caseId || 'default'}`;
}

const DEFAULT_CHAT_SETTINGS = {
  showReadiness: true,
  showStarters: true,
  showCitations: true,
  showSuggestions: false,
};

function chatSettingsStorageKey(caseId) {
  return `evidence.query.chatSettings.${caseId || 'default'}`;
}

function chatHistoryCollapsedStorageKey(caseId) {
  return `evidence.query.historyCollapsed.${caseId || 'default'}`;
}

function readStoredChatSettings(caseId) {
  if (typeof window === 'undefined') {
    return DEFAULT_CHAT_SETTINGS;
  }
  try {
    const raw = window.localStorage.getItem(chatSettingsStorageKey(caseId));
    if (!raw) {
      return DEFAULT_CHAT_SETTINGS;
    }
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CHAT_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return DEFAULT_CHAT_SETTINGS;
  }
}

function formatConversationTime(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function displayNameFromPerson(value, fallback = 'Case member') {
  if (!value) {
    return fallback;
  }
  if (typeof value === 'string') {
    return value || fallback;
  }
  return value.display_name
    || value.displayName
    || value.name
    || value.email
    || value.username
    || value.user_id
    || value.userId
    || fallback;
}

function conversationStarterName(conversation) {
  return displayNameFromPerson(
    conversation?.started_by
      || conversation?.created_by
      || conversation?.owner
      || conversation?.starter,
    conversation?.started_by_display_name
      || conversation?.created_by_display_name
      || conversation?.owner_display_name
      || conversation?.created_by_email
      || 'Case member',
  );
}

function initialsForName(value) {
  const cleaned = String(value || '').trim();
  if (!cleaned) {
    return 'CM';
  }
  const emailPrefix = cleaned.includes('@') ? cleaned.split('@')[0] : cleaned;
  const parts = emailPrefix
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) {
    return 'CM';
  }
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function conversationParticipantNames(conversation) {
  const rawParticipants = conversation?.participants || conversation?.case_participants || conversation?.visible_to || [];
  const names = Array.isArray(rawParticipants)
    ? rawParticipants.map((item) => displayNameFromPerson(item, '')).filter(Boolean)
    : [];
  const starter = conversationStarterName(conversation);
  const unique = [starter, ...names].filter(Boolean).filter((name, index, all) => all.indexOf(name) === index);
  return unique.slice(0, 4);
}

function conversationVisibilityLabel(conversation, t) {
  const value = String(conversation?.visibility || conversation?.visibility_scope || conversation?.sharing_scope || '').toLowerCase();
  if (value.includes('case') || value.includes('shared')) {
    return t('People with case access');
  }
  if (value.includes('specific')) {
    return t('Specific people');
  }
  return t('Only me');
}

function conversationPreviewText(conversation, t) {
  const raw = conversation?.last_message_preview || `${conversation?.message_count || 0} ${t('messages')}`;
  const normalized = String(raw || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= 150) {
    return normalized;
  }
  return `${normalized.slice(0, 147).trim()}...`;
}

function messagesFromConversation(conversation) {
  return (conversation?.messages || []).map((message) => {
    if (message.role === 'assistant') {
      const result = message.query_result_json && Object.keys(message.query_result_json).length
        ? message.query_result_json
        : { answer: message.content, citations: [] };
      return {
        id: message.message_id,
        role: 'assistant',
        result,
        fingerprint: {
          id: message.request_fingerprint_id || result.request_fingerprint_id,
          correlationId: null,
        },
      };
    }
    return {
      id: message.message_id,
      role: 'user',
      content: message.content,
    };
  });
}

function ConversationList({
  conversations,
  activeConversationId,
  loading,
  error,
  onNewConversation,
  onSelectConversation,
  onRefresh,
  t,
  showStarters = true,
  className = '',
  onClose,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredConversations = conversations.filter((conversation) => {
    const searchable = [
      conversation.title,
      conversation.last_message_preview,
      conversationStarterName(conversation),
      conversationVisibilityLabel(conversation, t),
    ].filter(Boolean).join(' ').toLowerCase();
    if (normalizedSearch && !searchable.includes(normalizedSearch)) {
      return false;
    }
    if (filter === 'mine') {
      return conversationVisibilityLabel(conversation, t) === t('Only me')
        || Boolean(conversation.is_mine || conversation.mine || conversation.created_by_current_user);
    }
    if (filter === 'shared') {
      return conversationVisibilityLabel(conversation, t) !== t('Only me')
        || Boolean(conversation.shared_with_me);
    }
    return true;
  });

  return (
    <aside className={`min-w-0 max-w-full overflow-hidden rounded-2xl border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface)] p-4 shadow-[var(--lakai-shadow-panel)] xl:h-full ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <History size={17} className="shrink-0 text-[var(--lakai-text-muted)]" aria-hidden="true" />
          <h3 className="truncate font-serif text-lg font-semibold text-[var(--lakai-primary-strong)]">{t('Chat history')}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--lakai-text-muted)] hover:bg-[var(--lakai-surface-muted)] hover:text-[var(--lakai-text)]"
            aria-label={t('Refresh conversations')}
            title={t('Refresh conversations')}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--lakai-text-muted)] hover:bg-[var(--lakai-surface-muted)] hover:text-[var(--lakai-text)]"
              aria-label={t('Close conversations')}
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onNewConversation}
        className="mb-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--lakai-primary)] px-4 py-2 text-sm font-semibold text-[var(--lakai-primary-text)] hover:bg-[var(--lakai-primary-strong)]"
      >
        <Plus size={16} aria-hidden="true" />
        {t('New chat')}
      </button>
      <label className="relative mb-3 block">
        <span className="sr-only">{t('Search chat history')}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--lakai-text-muted)]" size={16} aria-hidden="true" />
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface-muted)] py-2 pl-9 pr-3 text-sm text-[var(--lakai-text)] outline-none focus:border-[var(--lakai-focus)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--lakai-focus)_25%,transparent)]"
          placeholder={t('Search chat history')}
        />
      </label>
      <p className="mb-3 text-xs text-[var(--lakai-text-muted)]">{t('Search previous chats and answers.')}</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ['all', t('All case chats')],
          ['mine', t('Mine')],
          ['shared', t('Shared with me')],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              filter === value
                ? 'border-[var(--lakai-primary)] bg-[var(--lakai-primary)] text-[var(--lakai-primary-text)]'
                : 'border-[var(--lakai-border-soft)] bg-[var(--lakai-surface)] text-[var(--lakai-text-muted)] hover:bg-[var(--lakai-surface-muted)] hover:text-[var(--lakai-text)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? <ErrorPanel title="Conversation history failed" error={error} /> : null}
      <div className="flex max-w-full gap-3 overflow-x-auto pb-1 xl:max-h-[calc(100%_-_13.5rem)] xl:flex-col xl:overflow-y-auto xl:overflow-x-hidden">
        {filteredConversations.length ? (
          filteredConversations.map((conversation) => {
            const active = conversation.conversation_id === activeConversationId;
            const starter = conversationStarterName(conversation);
            const participants = conversationParticipantNames(conversation);
            const visibility = conversationVisibilityLabel(conversation, t);
            return (
              <button
                key={conversation.conversation_id}
                type="button"
                onClick={() => onSelectConversation(conversation.conversation_id)}
                className={`min-w-[260px] rounded-xl border p-3 text-left text-sm transition-colors xl:min-w-0 ${
                  active
                    ? 'border-[var(--lakai-primary)] bg-[var(--lakai-accent-soft)] text-[var(--lakai-text)]'
                    : 'border-[var(--lakai-border-soft)] bg-[var(--lakai-surface-muted)] text-[var(--lakai-text)] hover:border-[var(--lakai-primary)] hover:bg-[var(--lakai-accent-soft)]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--lakai-primary)] text-sm font-bold text-[var(--lakai-primary-text)]">
                    {initialsForName(starter)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{conversation.title || t('New chat')}</div>
                    {showStarters ? (
                      <div className="mt-1 truncate text-xs text-[var(--lakai-text-muted)]">
                        {t('Started by {name}', { name: starter })}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--lakai-text-muted)]">
                  {conversationPreviewText(conversation, t)}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface)] px-2 py-1 text-[11px] font-semibold text-[var(--lakai-text-muted)]">
                    {visibility === t('Only me') ? <LockKeyhole size={12} aria-hidden="true" /> : <UsersRound size={12} aria-hidden="true" />}
                    {visibility}
                  </span>
                  <span className="text-xs text-[var(--lakai-text-muted)]">
                    {formatConversationTime(conversation.last_message_at || conversation.updated_at || conversation.created_at)}
                  </span>
                </div>
                {participants.length > 1 ? (
                  <div className="mt-3 flex -space-x-2">
                    {participants.map((name) => (
                      <span
                        key={name}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--lakai-surface-muted)] bg-[var(--lakai-surface)] text-[10px] font-bold text-[var(--lakai-primary-strong)]"
                        title={name}
                      >
                        {initialsForName(name)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })
        ) : (
          <div className="min-w-[260px] rounded-xl border border-dashed border-[var(--lakai-border)] p-4 text-sm text-[var(--lakai-text-muted)] xl:min-w-0">
            {loading ? t('Loading chats.') : normalizedSearch || filter !== 'all' ? t('No chats match this view.') : t('No saved chats yet.')}
          </div>
        )}
      </div>
    </aside>
  );
}

function ToggleRow({ title, description, checked, onChange, disabled = false }) {
  return (
    <label className={`flex items-start justify-between gap-4 rounded-xl border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface-muted)] p-3 ${disabled ? 'opacity-60' : ''}`}>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--lakai-text)]">{title}</span>
        {description ? <span className="mt-1 block text-xs leading-5 text-[var(--lakai-text-muted)]">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-[var(--lakai-primary)]"
      />
    </label>
  );
}

function ChatSettingsDrawer({ open, onClose, settings, onChange, t }) {
  if (!open) {
    return null;
  }
  const update = (key, value) => onChange((current) => ({ ...current, [key]: value }));
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label={t('Close Chat settings')} />
      <aside className="relative h-full w-screen max-w-full overflow-y-auto border-l border-[var(--lakai-border-soft)] bg-[var(--lakai-surface)] p-5 shadow-xl sm:w-[26rem]">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--lakai-text-muted)]">
              <SlidersHorizontal size={15} aria-hidden="true" />
              {t('Chat settings')}
            </div>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-[var(--lakai-primary-strong)]">{t('Chat preferences')}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--lakai-text-muted)]">
              {t('Choose how this chat workspace helps you review sources. These settings are saved on this device and do not change case documents.')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--lakai-text-muted)] hover:bg-[var(--lakai-surface-muted)] hover:text-[var(--lakai-text)]"
            aria-label={t('Close')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3">
          <ToggleRow
            title={t('Show document readiness before asking')}
            description={t('Warn me when documents are still processing and answers may miss sources.')}
            checked={settings.showReadiness}
            onChange={(value) => update('showReadiness', value)}
          />
          <ToggleRow
            title={t('Show who started each chat')}
            description={t('Use account names and initials when conversation history includes them.')}
            checked={settings.showStarters}
            onChange={(value) => update('showStarters', value)}
          />
          <ToggleRow
            title={t('Show source citations when available')}
            description={t('Keep source references visible so answers can be reviewed.')}
            checked={settings.showCitations}
            onChange={(value) => update('showCitations', value)}
          />
          <ToggleRow
            title={t('Show follow-up suggestions')}
            description={t('Reserved for the enhanced chat experience when that feature is available.')}
            checked={settings.showSuggestions}
            onChange={(value) => update('showSuggestions', value)}
            disabled
          />
        </div>

        <div className="mt-5 rounded-xl border border-[var(--lakai-border-soft)] bg-[var(--lakai-accent-soft)] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--lakai-text)]">
            <LockKeyhole size={16} aria-hidden="true" />
            {t('Chat sharing')}
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--lakai-text-muted)]">
            {t('Chats start private. Sharing should be chosen per chat so one conversation can stay private while another can be shared.')}
          </p>
          <p className="mt-2 text-xs leading-5 text-[var(--lakai-text-muted)]">
            {t('Per-chat sharing controls need a backend visibility update endpoint before this UI can safely change who sees a saved chat.')}
          </p>
        </div>

        <div className="mt-5 rounded-xl border border-[var(--lakai-review)] bg-[var(--lakai-review-soft)] p-4 text-sm leading-6 text-[var(--lakai-text)]">
          {t('Chats may include sensitive case information. Review source citations and sharing settings before relying on or sharing an answer.')}
        </div>
      </aside>
    </div>
  );
}

export default function QueryPage() {
  const { caseId } = useParams();
  const { openMobileMenu } = useOutletContext() || {};
  const { getAccessToken, user } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { preferences, t } = useLocaleSettings();
  const { debugEnabled } = useOperatorMode();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [state, setState] = useState({
    running: false,
    error: null,
    result: null,
    fingerprint: null,
  });
  const [drawer, setDrawer] = useState({
    open: false,
    loading: false,
    error: null,
    citation: null,
    page: null,
    document: null,
    communication: null,
  });
  const [citationListDrawer, setCitationListDrawer] = useState({
    open: false,
    citations: [],
  });
  const [activeConversationId, setActiveConversationId] = useState(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage.getItem(conversationStorageKey(caseId));
  });
  const [conversationState, setConversationState] = useState({
    loading: false,
    error: null,
    conversations: [],
  });
  const [conversationMenuOpen, setConversationMenuOpen] = useState(false);
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [chatSettings, setChatSettings] = useState(() => readStoredChatSettings(caseId));
  const [historyCollapsed, setHistoryCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(chatHistoryCollapsedStorageKey(caseId)) === 'true';
  });
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [readinessState, setReadinessState] = useState({
    loading: true,
    health: null,
    error: null,
  });
  const scrollRef = useRef(null);
  const mountedRef = useRef(true);
  const showDiagnostics = debugEnabled;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setChatSettings(readStoredChatSettings(caseId));
    if (typeof window !== 'undefined') {
      setHistoryCollapsed(window.localStorage.getItem(chatHistoryCollapsedStorageKey(caseId)) === 'true');
    }
  }, [caseId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(chatSettingsStorageKey(caseId), JSON.stringify(chatSettings));
  }, [caseId, chatSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(chatHistoryCollapsedStorageKey(caseId), historyCollapsed ? 'true' : 'false');
  }, [caseId, historyCollapsed]);

  const loadQueryReadiness = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setReadinessState((current) => ({ ...current, loading: true, error: null }));
    }
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getCaseHealth(caseId, { token });
      recordFingerprint(result, 'Ask Documents readiness');
      setReadinessState({ loading: false, health: result.data || null, error: null });
    } catch (error) {
      setReadinessState((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadQueryReadiness();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [loadQueryReadiness]);

  const loadConversation = useCallback(
    async (conversationId) => {
      if (!conversationId) {
        return null;
      }
      setConversationState((current) => ({ ...current, loading: true, error: null }));
      try {
        const token = await getAccessToken();
        const result = await evidenceApi.getQueryConversation(caseId, conversationId, { token });
        recordFingerprint(result, 'Load query conversation');
        const conversation = result.data?.conversation;
        const loadedMessages = messagesFromConversation(conversation);
        const latestAssistant = [...loadedMessages].reverse().find((message) => message.role === 'assistant' && message.result);
        setMessages(loadedMessages);
        setActiveConversationId(conversation?.conversation_id || conversationId);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(conversationStorageKey(caseId), conversation?.conversation_id || conversationId);
        }
        setState((current) => ({
          ...current,
          running: false,
          error: null,
          result: latestAssistant?.result || null,
          fingerprint: latestAssistant?.fingerprint || null,
        }));
        setConversationState((current) => ({ ...current, loading: false, error: null }));
        return conversation;
      } catch (error) {
        setConversationState((current) => ({ ...current, loading: false, error }));
        return null;
      }
    },
    [caseId, getAccessToken, recordFingerprint],
  );

  const refreshConversations = useCallback(async () => {
    setConversationState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getQueryConversations(caseId, { limit: 40 }, { token });
      recordFingerprint(result, 'Query conversation list');
      const conversations = result.data?.conversations || [];
      setConversationState({ loading: false, error: null, conversations });
      return conversations;
    } catch (error) {
      setConversationState((current) => ({ ...current, loading: false, error }));
      return [];
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setState({ running: false, error: null, result: null, fingerprint: null });
    const savedConversationId = typeof window === 'undefined' ? null : window.localStorage.getItem(conversationStorageKey(caseId));
    setActiveConversationId(savedConversationId);
    (async () => {
      const conversations = await refreshConversations();
      if (cancelled || !savedConversationId) {
        return;
      }
      if (conversations.some((conversation) => conversation.conversation_id === savedConversationId)) {
        await loadConversation(savedConversationId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, loadConversation, refreshConversations]);

  const startNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
    setQuestion('');
    setState({ running: false, error: null, result: null, fingerprint: null });
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(conversationStorageKey(caseId));
    }
  }, [caseId]);

  const currentUserName = user?.displayName || user?.email || t('You');

  const copyAnswer = useCallback(async (answer) => {
    if (!answer || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(String(answer));
    setCopiedAnswer(true);
    window.setTimeout(() => setCopiedAnswer(false), 1400);
  }, []);

  const runQuery = useCallback(async () => {
    const trimmed = question.trim();
    if (!trimmed) {
      setState((current) => ({ ...current, error: new Error('Enter a question before running a query.') }));
      return;
    }

    const timestamp = Date.now();
    const assistantId = `assistant-${timestamp}`;
    setMessages((current) => [
      ...current,
      { id: `user-${timestamp}`, role: 'user', content: trimmed, authorName: currentUserName },
      { id: assistantId, role: 'assistant', running: true },
    ]);
    setQuestion('');
    setState((current) => ({ ...current, running: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.createQueryJob(
        caseId,
        {
          question: trimmed,
          mode: 'agentic',
          include_trace: showDiagnostics,
          response_language: preferences.language,
          viewer_timezone: preferences.timeZone,
          conversation_id: activeConversationId,
        },
        { token },
      );
      recordFingerprint(result, 'Queue case query');
      const fingerprint = {
        id: result.requestFingerprintId || result.data?.request_fingerprint_id,
        correlationId: result.correlationId,
      };
      const queuedJob = result.data?.job || result.data;
      const queuedConversationId = result.data?.conversation_id || queryJobConversationId(queuedJob);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                running: true,
                job: queuedJob,
                fingerprint,
              }
            : message,
        ),
      );
      setConversationMenuOpen(false);
      setState((current) => ({
        ...current,
        running: true,
        error: null,
        result: null,
        fingerprint,
      }));
      if (queuedConversationId) {
        setActiveConversationId(queuedConversationId);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(conversationStorageKey(caseId), queuedConversationId);
        }
      }

      let latestJob = queuedJob;
      while (mountedRef.current && latestJob?.job_id && queryJobIsActive(latestJob)) {
        await waitFor(2500);
        if (!mountedRef.current) {
          return;
        }
        const jobResult = await evidenceApi.getJob(caseId, latestJob.job_id, { token });
        recordFingerprint(jobResult, 'Query job status');
        latestJob = jobResult.data;
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  running: queryJobIsActive(latestJob),
                  job: latestJob,
                  fingerprint: {
                    id: jobResult.requestFingerprintId || queryJobFingerprint(latestJob) || fingerprint.id,
                    correlationId: jobResult.correlationId,
                  },
                }
              : message,
          ),
        );
      }

      if (!mountedRef.current) {
        return;
      }

      const queryResponse = queryJobResponse(latestJob);
      const completedConversationId = queryJobConversationId(latestJob) || queuedConversationId;
      const completedFingerprint = {
        id: queryJobFingerprint(latestJob) || fingerprint.id,
        correlationId: fingerprint.correlationId,
      };

      if (queryResponse) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  running: false,
                  job: latestJob,
                  result: queryResponse,
                  fingerprint: completedFingerprint,
                }
              : message,
          ),
        );
        setState({
          running: false,
          error: null,
          result: queryResponse,
          fingerprint: completedFingerprint,
        });
        if (completedConversationId) {
          setActiveConversationId(completedConversationId);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(conversationStorageKey(caseId), completedConversationId);
          }
        }
        await refreshConversations();
        if (completedConversationId) {
          await loadConversation(completedConversationId);
        }
        return;
      }

      if (completedConversationId) {
        const conversation = await loadConversation(completedConversationId);
        await refreshConversations();
        if (conversation) {
          return;
        }
      }

      const terminalStatus = queryJobStatus(latestJob);
      const message = latestJob?.error_message
        || latestJob?.result_json?.error_message
        || queryJobDisplayMessage(latestJob)
        || `Ask Documents job finished with status ${terminalStatus || 'unknown'}.`;
      throw new Error(message);
    } catch (error) {
      setMessages((current) =>
        current.map((message) => (message.id === assistantId ? { ...message, running: false, error } : message)),
      );
      setState((current) => ({ ...current, running: false, error }));
    }
  }, [activeConversationId, caseId, currentUserName, getAccessToken, loadConversation, preferences.language, preferences.timeZone, question, recordFingerprint, refreshConversations, showDiagnostics]);

  const openCitation = useCallback(
    async (citation) => {
      const target = citationOpenTarget(citation);
      if (!target) {
        return;
      }
      if (target.type === 'communication') {
        setDrawer({
          open: true,
          loading: false,
          error: null,
          citation,
          page: null,
          document: null,
          communication: target.communication,
        });
        return;
      }
      const documentId = target.documentId;
      setDrawer({
        open: true,
        loading: true,
        error: null,
        citation,
        page: target.page || citationPage(citation),
        document: null,
        communication: null,
      });
      try {
        const token = await getAccessToken();
        const result = await evidenceApi.getDocument(caseId, documentId, { token });
        recordFingerprint(result, 'Citation document drawer');
        setDrawer((current) => ({
          ...current,
          loading: false,
          document: result.data,
        }));
      } catch (error) {
        setDrawer((current) => ({
          ...current,
          loading: false,
          error,
        }));
      }
    },
    [caseId, getAccessToken, recordFingerprint],
  );

  const openCitationList = useCallback((citations) => {
    setCitationListDrawer({ open: true, citations: citations || [] });
  }, []);

  const latestVerifier = state.result?.verifier_status;
  const latestSourceReferences = Number(state.result?.source_reference_count ?? state.result?.citations?.length ?? 0);
  const latestNeedsReview = Boolean(state.result?.insufficient_evidence) || state.result?.answer_status === 'insufficient_evidence';
  const latestReady = Boolean(latestVerifier?.verified || latestVerifier?.sufficient || latestSourceReferences > 0) && !latestNeedsReview;
  const hasMessages = messages.length > 0;
  const traceRows = useMemo(() => state.result?.retrieval_trace || [], [state.result?.retrieval_trace]);
  const askAttentionItems = useMemo(() => filterAttentionItems(buildCaseAttentionItems({
    caseId,
    health: readinessState.health,
  }), 'ask-documents'), [caseId, readinessState.health]);
  const askProcessingPending = askAttentionItems.some((item) => item.id === 'search-processing');

  useEffect(() => {
    if (!askProcessingPending) {
      return undefined;
    }
    const timerId = window.setInterval(() => {
      void loadQueryReadiness({ quiet: true });
    }, 5000);
    return () => window.clearInterval(timerId);
  }, [askProcessingPending, loadQueryReadiness]);

  return (
    <div className="flex h-full w-full min-w-0 max-w-full flex-col overflow-hidden">
      <div className="fixed left-3 right-3 top-3 z-30 flex items-center justify-between gap-2 lg:hidden">
        <button
          type="button"
          onClick={openMobileMenu}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-800 shadow-lg backdrop-blur hover:bg-gray-50 dark:border-gray-800 dark:bg-[#101820]/95 dark:text-gray-100"
          aria-label={t('Open navigation')}
          title={t('Open navigation')}
        >
          <Menu size={18} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 rounded-full border border-gray-200 bg-white/95 px-3 py-2 text-center text-sm font-semibold text-gray-950 shadow-lg backdrop-blur dark:border-gray-800 dark:bg-[#101820]/95 dark:text-white">
          {t('Ask Documents')}
        </div>
        <button
          type="button"
          onClick={() => setConversationMenuOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-800 shadow-lg backdrop-blur hover:bg-gray-50 dark:border-gray-800 dark:bg-[#101820]/95 dark:text-gray-100"
          aria-label={t('Open conversations')}
          title={t('Open conversations')}
        >
          <History size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setChatSettingsOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-800 shadow-lg backdrop-blur hover:bg-gray-50 dark:border-gray-800 dark:bg-[#101820]/95 dark:text-gray-100"
          aria-label={t('Chat settings')}
          title={t('Chat settings')}
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
        </button>
      </div>

      <div className={`grid h-full min-h-0 w-full min-w-0 max-w-full overflow-hidden lg:h-full ${historyCollapsed ? 'xl:grid-cols-[0_minmax(0,1fr)]' : 'xl:grid-cols-[320px_minmax(0,1fr)]'}`}>
        <div className={`${historyCollapsed ? 'hidden' : 'hidden min-h-0 border-r border-[var(--lakai-border-soft)] bg-[var(--lakai-bg)] p-3 xl:block'}`}>
          <ConversationList
            conversations={conversationState.conversations}
            activeConversationId={activeConversationId}
            loading={conversationState.loading}
            error={conversationState.error}
            onNewConversation={startNewConversation}
            onSelectConversation={loadConversation}
            onRefresh={refreshConversations}
            t={t}
            showStarters={chatSettings.showStarters}
          />
        </div>

        <section className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden bg-[var(--lakai-surface-muted)]">
        <div className="shrink-0 border-b border-[var(--lakai-border-soft)] bg-[var(--lakai-surface)] px-3 py-3 shadow-sm sm:px-4 lg:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryCollapsed((current) => !current)}
                  className="hidden min-h-11 items-center gap-2 rounded-full border border-[var(--lakai-border-soft)] px-3 py-2 text-sm font-semibold text-[var(--lakai-text-muted)] hover:bg-[var(--lakai-surface-muted)] hover:text-[var(--lakai-text)] xl:inline-flex"
                  aria-label={historyCollapsed ? t('Show chat history') : t('Hide chat history')}
                  title={historyCollapsed ? t('Show chat history') : t('Hide chat history')}
                >
                  <History size={16} aria-hidden="true" />
                  {historyCollapsed ? t('Show history') : t('Hide history')}
                </button>
                <h1 className="font-serif text-xl font-semibold text-[var(--lakai-primary-strong)] sm:text-2xl">{t('Ask Documents')}</h1>
                <StatusBadge
                  status={latestReady ? 'succeeded' : state.result ? 'degraded' : 'pending'}
                  label={latestReady ? t('Source citations available') : state.result ? t('Needs review') : t('Ready')}
                />
              </div>
              <p className="mt-1 max-w-3xl text-sm text-[var(--lakai-text-muted)]">
                {t('Ask source-based questions and review citations from this case workspace.')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setConversationMenuOpen(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--lakai-border-soft)] px-3 py-2 text-sm font-semibold text-[var(--lakai-text-muted)] hover:bg-[var(--lakai-surface-muted)] hover:text-[var(--lakai-text)] xl:hidden"
              >
                <History size={16} aria-hidden="true" />
                {t('History')}
              </button>
              <button
                type="button"
                onClick={() => setChatSettingsOpen(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--lakai-border-soft)] px-3 py-2 text-sm font-semibold text-[var(--lakai-text-muted)] hover:bg-[var(--lakai-surface-muted)] hover:text-[var(--lakai-text)]"
              >
                <SlidersHorizontal size={16} aria-hidden="true" />
                {t('Chat settings')}
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 min-w-0 max-w-full flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-3 pt-20 sm:p-4 lg:px-6 lg:pt-4">
          <section className="rounded-2xl border border-[var(--lakai-border-soft)] bg-[var(--lakai-accent-soft)] p-4 text-sm leading-6 text-[var(--lakai-text)]">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 shrink-0 text-[var(--lakai-primary-strong)]" size={18} aria-hidden="true" />
              <p>
                {t('Answers are based on your available sources and may need review. Lak.ai does not provide legal advice or decide whether materials are admissible or ready for court use.')}
              </p>
            </div>
          </section>

          {state.error ? (
            <ErrorPanel title="Query failed" error={state.error} />
          ) : null}
          {readinessState.error ? (
            <ErrorPanel title="Ask Documents readiness failed" error={readinessState.error} onRetry={loadQueryReadiness} />
          ) : null}

          {chatSettings.showReadiness ? (
            <NeedsAttentionPanel
              items={askAttentionItems}
              title="Ask Documents attention"
              description="Search and citation readiness items that may affect source-based answers."
              emptyTitle="Ask Documents is not showing readiness blockers"
              emptyDetail="Review source citations and keep working in other parts of the workspace."
              limit={3}
            />
          ) : null}

          {hasMessages ? (
            messages.map((message) => (
              <QueryMessage
                key={message.id}
                message={message}
                caseId={caseId}
                currentUserName={currentUserName}
                onCopyAnswer={copyAnswer}
                copied={copiedAnswer}
                onOpenCitation={openCitation}
                onOpenCitationList={openCitationList}
                showDiagnostics={showDiagnostics}
                showCitations={chatSettings.showCitations}
                t={t}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--lakai-border)] bg-[var(--lakai-surface)] p-6 text-sm text-[var(--lakai-text-muted)]">
              <div className="flex items-start gap-3">
                <MessageSquare className="mt-0.5 shrink-0 text-[var(--lakai-primary-strong)]" size={20} aria-hidden="true" />
                <div>
                  <div className="font-serif text-xl font-semibold text-[var(--lakai-primary-strong)]">{t('Start a new chat')}</div>
                  <p className="mt-2 leading-6">
                    {t('Ask a question about documents in this workspace. Answers should include source references when support is available.')}
                  </p>
                </div>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        <div className="border-t border-[var(--lakai-border-soft)] bg-[var(--lakai-surface)] p-3 sm:p-4">
          <label className="sr-only" htmlFor="case-query-input">
            {t('Question')}
          </label>
          <div className="flex min-w-0 items-end gap-2 sm:gap-3">
            <textarea
              id="case-query-input"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={2}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  runQuery();
                }
              }}
              className="min-h-[58px] min-w-0 flex-1 resize-none rounded-xl border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface-muted)] px-3 py-2 text-sm text-[var(--lakai-text)] outline-none focus:border-[var(--lakai-focus)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--lakai-focus)_25%,transparent)] sm:min-h-[54px]"
              placeholder={t(EXAMPLE_QUESTION)}
            />
            <button
              type="button"
              onClick={runQuery}
              disabled={state.running}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--lakai-primary)] px-3 text-sm font-semibold text-[var(--lakai-primary-text)] hover:bg-[var(--lakai-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 lg:w-36"
            >
              <Send size={16} aria-hidden="true" />
              <span className="hidden sm:inline">{state.running ? t('Running') : t('Send')}</span>
            </button>
          </div>
          <div className="mt-2 hidden flex-wrap items-center gap-3 text-xs font-medium text-[var(--lakai-text-muted)] sm:flex">
            <span>{t('Answer language: {language} | Timezone: {timeZone}', { language: preferences.language, timeZone: preferences.timeZone })}</span>
            <span className="inline-flex items-center gap-1">
              <LockKeyhole size={12} aria-hidden="true" />
              {t('Only me')}
            </span>
            {state.fingerprint?.id ? (
              <RequestFingerprint
                fingerprintId={state.fingerprint.id}
                correlationId={state.fingerprint.correlationId}
                label="Latest query"
              />
            ) : null}
          </div>
        </div>
        </section>
      </div>

      {state.result && showDiagnostics ? (
        <div className="mt-5 hidden gap-5 lg:grid xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel title={t('Retrieval Trace')}>
            {traceRows.length ? (
              <pre className="max-h-[360px] overflow-auto rounded-md bg-gray-950 p-3 text-xs text-gray-100">
                {JSON.stringify(traceRows, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('No trace returned.')}</p>
            )}
          </Panel>

          <Panel title={t('Evidence Packet')}>
            {state.result.evidence_packet?.length ? (
              <pre className="max-h-[360px] overflow-auto rounded-md bg-gray-950 p-3 text-xs text-gray-100">
                {JSON.stringify(state.result.evidence_packet, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('No evidence packet returned.')}</p>
            )}
          </Panel>
        </div>
      ) : null}

      {conversationMenuOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40 xl:hidden">
          <button
            type="button"
            className="absolute inset-0"
            aria-label={t('Close conversations')}
            onClick={() => setConversationMenuOpen(false)}
          />
          <div className="relative h-full w-[min(24rem,calc(100vw-2rem))] p-3">
            <ConversationList
              conversations={conversationState.conversations}
              activeConversationId={activeConversationId}
              loading={conversationState.loading}
              error={conversationState.error}
              onNewConversation={() => {
                startNewConversation();
                setConversationMenuOpen(false);
              }}
              onSelectConversation={(conversationId) => {
                void loadConversation(conversationId);
                setConversationMenuOpen(false);
              }}
              onRefresh={refreshConversations}
              t={t}
              showStarters={chatSettings.showStarters}
              className="h-full"
              onClose={() => setConversationMenuOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <CitationListDrawer
        drawer={citationListDrawer}
        onClose={() => setCitationListDrawer({ open: false, citations: [] })}
        onOpenCitation={openCitation}
        t={t}
      />
      <ChatSettingsDrawer
        open={chatSettingsOpen}
        onClose={() => setChatSettingsOpen(false)}
        settings={chatSettings}
        onChange={setChatSettings}
        t={t}
      />
      <CitationDrawer drawer={drawer} caseId={caseId} onClose={() => setDrawer((current) => ({ ...current, open: false }))} t={t} />
    </div>
  );
}
