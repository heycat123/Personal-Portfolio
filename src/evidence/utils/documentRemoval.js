export function removalResultTitle(result, t) {
  return t(result?.display_status || 'Removed from workspace');
}

export function removalResultDetail(result, payload, t) {
  const mode = payload?.removal_mode || result?.removal_mode;
  const displayMessage = result?.display_message ? t(result.display_message) : '';
  const workspaceCopyDeleted = result?.secure_workspace_copy_deleted === true;
  const workspaceCopyPreserved = result?.secure_workspace_copy_preserved === true;
  const originalPreserved = result?.original_source_preserved !== false && result?.original_source_deleted !== true;
  const actionMessage = mode === 'delete_workspace_copy' || workspaceCopyDeleted
    ? t('This file was removed from workspace processing, search readiness, and source coverage. The Evidence AI secure workspace copy was deleted or queued for deletion.')
    : workspaceCopyPreserved
      ? t('This file was removed from workspace processing, search readiness, and source coverage. The secure workspace copy was kept for audit and support review.')
      : t('This file was removed from workspace processing, search readiness, and source coverage.');
  const originalMessage = originalPreserved
    ? t('The original source file was not deleted.')
    : '';
  const resolutionMessage = result?.resolution?.user_message ? t(result.resolution.user_message) : '';
  return [displayMessage, actionMessage, originalMessage, resolutionMessage].filter(Boolean).join(' ');
}

