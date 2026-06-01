export function chooseDocumentRemovalPayload(t, { defaultReason = 'File does not belong in this case.' } = {}) {
  const reason = window.prompt(t('Why should this file be removed from this workspace?'));
  if (reason === null) {
    return null;
  }
  const deleteWorkspaceCopy = window.confirm(
    t('Choose removal type. Press OK to delete the secure workspace copy from cloud storage. Press Cancel to only remove it from workspace processing and search readiness. The original source file is not deleted.'),
  );
  if (deleteWorkspaceCopy) {
    const confirmation = window.prompt(t('Type DELETE to confirm deleting the secure workspace copy. The original source file will not be deleted.'));
    if (confirmation !== 'DELETE') {
      return null;
    }
  }
  return {
    reason: reason.trim() || defaultReason,
    removal_mode: deleteWorkspaceCopy ? 'delete_workspace_copy' : 'soft_exclude',
    confirm_delete_workspace_copy: deleteWorkspaceCopy,
  };
}

export function removalResultTitle(result, t) {
  return t(result?.display_status || 'Removed from workspace');
}

