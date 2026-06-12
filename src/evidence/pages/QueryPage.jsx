import {
  AlertTriangle,
  Bot,
  Check,
  Clipboard,
  Download,
  ExternalLink,
  FileText,
  History,
  Info,
  ListChecks,
  Loader2,
  LockKeyhole,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  ThumbsDown,
  ThumbsUp,
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
const QUERY_JOB_SOCKET_START_TIMEOUT_MS = 6000;
const QUERY_JOB_SOCKET_IDLE_TIMEOUT_MS = 45000;

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

function persistedMessageId(value) {
  const normalized = String(value || '');
  return normalized.startsWith('qmsg_') ? normalized : null;
}

function compactPayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

function queryFeedbackPayload({ message, rating, activeConversationId }) {
  const result = message?.result || {};
  const job = message?.job || {};
  return compactPayload({
    rating,
    job_id: job.job_id || result.job_id || result.query_job_id,
    request_fingerprint_id: message?.fingerprint?.id || message?.request_fingerprint_id || result.request_fingerprint_id,
    conversation_id: message?.conversation_id || result.conversation_id || activeConversationId,
    user_message_id: persistedMessageId(message?.user_message_id),
    assistant_message_id: persistedMessageId(message?.assistant_message_id || message?.id),
    reason_code: rating === 'thumbs_down' ? 'thumbs_down' : null,
    route: typeof window === 'undefined' ? null : `${window.location.pathname}${window.location.search}`,
    severity: rating === 'thumbs_down' ? 'medium' : 'low',
    create_github_issue: rating === 'thumbs_down',
  });
}

function queryAnswerExportPayload({ message, activeConversationId }) {
  const result = message?.result || {};
  const job = message?.job || {};
  return compactPayload({
    job_id: job.job_id || result.job_id || result.query_job_id,
    request_fingerprint_id: message?.fingerprint?.id || message?.request_fingerprint_id || result.request_fingerprint_id,
    conversation_id: message?.conversation_id || result.conversation_id || activeConversationId,
    user_message_id: persistedMessageId(message?.user_message_id),
    assistant_message_id: persistedMessageId(message?.assistant_message_id || message?.id),
    acknowledge_sensitive_export: true,
  });
}

function defaultAnswerArtifactTitle(message) {
  const result = message?.result || {};
  const answer = String(result.answer || message?.content || '').trim();
  if (!answer) {
    return 'Ask Documents answer';
  }
  const firstLine = answer.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || answer;
  return `Ask answer - ${firstLine.replace(/^#+\s*/, '').slice(0, 90)}`;
}

function downloadFileName(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) {
    return fallback;
  }
  try {
    return decodeURIComponent(raw.replace(/^["']|["']$/g, ''));
  } catch {
    return raw.replace(/^["']|["']$/g, '') || fallback;
  }
}

function queryJobFromEvent(event, previousJob = {}) {
  const payloadJob = event?.job || event?.snapshot || event?.data?.job || {};
  const eventType = String(event?.type || '').toLowerCase();
  const status = payloadJob.status
    || event?.status
    || (eventType === 'job_complete' ? 'succeeded' : previousJob?.status);
  const resultJson = {
    ...(previousJob?.result_json || {}),
    ...(payloadJob?.result_json || {}),
  };
  if (event?.display_message || payloadJob.display_message) {
    resultJson.display_message = event.display_message || payloadJob.display_message;
  }
  if (event?.conversation_id || payloadJob.conversation_id) {
    resultJson.conversation_id = event.conversation_id || payloadJob.conversation_id;
  }
  if (event?.source_reference_count ?? payloadJob.source_reference_count) {
    resultJson.source_reference_count = event.source_reference_count ?? payloadJob.source_reference_count;
  }
  return {
    ...(previousJob || {}),
    ...payloadJob,
    job_id: payloadJob.job_id || event?.job_id || previousJob?.job_id,
    status,
    workflow_status: payloadJob.workflow_status || event?.workflow_status || previousJob?.workflow_status,
    display_status: payloadJob.display_status || event?.display_status || previousJob?.display_status,
    display_message: payloadJob.display_message || event?.display_message || previousJob?.display_message,
    current_step: payloadJob.current_step || event?.current_step || previousJob?.current_step,
    progress_percent: payloadJob.progress_percent ?? event?.progress_percent ?? previousJob?.progress_percent,
    error_message: payloadJob.error_message || event?.error_message || event?.message || previousJob?.error_message,
    result_json: resultJson,
  };
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

function QueryMessage({
  message,
  caseId,
  currentUserName,
  onCopyAnswer,
  copied,
  onOpenCitation,
  onOpenCitationList,
  onSubmitFeedback,
  onExportAnswer,
  onSaveAnswerToPacket,
  answerExport,
  packetArtifact,
  feedback,
  showDiagnostics,
  showCitations = true,
  t,
}) {
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
  const selectedRating = feedback?.rating || message.feedback?.rating || null;
  const feedbackMessage = feedback?.message || message.feedback?.display_message || null;
  const feedbackTrigger = feedback?.trigger || message.feedback?.trigger || null;
  const feedbackGithubIssue = feedback?.githubIssue || message.feedback?.github_issue || null;
  const feedbackError = feedback?.error || null;
  const feedbackSaving = Boolean(feedback?.saving);
  const exportSaving = Boolean(answerExport?.saving);
  const packetArtifactSaving = Boolean(packetArtifact?.saving);
  const exportError = answerExport?.error || null;
  const exportMessage = answerExport?.message || null;
  const packetArtifactError = packetArtifact?.error || null;
  const packetArtifactMessage = packetArtifact?.messageText || null;
  const githubIssueUrl = feedbackGithubIssue?.html_url || feedbackGithubIssue?.url || null;
  const githubIssueCreated = feedbackGithubIssue?.status === 'created' && githubIssueUrl;
  const feedbackButtonClass = (rating) => {
    const selected = selectedRating === rating;
    return [
      'inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-semibold transition',
      selected
        ? 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100'
        : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 dark:border-gray-800 dark:bg-black/20 dark:text-gray-300 dark:hover:border-sky-900 dark:hover:bg-sky-950/30 dark:hover:text-sky-100',
      feedbackSaving ? 'cursor-wait opacity-70' : '',
    ].join(' ');
  };
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
              {result?.answer ? (
                <details className="relative">
                  <summary
                    className="inline-flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-700 transition marker:hidden hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 dark:border-gray-800 dark:bg-black/20 dark:text-gray-200 dark:hover:border-sky-900 dark:hover:bg-sky-950/30 dark:hover:text-sky-100"
                    title={t('Answer actions')}
                    aria-label={t('Answer actions')}
                  >
                    {exportSaving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <MoreHorizontal size={15} aria-hidden="true" />}
                  </summary>
                  <div className="absolute left-0 z-30 mt-2 w-56 overflow-hidden rounded-md border border-gray-200 bg-white py-1 text-xs shadow-lg dark:border-gray-800 dark:bg-[#101820]">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.currentTarget.closest('details')?.removeAttribute('open');
                        onExportAnswer?.(message);
                      }}
                      disabled={exportSaving}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left font-semibold text-gray-800 hover:bg-sky-50 hover:text-sky-900 disabled:cursor-wait disabled:opacity-60 dark:text-gray-100 dark:hover:bg-sky-950/30 dark:hover:text-sky-100"
                    >
                      <Download size={14} aria-hidden="true" />
                      {exportSaving ? t('Preparing download') : t('Download answer artifact')}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.currentTarget.closest('details')?.removeAttribute('open');
                        onSaveAnswerToPacket?.(message);
                      }}
                      disabled={packetArtifactSaving}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left font-semibold text-gray-800 hover:bg-sky-50 hover:text-sky-900 disabled:cursor-wait disabled:opacity-60 dark:text-gray-100 dark:hover:bg-sky-950/30 dark:hover:text-sky-100"
                      title={t('Save this generated answer to a packet folder without uploading it as source evidence.')}
                    >
                      {packetArtifactSaving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
                      {packetArtifactSaving ? t('Saving to packet') : t('Export to packet folder')}
                    </button>
                  </div>
                </details>
              ) : null}
              {result?.answer ? (
                <div className="ml-auto flex items-center gap-1" aria-label={t('Rate this answer')}>
                  <button
                    type="button"
                    onClick={() => onSubmitFeedback?.(message, 'thumbs_up')}
                    disabled={feedbackSaving}
                    className={feedbackButtonClass('thumbs_up')}
                    title={t('Helpful answer')}
                    aria-label={t('Helpful answer')}
                    aria-pressed={selectedRating === 'thumbs_up'}
                  >
                    {feedbackSaving && selectedRating === 'thumbs_up' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <ThumbsUp size={14} aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSubmitFeedback?.(message, 'thumbs_down')}
                    disabled={feedbackSaving}
                    className={feedbackButtonClass('thumbs_down')}
                    title={t('Report answer for review')}
                    aria-label={t('Report answer for review')}
                    aria-pressed={selectedRating === 'thumbs_down'}
                  >
                    {feedbackSaving && selectedRating === 'thumbs_down' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <ThumbsDown size={14} aria-hidden="true" />}
                  </button>
                </div>
              ) : null}
            </div>
            {feedbackMessage || feedbackError ? (
              <div className={`mb-3 rounded-md border px-3 py-2 text-xs ${
                feedbackError
                  ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/25 dark:text-red-100'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-100'
              }`}
              >
                <div>{feedbackError ? t('Feedback could not be saved. Try again.') : t(feedbackMessage)}</div>
                {!feedbackError && selectedRating === 'thumbs_down' && feedbackTrigger === 'local_report' ? (
                  <div className="mt-1 text-[11px] opacity-85">
                    {t('Saved for backend review. GitHub issue creation is not configured yet.')}
                  </div>
                ) : null}
                {!feedbackError && githubIssueCreated ? (
                  <a
                    href={githubIssueUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold underline"
                  >
                    <ExternalLink size={11} aria-hidden="true" />
                    {t('Open GitHub issue')}
                  </a>
                ) : null}
              </div>
            ) : null}
            {exportMessage || exportError ? (
              <div className={`mb-3 rounded-md border px-3 py-2 text-xs ${
                exportError
                  ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/25 dark:text-red-100'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-100'
              }`}
              >
                {exportError ? t('Answer artifact could not be exported. Try again.') : t(exportMessage)}
              </div>
            ) : null}
            {packetArtifactMessage || packetArtifactError ? (
              <div className={`mb-3 rounded-md border px-3 py-2 text-xs ${
                packetArtifactError
                  ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/25 dark:text-red-100'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-100'
              }`}
              >
                {packetArtifactError ? t('Answer artifact could not be saved to the packet. Try again.') : t(packetArtifactMessage)}
              </div>
            ) : null}
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
  let previousUserMessageId = null;
  return (conversation?.messages || []).map((message) => {
    if (message.role === 'assistant') {
      const result = message.query_result_json && Object.keys(message.query_result_json).length
        ? message.query_result_json
        : { answer: message.content, citations: [] };
      return {
        id: message.message_id,
        assistant_message_id: message.message_id,
        user_message_id: previousUserMessageId,
        conversation_id: conversation?.conversation_id,
        role: 'assistant',
        result,
        fingerprint: {
          id: message.request_fingerprint_id || result.request_fingerprint_id,
          correlationId: null,
        },
      };
    }
    previousUserMessageId = message.message_id;
    return {
      id: message.message_id,
      user_message_id: message.message_id,
      conversation_id: conversation?.conversation_id,
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

function PacketArtifactDialog({
  state,
  onClose,
  onPacketChange,
  onRequirementChange,
  onFolderChange,
  onTitleChange,
  onSave,
  t,
}) {
  if (!state.open) {
    return null;
  }
  const packets = state.packets || [];
  const requirements = state.packet?.requirements || [];
  const selectedRequirement = requirements.find((item) => item.requirement_id === state.selectedRequirementId) || null;
  const folders = Array.isArray(selectedRequirement?.user_folders) ? selectedRequirement.user_folders : [];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 pt-16 backdrop-blur-sm sm:p-6 sm:pt-20">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="answer-packet-artifact-title"
        className="w-full max-w-2xl rounded-2xl border border-[var(--lakai-border)] bg-[var(--lakai-surface)] p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-[var(--lakai-text-muted)]">{t('Generated packet artifact')}</p>
            <h2 id="answer-packet-artifact-title" className="mt-1 font-serif text-2xl font-semibold text-[var(--lakai-primary-strong)]">
              {t('Save answer to packet')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--lakai-text-muted)]">
              {t('This saves the generated answer as packet review material. It will not be uploaded as source evidence or sent through OCR, vector indexing, graph extraction, or source propagation.')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={state.saving}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-[var(--lakai-border)] text-[var(--lakai-text)] hover:bg-[var(--lakai-surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={t('Close')}
            title={t('Close')}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {state.error ? (
          <div className="mt-4">
            <ErrorPanel title="Packet artifact failed" error={{ message: state.error?.message || String(state.error) }} />
          </div>
        ) : null}

        {state.loading ? (
          <div className="mt-5 rounded-lg border border-[var(--lakai-border)] bg-[var(--lakai-surface-muted)] p-4 text-sm text-[var(--lakai-text-muted)]">
            <div className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              {t('Loading packet folders')}
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {!packets.length ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
                {t('Create a packet first, then return here to save this answer into a packet folder.')}
              </div>
            ) : null}
            <label className="block">
              <span className="text-xs font-semibold uppercase text-[var(--lakai-text-muted)]">{t('Packet')}</span>
              <select
                value={state.selectedPacketId || ''}
                onChange={(event) => onPacketChange(event.target.value)}
                disabled={state.saving || !packets.length}
                className="mt-1 min-h-11 w-full rounded-md border border-[var(--lakai-border)] bg-[var(--lakai-surface)] px-3 py-2 text-sm text-[var(--lakai-text)] outline-none focus:border-[var(--lakai-primary)] focus:ring-2 focus:ring-[var(--lakai-primary)]/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {packets.map((packet) => (
                  <option key={packet.packet_id} value={packet.packet_id}>{packet.name || 'Packet'}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-[var(--lakai-text-muted)]">{t('Checklist item')}</span>
              <select
                value={state.selectedRequirementId || ''}
                onChange={(event) => onRequirementChange(event.target.value)}
                disabled={state.saving || !requirements.length}
                className="mt-1 min-h-11 w-full rounded-md border border-[var(--lakai-border)] bg-[var(--lakai-surface)] px-3 py-2 text-sm text-[var(--lakai-text)] outline-none focus:border-[var(--lakai-primary)] focus:ring-2 focus:ring-[var(--lakai-primary)]/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {requirements.map((requirement) => (
                  <option key={requirement.requirement_id} value={requirement.requirement_id}>
                    {requirement.group_label ? `${requirement.group_label} / ` : ''}{requirement.label || requirement.requirement_id}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-[var(--lakai-text-muted)]">{t('Folder')}</span>
              <select
                value={state.selectedFolderId || ''}
                onChange={(event) => onFolderChange(event.target.value)}
                disabled={state.saving || !selectedRequirement}
                className="mt-1 min-h-11 w-full rounded-md border border-[var(--lakai-border)] bg-[var(--lakai-surface)] px-3 py-2 text-sm text-[var(--lakai-text)] outline-none focus:border-[var(--lakai-primary)] focus:ring-2 focus:ring-[var(--lakai-primary)]/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">{t('Checklist item only')}</option>
                {folders.map((folder) => (
                  <option key={folder.folder_id} value={folder.folder_id}>{folder.label || 'Folder'}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-[var(--lakai-text-muted)]">{t('Artifact title')}</span>
              <input
                type="text"
                value={state.title || ''}
                onChange={(event) => onTitleChange(event.target.value)}
                maxLength={180}
                placeholder={t('Ask Documents answer')}
                disabled={state.saving}
                className="mt-1 min-h-11 w-full rounded-md border border-[var(--lakai-border)] bg-[var(--lakai-surface)] px-3 py-2 text-sm text-[var(--lakai-text)] outline-none focus:border-[var(--lakai-primary)] focus:ring-2 focus:ring-[var(--lakai-primary)]/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
              {t('Generated answer artifacts stay in the packet as review material. They are not added to Documents and will not be searched as original evidence.')}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={state.saving}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--lakai-border)] px-4 py-2 text-sm font-semibold text-[var(--lakai-text)] hover:bg-[var(--lakai-surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={state.loading || state.saving || !state.selectedPacketId || !state.selectedRequirementId}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--lakai-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--lakai-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state.saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}
            {state.saving ? t('Saving') : t('Save to packet')}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function QueryPage() {
  const { caseId } = useParams();
  const { openMobileMenu } = useOutletContext() || {};
  const handleOpenMobileNavigation = useCallback(() => {
    if (typeof openMobileMenu === 'function') {
      openMobileMenu();
    }
  }, [openMobileMenu]);
  const { getAccessToken, user } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { preferences, t } = useLocaleSettings();
  const { canSeeOperations, debugEnabled } = useOperatorMode();
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
  const [feedbackState, setFeedbackState] = useState({});
  const [answerExportState, setAnswerExportState] = useState({});
  const [packetArtifactState, setPacketArtifactState] = useState({
    open: false,
    loading: false,
    saving: false,
    error: null,
    message: null,
    packets: [],
    packet: null,
    selectedPacketId: '',
    selectedRequirementId: '',
    selectedFolderId: '',
    title: '',
  });
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
    if (!canSeeOperations) {
      setReadinessState({ loading: false, health: null, error: null });
      return;
    }
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
  }, [canSeeOperations, caseId, getAccessToken, recordFingerprint]);

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
    setFeedbackState({});
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
    setFeedbackState({});
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

  const submitAnswerFeedback = useCallback(async (message, rating) => {
    const messageKey = message?.id || `${rating}-${Date.now()}`;
    const payload = queryFeedbackPayload({ message, rating, activeConversationId });
    const hasIdentifier = Boolean(
      payload.job_id
      || payload.request_fingerprint_id
      || payload.conversation_id
      || payload.user_message_id
      || payload.assistant_message_id,
    );
    if (!hasIdentifier) {
      setFeedbackState((current) => ({
        ...current,
        [messageKey]: {
          rating,
          saving: false,
          error: new Error('This answer does not have enough saved metadata to report yet.'),
        },
      }));
      return;
    }

    setFeedbackState((current) => ({
      ...current,
      [messageKey]: { ...(current[messageKey] || {}), rating, saving: true, error: null },
    }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.createQueryFeedback(caseId, payload, { token });
      recordFingerprint(result, rating === 'thumbs_down' ? 'Query issue feedback' : 'Query feedback');
      const displayMessage = result.data?.display_message
        || (rating === 'thumbs_down' ? 'Reported for review.' : 'Feedback saved.');
      const githubIssue = result.data?.github_issue || null;
      setFeedbackState((current) => ({
        ...current,
        [messageKey]: {
          rating,
          saving: false,
          error: null,
          message: displayMessage,
          trigger: result.data?.trigger,
          githubIssue,
        },
      }));
      setMessages((current) => current.map((item) => (
        item.id === messageKey
          ? {
              ...item,
              feedback: {
                rating,
                display_message: displayMessage,
                trigger: result.data?.trigger,
                github_issue: githubIssue,
              },
            }
          : item
      )));
    } catch (error) {
      setFeedbackState((current) => ({
        ...current,
        [messageKey]: { ...(current[messageKey] || {}), rating, saving: false, error },
      }));
    }
  }, [activeConversationId, caseId, getAccessToken, recordFingerprint]);

  const exportAnswerArtifact = useCallback(async (message) => {
    const messageKey = message?.id || `export-${Date.now()}`;
    const payload = queryAnswerExportPayload({ message, activeConversationId });
    const hasIdentifier = Boolean(
      payload.job_id
      || payload.request_fingerprint_id
      || payload.conversation_id
      || payload.user_message_id
      || payload.assistant_message_id,
    );
    if (!hasIdentifier) {
      setAnswerExportState((current) => ({
        ...current,
        [messageKey]: {
          saving: false,
          error: new Error('This answer does not have enough saved metadata to export yet.'),
        },
      }));
      return;
    }
    const confirmed = window.confirm(t('This downloads a generated answer artifact with source-reference metadata. It will not be uploaded as source evidence or propagated. Continue?'));
    if (!confirmed) {
      return;
    }
    setAnswerExportState((current) => ({
      ...current,
      [messageKey]: { ...(current[messageKey] || {}), saving: true, error: null, message: null },
    }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.exportQueryAnswer(caseId, payload, { token });
      const blobUrl = window.URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = downloadFileName(result.fileName, 'evidence-answer-export.zip');
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
      recordFingerprint(result, 'Query answer export');
      setAnswerExportState((current) => ({
        ...current,
        [messageKey]: {
          saving: false,
          error: null,
          message: 'Answer artifact downloaded. Keep it as generated review material, not source evidence.',
        },
      }));
    } catch (error) {
      setAnswerExportState((current) => ({
        ...current,
        [messageKey]: { ...(current[messageKey] || {}), saving: false, error },
      }));
    }
  }, [activeConversationId, caseId, getAccessToken, recordFingerprint, t]);

  const openPacketArtifactDialog = useCallback(async (message) => {
    const messageKey = message?.id || `packet-artifact-${Date.now()}`;
    const payload = queryAnswerExportPayload({ message, activeConversationId });
    const hasIdentifier = Boolean(
      payload.job_id
      || payload.request_fingerprint_id
      || payload.conversation_id
      || payload.user_message_id
      || payload.assistant_message_id,
    );
    if (!hasIdentifier) {
      setPacketArtifactState((current) => ({
        ...current,
        open: true,
        loading: false,
        saving: false,
        message,
        error: new Error('This answer does not have enough saved metadata to save into a packet yet.'),
      }));
      return;
    }
    setPacketArtifactState({
      open: true,
      loading: true,
      saving: false,
      error: null,
      message,
      messageKey,
      packets: [],
      packet: null,
      selectedPacketId: '',
      selectedRequirementId: '',
      selectedFolderId: '',
      title: defaultAnswerArtifactTitle(message),
    });
    try {
      const token = await getAccessToken();
      const packetsResult = await evidenceApi.getPackets(caseId, { token });
      recordFingerprint(packetsResult, 'Query packet artifact packets');
      const packets = packetsResult.data?.packets || [];
      const selectedPacketId = packets[0]?.packet_id || '';
      let packet = null;
      if (selectedPacketId) {
        const packetResult = await evidenceApi.getPacket(caseId, selectedPacketId, { token });
        recordFingerprint(packetResult, 'Query packet artifact packet detail');
        packet = packetResult.data?.packet || null;
      }
      const firstRequirement = packet?.requirements?.[0] || null;
      setPacketArtifactState((current) => ({
        ...current,
        loading: false,
        error: null,
        packets,
        packet,
        selectedPacketId,
        selectedRequirementId: firstRequirement?.requirement_id || '',
        selectedFolderId: '',
      }));
    } catch (error) {
      setPacketArtifactState((current) => ({ ...current, loading: false, error }));
    }
  }, [activeConversationId, caseId, getAccessToken, recordFingerprint]);

  const changePacketArtifactPacket = useCallback(async (packetId) => {
    setPacketArtifactState((current) => ({
      ...current,
      loading: true,
      error: null,
      selectedPacketId: packetId,
      selectedRequirementId: '',
      selectedFolderId: '',
      packet: null,
    }));
    try {
      const token = await getAccessToken();
      const packetResult = await evidenceApi.getPacket(caseId, packetId, { token });
      recordFingerprint(packetResult, 'Query packet artifact packet detail');
      const packet = packetResult.data?.packet || null;
      const firstRequirement = packet?.requirements?.[0] || null;
      setPacketArtifactState((current) => ({
        ...current,
        loading: false,
        packet,
        selectedRequirementId: firstRequirement?.requirement_id || '',
        selectedFolderId: '',
      }));
    } catch (error) {
      setPacketArtifactState((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  const saveAnswerToPacketArtifact = useCallback(async () => {
    const current = packetArtifactState;
    const message = current.message;
    const messageKey = current.messageKey || message?.id || `packet-artifact-${Date.now()}`;
    const payload = {
      ...queryAnswerExportPayload({ message, activeConversationId }),
      title: current.title || defaultAnswerArtifactTitle(message),
      folder_id: current.selectedFolderId || null,
      acknowledge_sensitive_export: true,
    };
    setPacketArtifactState((stateValue) => ({ ...stateValue, saving: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.createPacketQueryAnswerArtifact(
        caseId,
        current.selectedPacketId,
        current.selectedRequirementId,
        payload,
        { token },
      );
      recordFingerprint(result, 'Query answer packet artifact');
      setPacketArtifactState((stateValue) => ({
        ...stateValue,
        open: false,
        saving: false,
        error: null,
        message,
        messageKey,
        packet: result.data?.packet || stateValue.packet,
        messageText: result.data?.message || 'Answer artifact saved to packet. It was not uploaded as source evidence.',
      }));
    } catch (error) {
      setPacketArtifactState((stateValue) => ({ ...stateValue, saving: false, error }));
    }
  }, [activeConversationId, caseId, getAccessToken, packetArtifactState, recordFingerprint]);

  const pollQueryJob = useCallback(async ({ initialJob, token, assistantId, fingerprint }) => {
    let latestJob = initialJob;
    while (mountedRef.current && latestJob?.job_id && queryJobIsActive(latestJob)) {
      await waitFor(2500);
      if (!mountedRef.current) {
        return latestJob;
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
    return latestJob;
  }, [caseId, recordFingerprint]);

  const watchQueryJobWithEvents = useCallback(({ initialJob, token, assistantId, fingerprint }) => new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined' || !initialJob?.job_id) {
      resolve({ ok: false, job: initialJob });
      return;
    }

    let latestJob = initialJob;
    let opened = false;
    let settled = false;
    let socket = null;
    let startTimer = null;
    let idleTimer = null;

    const finish = (ok, job = latestJob) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(idleTimer);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close(1000, 'done');
      }
      resolve({ ok, job });
    };

    const resetIdleTimer = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => finish(false, latestJob), QUERY_JOB_SOCKET_IDLE_TIMEOUT_MS);
    };

    try {
      socket = new WebSocket(evidenceApi.getJobEventsWebSocketUrl(caseId, initialJob.job_id));
    } catch {
      finish(false, latestJob);
      return;
    }

    startTimer = window.setTimeout(() => {
      if (!opened) {
        finish(false, latestJob);
      }
    }, QUERY_JOB_SOCKET_START_TIMEOUT_MS);
    resetIdleTimer();

    socket.addEventListener('open', () => {
      opened = true;
      socket.send(JSON.stringify({ type: 'auth', access_token: token }));
      resetIdleTimer();
    });

    socket.addEventListener('message', (event) => {
      resetIdleTimer();
      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      const type = String(payload?.type || '').toLowerCase();
      if (type === 'error') {
        finish(false, latestJob);
        return;
      }
      latestJob = queryJobFromEvent(payload, latestJob);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                running: !['job_complete', 'job_stream_timeout'].includes(type) && queryJobIsActive(latestJob),
                job: latestJob,
                fingerprint,
              }
            : message,
        ),
      );
      if (type === 'job_complete' || type === 'job_stream_timeout') {
        finish(true, latestJob);
      }
    });

    socket.addEventListener('error', () => finish(false, latestJob));
    socket.addEventListener('close', () => {
      if (!settled && queryJobIsActive(latestJob)) {
        finish(false, latestJob);
      }
    });
  }), [caseId]);

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
      if (latestJob?.job_id && queryJobIsActive(latestJob)) {
        const watched = await watchQueryJobWithEvents({ initialJob: latestJob, token, assistantId, fingerprint });
        latestJob = watched.job || latestJob;
        if (!watched.ok && mountedRef.current && queryJobIsActive(latestJob)) {
          latestJob = await pollQueryJob({ initialJob: latestJob, token, assistantId, fingerprint });
        }
      }

      if (mountedRef.current && latestJob?.job_id) {
        const finalJobResult = await evidenceApi.getJob(caseId, latestJob.job_id, { token });
        recordFingerprint(finalJobResult, 'Query job final status');
        latestJob = finalJobResult.data;
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  running: queryJobIsActive(latestJob),
                  job: latestJob,
                  fingerprint: {
                    id: finalJobResult.requestFingerprintId || queryJobFingerprint(latestJob) || fingerprint.id,
                    correlationId: finalJobResult.correlationId,
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
  }, [activeConversationId, caseId, currentUserName, getAccessToken, loadConversation, pollQueryJob, preferences.language, preferences.timeZone, question, recordFingerprint, refreshConversations, showDiagnostics, watchQueryJobWithEvents]);

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
      <div className="shrink-0 border-b border-[var(--lakai-border-soft)] bg-[var(--lakai-surface)] px-3 py-3 shadow-sm lg:hidden">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleOpenMobileNavigation}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface-muted)] text-[var(--lakai-text)] hover:bg-[var(--lakai-accent-soft)]"
            aria-label={t('Open navigation')}
            title={t('Open navigation')}
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1 rounded-full border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface-muted)] px-3 py-2 text-center text-sm font-semibold text-[var(--lakai-text)]">
            {t('Ask Documents')}
          </div>
          <button
            type="button"
            onClick={() => setConversationMenuOpen(true)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface-muted)] text-[var(--lakai-text)] hover:bg-[var(--lakai-accent-soft)]"
            aria-label={t('Open conversations')}
            title={t('Open conversations')}
          >
            <History size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setChatSettingsOpen(true)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--lakai-border-soft)] bg-[var(--lakai-surface-muted)] text-[var(--lakai-text)] hover:bg-[var(--lakai-accent-soft)]"
            aria-label={t('Chat settings')}
            title={t('Chat settings')}
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 overflow-hidden lg:h-full">
        <div className={`${historyCollapsed ? 'hidden' : 'hidden w-80 shrink-0 min-h-0 border-r border-[var(--lakai-border-soft)] bg-[var(--lakai-bg)] p-3 xl:block'}`}>
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

        <section className="flex h-full min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-[var(--lakai-surface-muted)]">
        <div className="hidden shrink-0 border-b border-[var(--lakai-border-soft)] bg-[var(--lakai-surface)] px-3 py-3 shadow-sm sm:px-4 lg:block lg:px-6">
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

        <div className="min-h-0 min-w-0 max-w-full flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-3 sm:p-4 lg:px-6 lg:py-4">
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

          {chatSettings.showReadiness && askAttentionItems.length ? (
            <NeedsAttentionPanel
              items={askAttentionItems}
              title="Ask Documents attention"
              description="Search and citation readiness items that may affect source-based answers."
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
                onSubmitFeedback={submitAnswerFeedback}
                onExportAnswer={exportAnswerArtifact}
                onSaveAnswerToPacket={openPacketArtifactDialog}
                answerExport={answerExportState[message.id]}
                packetArtifact={packetArtifactState.message?.id === message.id ? packetArtifactState : null}
                feedback={feedbackState[message.id]}
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
      <PacketArtifactDialog
        state={packetArtifactState}
        onClose={() => setPacketArtifactState((current) => ({ ...current, open: false }))}
        onPacketChange={changePacketArtifactPacket}
        onRequirementChange={(requirementId) => setPacketArtifactState((current) => ({
          ...current,
          selectedRequirementId: requirementId,
          selectedFolderId: '',
          error: null,
        }))}
        onFolderChange={(folderId) => setPacketArtifactState((current) => ({
          ...current,
          selectedFolderId: folderId,
          error: null,
        }))}
        onTitleChange={(title) => setPacketArtifactState((current) => ({ ...current, title }))}
        onSave={saveAnswerToPacketArtifact}
        t={t}
      />
      <CitationDrawer drawer={drawer} caseId={caseId} onClose={() => setDrawer((current) => ({ ...current, open: false }))} t={t} />
    </div>
  );
}
