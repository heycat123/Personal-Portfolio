import { sumCounts } from './formatters';

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function firstResolution(...values) {
  return values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || null;
}

function issueExists(items, id) {
  return items.some((item) => item.id === id);
}

function addIssue(items, issue) {
  if (!issue?.id || issueExists(items, issue.id)) {
    return;
  }
  items.push({
    severity: 'review',
    pages: ['case-home'],
    domains: [],
    ...issue,
  });
}

function safeSourceCoverageDetail(item, fallback) {
  const classId = String(item?.class_id || '').toLowerCase();
  if (classId === 'extracted_not_graphed') {
    return 'Some extracted readable documents have not been added to search or relationship-map records yet. Finish text/search processing, then run source coverage again.';
  }
  if (classId === 'graphed_not_vectorized') {
    return 'Some search or relationship-map records still need coverage refresh. Wait for processing to finish, then run source coverage again.';
  }
  if (classId === 's3_only') {
    return 'Some secure workspace copies are outside the selected source set. Review source selection or exclusions before treating source coverage as complete.';
  }
  if (classId === 'postgres_only') {
    return 'Some processed records do not have a matching secure workspace copy. Review Documents for source-copy status.';
  }
  if (classId === 'selected_source_missing_from_s3') {
    return 'Some selected source files do not have a secure workspace copy yet. Review Add Documents or source sync before treating coverage as complete.';
  }
  if (classId === 'intentionally_excluded') {
    return 'Confirm excluded source items are intentional and documented before treating source coverage as complete.';
  }
  return String(fallback || 'Some files do not yet match across connected sources and processed records.')
    .replace(/queue a document processing request/gi, 'start document processing')
    .replace(/run operator text extraction/gi, 'finish text extraction')
    .replace(/source alignment audit/gi, 'source coverage check')
    .replace(/source alignment/gi, 'source coverage');
}

export function filterAttentionItems(items, page) {
  return (items || []).filter((item) => !page || (item.pages || []).includes(page));
}

export function buildCaseAttentionItems({
  caseId,
  counts = {},
  health = null,
  sourceAlignment = null,
  documentsPanelStatus = null,
  documentProcessingReadiness = null,
  access = null,
  people = null,
  connectors = [],
} = {}) {
  const items = [];
  const healthCounts = health?.summary?.counts || {};
  const mergedCounts = { ...healthCounts, ...(counts || {}) };
  const documentReadiness = documentProcessingReadiness || health?.document_processing_readiness || documentsPanelStatus?.document_processing_readiness || null;
  const copiedPendingRows = numberValue(
    documentReadiness?.copied_not_extracted_records
    || mergedCounts.s3_files_not_extracted
    || mergedCounts.copied_not_extracted_records,
  );
  const copiedPendingHashes = numberValue(documentReadiness?.copied_not_extracted_hashes);
  const missingSecureCopies = numberValue(mergedCounts.extracted_files_missing_s3);
  const documentsNeedingReview = sumCounts(mergedCounts, [
    'documents_needing_review',
    'needs_review_documents',
    'uncategorized_documents',
    'missing_source_documents',
    'missing_date_documents',
    'missing_text_documents',
    'sensitive_info_warning_documents',
  ]);

  if (copiedPendingRows > 0 || documentReadiness?.full_propagation_complete === false) {
    const resolution = firstResolution(documentReadiness?.resolution, documentsPanelStatus?.next_actions?.[0]);
    addIssue(items, {
      id: 'search-processing',
      severity: 'blocking',
      domains: ['documents', 'sources', 'search'],
      pages: ['case-home', 'health', 'documents', 'add-documents', 'ask-documents'],
      title: 'Search still catching up',
      detail: resolution?.user_message || (
        copiedPendingRows > 0
          ? '{count} document row(s) still need text/search processing before they are fully available in Ask Documents.'
          : 'Some documents are still being prepared for search and Q&A.'
      ),
      impact: copiedPendingHashes && copiedPendingHashes !== copiedPendingRows
        ? 'Ask Documents may not include every file yet. Current health also counts the pending source content as {hashCount} unique file hash(es), because duplicate document rows can share one file.'
        : 'Ask Documents may not include every file yet. You can keep reviewing uploaded files while processing finishes.',
      count: copiedPendingRows,
      countLabel: 'document row(s)',
      hashCount: copiedPendingHashes,
      actionLabel: 'Open Documents',
      to: caseId ? `/evidence/cases/${caseId}/documents` : null,
      secondaryActionLabel: 'See processing status',
      secondaryTo: caseId ? `/evidence/cases/${caseId}/health#search-readiness-resolution` : null,
    });
  }

  if (missingSecureCopies > 0) {
    addIssue(items, {
      id: 'secure-copy-review',
      severity: 'review',
      domains: ['documents', 'sources'],
      pages: ['case-home', 'health', 'documents', 'add-documents'],
      title: 'Secure copy review needed',
      detail: '{count} processed document(s) still need secure workspace copy review.',
      impact: 'Previews, export, and source completeness checks may stay incomplete until secure copies are confirmed.',
      count: missingSecureCopies,
      countLabel: 'files',
      actionLabel: 'Open Documents',
      to: caseId ? `/evidence/cases/${caseId}/documents` : null,
    });
  }

  if (documentsNeedingReview > 0) {
    addIssue(items, {
      id: 'document-review',
      severity: 'review',
      domains: ['documents'],
      pages: ['case-home', 'documents'],
      title: 'Documents need review',
      detail: 'Some documents may be uncategorized or missing source, date, text, or sensitive-information review.',
      impact: 'Labels help organize documents. They do not decide legal importance, completeness, or whether a legal requirement is satisfied.',
      count: documentsNeedingReview,
      countLabel: 'items',
      actionLabel: 'Review documents',
      to: caseId ? `/evidence/cases/${caseId}/documents` : null,
    });
  }

  const storage = health?.storage;
  if (storage && !storage.ok) {
    addIssue(items, {
      id: 'storage-health',
      severity: 'blocking',
      domains: ['system', 'sources'],
      pages: ['case-home', 'health', 'documents', 'add-documents'],
      title: 'Secure file storage needs attention',
      detail: storage.resolution?.user_message || 'We could not reach secure file storage right now.',
      impact: 'Existing records may still show, but new file copies, previews, or exports can pause until storage is healthy.',
      actionLabel: 'Open Health',
      to: caseId ? `/evidence/cases/${caseId}/health` : null,
    });
  }

  const queue = health?.queue || {};
  const queueConfigured = Boolean(queue.rabbitmq?.configured || queue.redis?.configured);
  const queueReady = Boolean(queue.rabbitmq?.ok && queue.redis?.ok);
  if (queueConfigured && !queueReady) {
    addIssue(items, {
      id: 'queue-health',
      severity: 'blocking',
      domains: ['system', 'processing'],
      pages: ['case-home', 'health', 'documents', 'add-documents'],
      title: 'Background processing needs attention',
      detail: queue.rabbitmq?.resolution?.user_message || queue.redis?.resolution?.user_message || 'Background jobs may wait until the queue is healthy.',
      impact: 'Sync, text/search processing, and source checks may pause.',
      actionLabel: 'Open Jobs',
      to: caseId ? `/evidence/cases/${caseId}/jobs` : null,
      secondaryActionLabel: 'Open Health',
      secondaryTo: caseId ? `/evidence/cases/${caseId}/health` : null,
    });
  }

  const graph = health?.graph;
  const vectorCoverage = graph?.chunk_embedding_coverage || {};
  const parentGaps = graph?.child_parent_link_gaps || {};
  const missingEmbeddings = numberValue(vectorCoverage.missing_child_embeddings);
  const missingParentEdges = numberValue(parentGaps.missing_parent_edges);
  if (graph?.configured && !graph.ok) {
    addIssue(items, {
      id: 'relationship-map-health',
      severity: 'review',
      domains: ['people', 'search', 'system'],
      pages: ['case-home', 'health', 'people-contacts'],
      title: 'Relationship map needs support review',
      detail: graph.resolution?.user_message || 'People/contact links and relationship-map features may be incomplete while this check is offline.',
      impact: 'You can keep reviewing documents, but people/contact enrichment may be incomplete.',
      actionLabel: 'Open People & Contacts',
      to: caseId ? `/evidence/cases/${caseId}/entities` : null,
      secondaryActionLabel: 'Open Health',
      secondaryTo: caseId ? `/evidence/cases/${caseId}/health` : null,
    });
  } else if (graph?.ok && (missingEmbeddings > 0 || missingParentEdges > 0)) {
    addIssue(items, {
      id: 'search-index-coverage',
      severity: 'review',
      domains: ['search', 'people'],
      pages: ['case-home', 'health', 'people-contacts', 'ask-documents'],
      title: 'Search index coverage needs review',
      detail: 'Some relationship-map or search records are missing coverage.',
      impact: 'Ask Documents and people/contact context may miss some source material until coverage is refreshed.',
      count: missingEmbeddings + missingParentEdges,
      countLabel: 'gaps',
      actionLabel: 'Open Health',
      to: caseId ? `/evidence/cases/${caseId}/health` : null,
    });
  }

  if (sourceAlignment?.available === false) {
    addIssue(items, {
      id: 'source-check-missing',
      severity: 'review',
      domains: ['sources', 'system'],
      pages: ['case-home', 'health', 'documents', 'add-documents'],
      title: 'Source coverage has not run yet',
      detail: sourceAlignment.reason || 'The app has not published a current source coverage check for this case.',
      impact: 'Source coverage compares connected files with processed records so completeness gaps are visible.',
      actionLabel: 'Open Health',
      to: caseId ? `/evidence/cases/${caseId}/health#source-coverage` : null,
    });
  } else if (sourceAlignment?.available && !sourceAlignment.strict_alignment_ok) {
    const reconciliationClasses = sourceAlignment.reconciliation?.classes || [];
    const actionableClasses = reconciliationClasses.filter((item) => item && !item.ok && numberValue(item.count) > 0);
    if (actionableClasses.length) {
      actionableClasses.forEach((item) => {
        const resolution = item.resolution || {};
        addIssue(items, {
          id: `source-${item.class_id || item.label}`,
          severity: item.severity === 'blocking' ? 'blocking' : 'review',
          domains: ['sources', 'documents', 'search'],
          pages: ['case-home', 'health', 'documents', 'add-documents'],
          title: item.label || 'Source coverage needs review',
          detail: safeSourceCoverageDetail(item, resolution.user_message || item.action),
          impact: 'This affects app completeness checks, not the legal meaning of the documents.',
          count: numberValue(item.count),
          countLabel: 'items',
          actionLabel: 'Open Health',
          to: caseId ? `/evidence/cases/${caseId}/health#source-coverage` : null,
          secondaryActionLabel: 'Open Documents',
          secondaryTo: caseId ? `/evidence/cases/${caseId}/documents` : null,
        });
      });
    } else {
      addIssue(items, {
        id: 'source-alignment-gaps',
        severity: 'review',
        domains: ['sources', 'documents', 'search'],
        pages: ['case-home', 'health', 'documents', 'add-documents'],
        title: 'Source coverage needs review',
        detail: 'Some files do not yet match across connected sources and processed records.',
        impact: 'This affects app completeness checks, not the legal meaning of the documents.',
        actionLabel: 'Open Health',
        to: caseId ? `/evidence/cases/${caseId}/health#source-coverage` : null,
      });
    }
  }

  const google = (connectors || []).find((provider) => provider.provider === 'google_drive');
  const activeGoogleConnection = google?.connections?.find((connection) => connection.status === 'active' && (connection.can_browse || connection.owned_by_current_user));
  if (google && !activeGoogleConnection) {
    addIssue(items, {
      id: 'google-drive-connection',
      severity: 'review',
      domains: ['sources'],
      pages: ['case-home', 'add-documents'],
      title: 'Google Drive connection needs attention',
      detail: 'Connect Google Drive to bring case files into Evidence.',
      impact: 'New Drive documents will not sync until a source is connected.',
      actionLabel: 'Open Add Documents',
      to: caseId ? `/evidence/cases/${caseId}/intake` : null,
    });
  } else if (activeGoogleConnection && !activeGoogleConnection.can_sync_contacts) {
    addIssue(items, {
      id: 'google-contacts-permission',
      severity: 'review',
      domains: ['people', 'sources'],
      pages: ['case-home', 'add-documents', 'people-contacts'],
      title: 'Contacts need permission',
      detail: 'Reconnect Google with contact permission to sync contacts.',
      impact: 'People/contact review may be missing imported phone and email links.',
      actionLabel: 'Open Add Documents',
      to: caseId ? `/evidence/cases/${caseId}/intake#contacts` : null,
      secondaryActionLabel: 'Open People & Contacts',
      secondaryTo: caseId ? `/evidence/cases/${caseId}/entities` : null,
    });
  }

  const peopleCount = numberValue(people?.needsReview)
    || sumCounts(mergedCounts, [
      'people_contacts_needing_review',
      'contact_links_needing_review',
      'unmatched_contact_links',
      'low_confidence_contact_links',
      'duplicate_people',
      'relationship_links_needing_review',
      'needs_review_entities',
      'entity_review_items',
    ]);
  if (peopleCount > 0) {
    addIssue(items, {
      id: 'people-contacts-review',
      severity: 'review',
      domains: ['people'],
      pages: ['case-home', 'people-contacts'],
      title: 'People & contacts need review',
      detail: 'Some phone numbers, emails, possible duplicates, or relationship labels need confirmation.',
      impact: 'Confirm uncertain matches before using communications in summaries or exports.',
      count: peopleCount,
      countLabel: 'items',
      actionLabel: 'Open People & Contacts',
      to: caseId ? `/evidence/cases/${caseId}/entities` : null,
    });
  }

  const pendingInvitations = numberValue(access?.pendingInvitations) || sumCounts(mergedCounts, ['pending_invitations', 'open_invitations', 'invitations_pending']);
  if (pendingInvitations > 0) {
    addIssue(items, {
      id: 'pending-invitations',
      severity: 'review',
      domains: ['access'],
      pages: ['case-home', 'access-sharing'],
      title: 'Invite not completed',
      detail: '{count} invitation(s) have not been accepted yet.',
      impact: 'The invited person may not have workspace access until the invitation is accepted.',
      count: pendingInvitations,
      countLabel: 'pending',
      actionLabel: 'Open Access & Sharing',
      to: caseId ? `/evidence/cases/${caseId}/access` : null,
    });
  }

  const deliveryConfigured = access?.deliveryConfigured;
  if (deliveryConfigured === false) {
    addIssue(items, {
      id: 'email-delivery',
      severity: 'review',
      domains: ['access'],
      pages: ['case-home', 'access-sharing', 'health'],
      title: 'Email delivery needs confirmation',
      detail: 'Invitation email delivery is not fully configured; manual invite link fallback may be needed.',
      impact: 'Invited users may need a copied invite link instead of relying on email delivery.',
      actionLabel: 'Open Access & Sharing',
      to: caseId ? `/evidence/cases/${caseId}/access` : null,
    });
  }

  const failedEmails = numberValue(access?.failedEmails);
  if (failedEmails > 0) {
    addIssue(items, {
      id: 'failed-email-communications',
      severity: 'review',
      domains: ['access'],
      pages: ['case-home', 'access-sharing', 'health'],
      title: 'Invitation email delivery needs review',
      detail: '{count} access email(s) did not complete delivery.',
      impact: 'Use resend or copy the manual invite link so the invited person has a clear next step.',
      count: failedEmails,
      countLabel: 'emails',
      actionLabel: 'Open Access & Sharing',
      to: caseId ? `/evidence/cases/${caseId}/access` : null,
    });
  }

  return items.sort((left, right) => {
    const rank = { blocking: 0, review: 1, info: 2 };
    return (rank[left.severity] ?? 1) - (rank[right.severity] ?? 1);
  });
}
