import { Bot, ExternalLink, FileText, History, ListChecks, Loader2, MessageSquare, Plus, RefreshCw, Send, Wrench, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { evidenceApi } from '../services/evidenceApi';

const EXAMPLE_QUESTION = 'Which documents mention the parenting schedule?';

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
  return citation?.citation || `${citation?.source || 'Source'}${citation?.page ? `, p. ${citation.page}` : ''}`;
}

function citationOpenId(citation) {
  if (!citation || typeof citation === 'string') {
    return null;
  }
  return citation.file_id || citation.file_hash || citation.content_hash || null;
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
  const page = citation.page || citation.page_number;
  return [
    citation.packet_item_id,
    citation.packet_item_id ? `[${citation.packet_item_id}]` : null,
    citationLabel(citation),
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
      const page = citation.page || citation.page_number;
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
  const canOpen = Boolean(citationOpenId(citation));
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
        const canOpen = Boolean(citationOpenId(citation));
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
        <span className="font-semibold">{t('Agentic planner')}</span>
        <StatusBadge status={verified ? 'succeeded' : 'degraded'} label={verified ? t('Verified') : t('Needs review')} />
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

function QueryMessage({ message, onOpenCitation, onOpenCitationList, t }) {
  if (message.role === 'user') {
    return (
      <div className="flex min-w-0 max-w-full justify-end">
        <div className="min-w-0 max-w-[calc(100vw-2rem)] overflow-hidden break-words rounded-lg bg-sky-700 px-4 py-3 text-sm text-white shadow-sm sm:max-w-[88%]">
          {message.content}
        </div>
      </div>
    );
  }

  const result = message.result;
  const verifier = result?.verifier_status;
  const verified = Boolean(verifier?.verified || verifier?.sufficient);
  return (
    <div className="flex min-w-0 max-w-full justify-start">
      <div className="min-w-0 w-full max-w-full overflow-hidden rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-sm dark:border-gray-800 dark:bg-[#101820] sm:max-w-[92%] sm:p-4">
        {message.running ? (
          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {t('Running')}
          </div>
        ) : message.error ? (
          <ErrorPanel title="Query failed" error={message.error} />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge
                status={verified ? 'succeeded' : 'degraded'}
                label={verified ? t('Verified') : t('Not verified')}
              />
              {message.fingerprint?.id ? (
                <RequestFingerprint
                  fingerprintId={message.fingerprint.id}
                  correlationId={message.fingerprint.correlationId}
                  label="Query fingerprint"
                />
              ) : null}
            </div>
            <InlineAnswer answer={result?.answer} citations={result?.citations || []} onOpenCitation={onOpenCitation} />
            <AgenticSummary result={result} t={t} />
            {result?.citations?.length ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => onOpenCitationList(result.citations)}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 dark:border-gray-800 dark:bg-black/20 dark:text-gray-200 dark:hover:border-sky-900 dark:hover:bg-sky-950/30 dark:hover:text-sky-100"
                >
                  <ListChecks size={14} aria-hidden="true" />
                  {t('Open citation list')} ({result.citations.length})
                </button>
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 text-xs text-gray-600 dark:text-gray-400 sm:grid-cols-3">
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
            </div>
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
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <aside className="h-full w-screen max-w-full overflow-y-auto overflow-x-hidden border-l border-gray-200 bg-white p-3 shadow-xl dark:border-gray-800 dark:bg-[#0b1117] sm:w-[92vw] sm:max-w-xl sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Citation')}</div>
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
        {drawer.loading ? (
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

            <Panel title={`${t('Page')} ${drawer.page || ''}`}>
              {page?.page_text_preview ? (
                <pre className="max-h-[520px] whitespace-pre-wrap rounded-md bg-gray-950 p-3 text-xs leading-5 text-gray-100">
                  {page.page_text_preview}
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
}) {
  return (
    <aside className="min-w-0 max-w-full overflow-hidden rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-[#101820] xl:h-full">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <History size={17} className="shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
          <h3 className="truncate text-sm font-semibold text-gray-950 dark:text-white">{t('Conversations')}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label={t('Refresh conversations')}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onNewConversation}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label={t('New conversation')}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {error ? <ErrorPanel title="Conversation history failed" error={error} /> : null}
      <div className="flex max-w-full gap-2 overflow-x-auto pb-1 xl:max-h-[calc(100%_-_3.25rem)] xl:flex-col xl:overflow-y-auto xl:overflow-x-hidden">
        {conversations.length ? (
          conversations.map((conversation) => {
            const active = conversation.conversation_id === activeConversationId;
            return (
              <button
                key={conversation.conversation_id}
                type="button"
                onClick={() => onSelectConversation(conversation.conversation_id)}
                className={`min-w-[240px] rounded-md border p-3 text-left text-sm xl:min-w-0 ${
                  active
                    ? 'border-sky-400 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100'
                    : 'border-gray-200 bg-gray-50 text-gray-800 hover:border-sky-300 hover:bg-sky-50 dark:border-gray-800 dark:bg-black/20 dark:text-gray-200 dark:hover:border-sky-900 dark:hover:bg-sky-950/20'
                }`}
              >
                <div className="truncate font-semibold">{conversation.title || t('New conversation')}</div>
                <div className="mt-1 truncate text-xs opacity-75">
                  {conversation.last_message_preview || `${conversation.message_count || 0} ${t('messages')}`}
                </div>
                <div className="mt-2 text-xs opacity-70">
                  {formatConversationTime(conversation.last_message_at || conversation.updated_at || conversation.created_at)}
                </div>
              </button>
            );
          })
        ) : (
          <div className="min-w-[240px] rounded-md border border-dashed border-gray-300 p-3 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400 xl:min-w-0">
            {loading ? t('Loading conversations.') : t('No saved conversations yet.')}
          </div>
        )}
      </div>
    </aside>
  );
}

export default function QueryPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { preferences, t } = useLocaleSettings();
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
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

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
      { id: `user-${timestamp}`, role: 'user', content: trimmed },
      { id: assistantId, role: 'assistant', running: true },
    ]);
    setQuestion('');
    setState((current) => ({ ...current, running: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.queryCase(
        caseId,
        {
          question: trimmed,
          mode: 'agentic',
          include_trace: true,
          response_language: preferences.language,
          viewer_timezone: preferences.timeZone,
          conversation_id: activeConversationId,
        },
        { token },
      );
      recordFingerprint(result, 'Case query');
      const fingerprint = {
        id: result.requestFingerprintId || result.data?.request_fingerprint_id,
        correlationId: result.correlationId,
      };
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                running: false,
                result: result.data,
                fingerprint,
              }
            : message,
        ),
      );
      setState({
        running: false,
        error: null,
        result: result.data,
        fingerprint,
      });
      if (result.data?.conversation_id) {
        setActiveConversationId(result.data.conversation_id);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(conversationStorageKey(caseId), result.data.conversation_id);
        }
      }
      await refreshConversations();
    } catch (error) {
      setMessages((current) =>
        current.map((message) => (message.id === assistantId ? { ...message, running: false, error } : message)),
      );
      setState((current) => ({ ...current, running: false, error }));
    }
  }, [activeConversationId, caseId, getAccessToken, preferences.language, preferences.timeZone, question, recordFingerprint, refreshConversations]);

  const openCitation = useCallback(
    async (citation) => {
      const documentId = citationOpenId(citation);
      if (!documentId) {
        return;
      }
      setDrawer({
        open: true,
        loading: true,
        error: null,
        citation,
        page: citation.page_number || citation.page,
        document: null,
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
  const latestVerified = Boolean(latestVerifier?.verified || latestVerifier?.sufficient);
  const hasMessages = messages.length > 0;
  const traceRows = useMemo(() => state.result?.retrieval_trace || [], [state.result?.retrieval_trace]);

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <PageHeader
        title="Agentic Query"
        description="Ask case-scoped evidence questions through the agentic planner and inspect tools, sufficiency, citations, trace, and cost."
        actions={
          <StatusBadge
            status={latestVerified ? 'succeeded' : state.result ? 'degraded' : 'pending'}
            label={latestVerified ? t('Verified') : state.result ? t('Not verified') : t('Ready')}
          />
        }
      />

      {state.error ? (
        <div className="mb-5">
          <ErrorPanel title="Query failed" error={state.error} />
        </div>
      ) : null}

      <div className="grid h-[calc(100dvh_-_290px)] min-h-[360px] w-full min-w-0 max-w-full gap-4 overflow-hidden sm:h-[calc(100dvh_-_260px)] sm:min-h-[420px] lg:h-[calc(100dvh_-_240px)] xl:grid-cols-[300px_minmax(0,1fr)]">
        <ConversationList
          conversations={conversationState.conversations}
          activeConversationId={activeConversationId}
          loading={conversationState.loading}
          error={conversationState.error}
          onNewConversation={startNewConversation}
          onSelectConversation={loadConversation}
          onRefresh={refreshConversations}
          t={t}
        />

        <section className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-50 shadow-sm dark:border-gray-800 dark:bg-[#070b10]">
        <div className="min-h-0 min-w-0 max-w-full flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain p-3 sm:p-4">
          {hasMessages ? (
            messages.map((message) => (
              <QueryMessage
                key={message.id}
                message={message}
                onOpenCitation={openCitation}
                onOpenCitationList={openCitationList}
                t={t}
              />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-5 text-sm text-gray-600 dark:border-gray-800 dark:bg-[#101820] dark:text-gray-400">
              <div className="flex items-center gap-2">
                <MessageSquare size={18} aria-hidden="true" />
                {t('Run a question to inspect the agentic planner response.')}
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        <div className="border-t border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#101820]">
          <label className="sr-only" htmlFor="case-query-input">
            {t('Question')}
          </label>
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row">
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
              className="min-h-[54px] min-w-0 flex-1 resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              placeholder={t(EXAMPLE_QUESTION)}
            />
            <button
              type="button"
              onClick={runQuery}
              disabled={state.running}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60 lg:w-36"
            >
              <Send size={16} aria-hidden="true" />
              {state.running ? t('Running') : t('Send')}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-medium text-gray-500 dark:text-gray-400">
            <span>{t('Answer language: {language} | Timezone: {timeZone}', { language: preferences.language, timeZone: preferences.timeZone })}</span>
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

      {state.result ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
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

      <CitationListDrawer
        drawer={citationListDrawer}
        onClose={() => setCitationListDrawer({ open: false, citations: [] })}
        onOpenCitation={openCitation}
        t={t}
      />
      <CitationDrawer drawer={drawer} caseId={caseId} onClose={() => setDrawer((current) => ({ ...current, open: false }))} t={t} />
    </div>
  );
}
