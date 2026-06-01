export function removalResultTitle(result, t) {
  return t(result?.display_status || 'Removed from workspace');
}

export function removalResultDetail(result, payload, t, documentName = '') {
  const mode = payload?.removal_mode || result?.removal_mode;
  const workspaceCopyDeleted = result?.secure_workspace_copy_deleted === true;
  const workspaceCopyPreserved = result?.secure_workspace_copy_preserved === true;
  const originalPreserved = result?.original_source_preserved !== false && result?.original_source_deleted !== true;
  const nameMessage = documentName ? `${documentName} - ` : '';
  const actionMessage = t('This file was added to the workspace exclusion list. It will no longer appear in workspace document lists, text/search processing, or future source coverage checks.');
  const workspaceMessage = mode === 'delete_workspace_copy' || workspaceCopyDeleted
    ? t('The Evidence AI secure workspace copy was deleted or queued for deletion.')
    : workspaceCopyPreserved
      ? t('The secure workspace copy was kept for audit and support review.')
      : '';
  const originalMessage = originalPreserved
    ? t('The original Google Drive/source file was not deleted.')
    : '';
  const reincludeMessage = t('To use this file again, include it from the source connection before re-importing or processing it.');
  return `${nameMessage}${[actionMessage, workspaceMessage, originalMessage, reincludeMessage].filter(Boolean).join(' ')}`;
}

