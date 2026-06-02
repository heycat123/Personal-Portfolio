import { MessageSquareText } from 'lucide-react';
import { useLocaleSettings } from '../context/LocaleContext';
import { formatDateTime } from '../utils/formatters';
import {
  detectedLanguageLabel,
  transcriptCharacterCount,
  transcriptPages,
  transcriptSegments,
  transcriptText,
  transcriptTextForPage,
  transcriptUpdatedAt,
  transcriptionMethod,
} from '../utils/documentMedia';

function segmentText(segment) {
  return segment.text || segment.transcript || segment.content || segment.message || '';
}

function segmentTime(segment) {
  const start = segment.start_time || segment.start || segment.start_seconds;
  const end = segment.end_time || segment.end || segment.end_seconds;
  if (start === undefined && end === undefined) {
    return null;
  }
  return [start, end].filter((value) => value !== undefined && value !== null && value !== '').join(' - ');
}

export default function TranscriptPanel({ document, compact = false, id = undefined }) {
  const { t } = useLocaleSettings();
  const pages = transcriptPages(document);
  const segments = transcriptSegments(document).filter((segment) => segmentText(segment));
  const text = transcriptText(document);
  const method = transcriptionMethod(document);
  const language = detectedLanguageLabel(document);
  const characters = transcriptCharacterCount(document);
  const updatedAt = transcriptUpdatedAt(document);

  if (!segments.length && !text) {
    return (
      <section id={id} className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-300">
        <div className="flex items-center gap-2 font-semibold text-gray-950 dark:text-white">
          <MessageSquareText size={17} aria-hidden="true" />
          {t('Transcript')}
        </div>
        <p className="mt-2 leading-6">
          {t('Transcript text is not available yet. If this audio or video has been transcribed, refresh after processing finishes.')}
        </p>
      </section>
    );
  }

  return (
    <section id={id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-gray-950 dark:text-white">
            <MessageSquareText size={18} aria-hidden="true" />
            {t('Transcript')}
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {t('Transcript text is prepared for review and search. Speaker labels can be added when speaker identification is available.')}
          </p>
        </div>
        <dl className="grid gap-2 text-xs text-gray-600 dark:text-gray-400 sm:grid-cols-2 md:min-w-72">
          <div>
            <dt className="font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-500">{t('Language')}</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-gray-100">{t(language)}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-500">{t('Characters')}</dt>
            <dd className="mt-0.5 text-gray-900 dark:text-gray-100">{characters || 0}</dd>
          </div>
          {!compact ? (
            <>
              <div>
                <dt className="font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-500">{t('Method')}</dt>
                <dd className="mt-0.5 text-gray-900 dark:text-gray-100">{method || t('Not recorded')}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-500">{t('Updated')}</dt>
                <dd className="mt-0.5 text-gray-900 dark:text-gray-100">{formatDateTime(updatedAt)}</dd>
              </div>
            </>
          ) : null}
        </dl>
      </div>

      {segments.length ? (
        <div className="mt-4 space-y-3">
          {segments.map((segment, index) => (
            <article key={`${segment.speaker || 'speaker'}-${segmentTime(segment) || index}`} className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-black/20">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                <span>{segment.speaker || segment.confirmed_speaker || t('Speaker')}</span>
                {segmentTime(segment) ? <span>{segmentTime(segment)}</span> : null}
                {segment.confidence ? <span>{t('Confidence')}: {segment.confidence}</span> : null}
              </div>
              <p className="mt-2 max-w-3xl whitespace-pre-wrap text-[15px] leading-7 text-gray-900 dark:text-gray-100">
                {segmentText(segment)}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {pages.length ? pages.map((page, index) => (
            <article key={`${page.page_number || index}-${page.text_source || 'transcript'}`} className="max-w-4xl rounded-md border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-800 dark:bg-black/20">
              {pages.length > 1 ? (
                <div className="mb-2 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">
                  {t('Transcript record')} {page.page_number || index + 1}
                </div>
              ) : null}
              <p className="whitespace-pre-wrap text-[15px] leading-7 text-gray-900 dark:text-gray-100">
                {transcriptTextForPage(page)}
              </p>
            </article>
          )) : (
            <article className="max-w-4xl rounded-md border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-800 dark:bg-black/20">
              <p className="whitespace-pre-wrap text-[15px] leading-7 text-gray-900 dark:text-gray-100">{text}</p>
            </article>
          )}
        </div>
      )}
    </section>
  );
}
