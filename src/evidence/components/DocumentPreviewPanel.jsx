import { ExternalLink } from 'lucide-react';
import ErrorPanel from './ErrorPanel';
import { useLocaleSettings } from '../context/LocaleContext';
import { fileExtension, isAudioDocument, isVideoDocument } from '../utils/documentMedia';

function isOdt(contentType, fileName) {
  const type = String(contentType || '').toLowerCase();
  return type.includes('opendocument.text') || fileExtension(fileName) === 'odt';
}

function extractedText(document) {
  const pages = document?.pages || document?.document_pages || [];
  return (pages || [])
    .map((page) => page.page_text || page.text || page.page_text_preview || page.preview_text || '')
    .filter(Boolean)
    .join('\n\n');
}

function sourceHref(previewUrl, document) {
  return document?.source_details?.drive_web_view_link || document?.source_url || previewUrl || null;
}

export default function DocumentPreviewPanel({
  previewError = null,
  previewUrl = null,
  contentType = '',
  fileName = '',
  document = null,
  maxHeightClass = 'max-h-[58vh]',
}) {
  const { t } = useLocaleSettings();
  const name = fileName || document?.original_filename || document?.filename || t('Document preview');
  const href = sourceHref(previewUrl, document);
  const text = extractedText(document);
  const odt = isOdt(contentType || document?.media_type, name);

  if (odt) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-[#101820] dark:text-gray-300">
        <div className="font-semibold text-gray-950 dark:text-white">{t('OpenDocument text preview')}</div>
        {text ? (
          <pre className="mt-3 max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 text-sm leading-6 text-gray-900 dark:border-gray-800 dark:bg-black/20 dark:text-gray-100">
            {text}
          </pre>
        ) : (
          <p className="mt-2 leading-6">
            {t('ODT preview will be available after text extraction. You can keep working in other parts of the workspace, or open the source file if you need to inspect it now.')}
          </p>
        )}
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800">
            <ExternalLink size={16} aria-hidden="true" />
            {t('Open source file')}
          </a>
        ) : null}
      </div>
    );
  }

  if (previewError && !previewUrl) {
    return <ErrorPanel title={t('Source file preview failed')} error={previewError} />;
  }

  if (!previewUrl) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-[#101820] dark:text-gray-300">
        <p>{t('No inline preview is available for this file yet.')}</p>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800">
            <ExternalLink size={16} aria-hidden="true" />
            {t('Open source file')}
          </a>
        ) : null}
      </div>
    );
  }

  const normalizedType = String(contentType || '').toLowerCase();
  if (normalizedType.startsWith('image/')) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-black/30">
        <img src={previewUrl} alt={name} className={`${maxHeightClass} w-full object-contain`} />
      </div>
    );
  }
  if (isAudioDocument({ ...document, original_filename: name }, contentType)) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#101820]">
        <audio src={previewUrl} controls className="w-full">
          {t('Audio preview is not supported by this browser.')}
        </audio>
      </div>
    );
  }
  if (isVideoDocument({ ...document, original_filename: name }, contentType)) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-black dark:border-gray-800">
        <video src={previewUrl} controls className="max-h-[58vh] w-full">
          {t('Video preview is not supported by this browser.')}
        </video>
      </div>
    );
  }
  if (normalizedType.includes('pdf') || normalizedType.startsWith('text/')) {
    return (
      <iframe
        title={name}
        src={previewUrl}
        className="h-[58vh] w-full rounded-lg border border-gray-200 bg-white dark:border-gray-800"
      />
    );
  }
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-[#101820] dark:text-gray-300">
      <p>{t('Inline preview is not available for this file type.')}</p>
      <a href={previewUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800">
        <ExternalLink size={16} aria-hidden="true" />
        {t('Open source file')}
      </a>
    </div>
  );
}
