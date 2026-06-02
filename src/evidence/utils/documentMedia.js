import { humanizeKey } from './formatters';

export function fileExtension(fileName) {
  const value = String(fileName || '').toLowerCase();
  const index = value.lastIndexOf('.');
  return index >= 0 ? value.slice(index + 1) : '';
}

export function isAudioDocument(document = {}, contentType = '') {
  const type = String(contentType || document.media_type || document.content_type || '').toLowerCase();
  const name = document.original_filename || document.filename || document.file_name || '';
  return type.startsWith('audio/') || ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac'].includes(fileExtension(name));
}

export function isVideoDocument(document = {}, contentType = '') {
  const type = String(contentType || document.media_type || document.content_type || '').toLowerCase();
  const name = document.original_filename || document.filename || document.file_name || '';
  return type.startsWith('video/') || ['mp4', 'mov', 'webm', 'm4v'].includes(fileExtension(name));
}

export function mediaKind(document = {}, contentType = '') {
  if (isAudioDocument(document, contentType)) {
    return 'audio';
  }
  if (isVideoDocument(document, contentType)) {
    return 'video';
  }
  return 'document';
}

export function mediaKindLabel(document = {}, contentType = '') {
  const kind = mediaKind(document, contentType);
  if (kind === 'audio') {
    return 'Audio';
  }
  if (kind === 'video') {
    return 'Video';
  }
  return document.evidence_classification?.label
    || document.evidence_type_label
    || document.document_type_label
    || 'Document';
}

export function transcriptPages(document = {}) {
  const pages = document.pages || document.document_pages || [];
  if (!Array.isArray(pages)) {
    return [];
  }
  return pages.filter((page) => transcriptTextForPage(page));
}

export function transcriptTextForPage(page = {}) {
  return page.page_text || page.text || page.transcript || page.page_text_preview || page.preview_text || '';
}

export function transcriptSegments(document = {}) {
  const documentSegments = document.transcript_segments || document.speaker_segments || [];
  if (Array.isArray(documentSegments) && documentSegments.length) {
    return documentSegments;
  }
  return transcriptPages(document).flatMap((page) => {
    const pageSegments = page.transcript_segments || page.speaker_segments || page.segments || [];
    return Array.isArray(pageSegments)
      ? pageSegments.map((segment) => ({ ...segment, page_number: page.page_number }))
      : [];
  });
}

export function transcriptText(document = {}) {
  return transcriptPages(document)
    .map(transcriptTextForPage)
    .filter(Boolean)
    .join('\n\n');
}

export function hasTranscript(document = {}) {
  return Boolean(transcriptText(document) || transcriptSegments(document).length);
}

function normalizeLanguage(value) {
  return String(value || '').trim().toLowerCase().replace('_', '-');
}

export function languageLabel(value) {
  const normalized = normalizeLanguage(value);
  if (!normalized || ['unknown', 'undetected', 'none', 'null'].includes(normalized)) {
    return null;
  }
  if (normalized.startsWith('en')) {
    return 'English';
  }
  if (normalized.startsWith('pt')) {
    return 'Portuguese';
  }
  if (normalized.startsWith('es')) {
    return 'Spanish';
  }
  return humanizeKey(value);
}

export function detectedLanguageLabel(document = {}) {
  const explicit = languageLabel(
    document.detected_language
    || document.language_detected
    || document.language
    || document.primary_language,
  );
  if (explicit) {
    return explicit;
  }

  const pages = transcriptPages(document);
  const pageLanguage = pages.map((page) => languageLabel(page.language_detected || page.detected_language)).find(Boolean);
  if (pageLanguage) {
    return pageLanguage;
  }

  const summary = document.language_summary || {};
  const [summaryLanguage] = Object.entries(summary)
    .filter(([, count]) => Number(count) > 0)
    .map(([language]) => language)
    .filter((language) => languageLabel(language));
  const summaryLabel = languageLabel(summaryLanguage);
  if (summaryLabel) {
    return summaryLabel;
  }

  return hasTranscript(document) ? 'Language not confirmed' : 'No language detection yet';
}

export function transcriptCharacterCount(document = {}) {
  const explicit = Number(document.transcript_characters || document.transcript_text_chars || 0);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  return transcriptPages(document).reduce((sum, page) => {
    const pageCount = Number(page.page_text_chars || page.text_chars || 0);
    return sum + (Number.isFinite(pageCount) && pageCount > 0 ? pageCount : transcriptTextForPage(page).length);
  }, 0);
}

export function transcriptUpdatedAt(document = {}) {
  return transcriptPages(document)
    .map((page) => page.updated_at || page.created_at)
    .filter(Boolean)
    .sort()
    .at(-1) || document.updated_at || document.created_at || null;
}

export function transcriptionMethod(document = {}) {
  return document.transcription_method
    || document.extraction_method
    || transcriptPages(document).map((page) => page.text_source || page.extraction_method).find(Boolean)
    || null;
}
