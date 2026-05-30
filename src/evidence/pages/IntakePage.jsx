import { CheckCircle2, ChevronRight, ExternalLink, Eye, FileText, FileUp, Folder, FolderOpen, Link2, Lock, MinusCircle, PlusCircle, RefreshCw, Search, Unlink, UploadCloud, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { evidenceApi } from '../services/evidenceApi';

function DetailRow({ label, value }) {
  const { t } = useLocaleSettings();
  return (
    <div className="flex flex-col gap-1 border-b border-gray-100 py-2 text-sm last:border-0 dark:border-gray-800 sm:flex-row sm:justify-between">
      <span className="font-medium text-gray-600 dark:text-gray-400">{t(label)}</span>
      <span className="break-all text-gray-950 dark:text-gray-100">{value || t('None')}</span>
    </div>
  );
}

const GOOGLE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const GOOGLE_WORKSPACE_MIME_TYPES = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
]);

function isGoogleWorkspaceFile(item) {
  return GOOGLE_WORKSPACE_MIME_TYPES.has(item?.mimeType || item?.mime_type);
}

function googleWorkspaceLabel(mimeType) {
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    return 'Google Sheet';
  }
  if (mimeType === 'application/vnd.google-apps.presentation') {
    return 'Google Slides';
  }
  if (mimeType === 'application/vnd.google-apps.drawing') {
    return 'Google Drawing';
  }
  return 'Google Doc';
}

function formatBytes(value) {
  const numeric = Number(value || 0);
  if (!numeric) {
    return 'None';
  }
  if (numeric < 1024) {
    return `${numeric.toLocaleString()} B`;
  }
  if (numeric < 1024 * 1024) {
    return `${(numeric / 1024).toFixed(1)} KB`;
  }
  return `${(numeric / 1024 / 1024).toFixed(1)} MB`;
}

function driveItemPath(pathStack, itemName) {
  const parts = pathStack.map((item) => item.name).filter((name) => name && name !== 'My Drive');
  if (itemName) {
    parts.push(itemName);
  }
  return parts.length ? parts.join('/') : 'My Drive';
}

export default function IntakePage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
  const { canSeeOperations, debugEnabled } = useOperatorMode();
  const showDiagnostics = canSeeOperations || debugEnabled;
  const [file, setFile] = useState(null);
  const [sourceMode, setSourceMode] = useState('web_upload');
  const [state, setState] = useState({
    busy: false,
    error: null,
    step: 'ready',
    presign: null,
    upload: null,
    register: null,
    connectors: [],
    connectorLoading: true,
    connectorAction: null,
    connectorError: null,
    connectorMessage: null,
    fingerprints: [],
  });
  const [driveBrowser, setDriveBrowser] = useState({
    loading: false,
    error: null,
    mode: 'browse',
    folderId: 'root',
    pathStack: [{ id: 'root', name: 'My Drive' }],
    files: [],
    nextPageToken: null,
    watchItems: [],
    watchLoading: false,
    action: null,
    searchText: '',
    lastSearch: '',
    scanJob: null,
  });
  const [driveReview, setDriveReview] = useState({
    loading: false,
    error: null,
    items: [],
    summary: null,
    selected: null,
    previewLoading: false,
    previewUrl: null,
    previewError: null,
  });
  const [contactSync, setContactSync] = useState({
    loading: false,
    error: null,
    action: null,
    summary: null,
    contacts: [],
    total: 0,
    query: '',
    matchedOnly: true,
  });
  const [disconnectDialog, setDisconnectDialog] = useState({
    open: false,
    connection: null,
  });

  const activeGoogleConnection = useMemo(() => {
    const google = state.connectors.find((provider) => provider.provider === 'google_drive');
    return google?.connections?.find((connection) => connection.status === 'active' && (connection.can_browse || connection.owned_by_current_user)) || null;
  }, [state.connectors]);

  useEffect(() => {
    const url = driveReview.previewUrl;
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [driveReview.previewUrl]);

  const addFingerprint = useCallback((result, label) => {
    recordFingerprint(result, label);
    if (!result?.requestFingerprintId) {
      return;
    }
    setState((current) => ({
      ...current,
      fingerprints: [
        { id: result.requestFingerprintId, correlationId: result.correlationId, label },
        ...current.fingerprints,
      ].slice(0, 4),
    }));
  }, [recordFingerprint]);

  const loadConnectors = useCallback(async () => {
    setState((current) => ({ ...current, connectorLoading: true, connectorError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getSourceConnectors(caseId, { token });
      recordFingerprint(result, 'Source connectors');
      setState((current) => ({
        ...current,
        connectorLoading: false,
        connectors: result.data?.providers || [],
      }));
    } catch (error) {
      setState((current) => ({ ...current, connectorLoading: false, connectorError: error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadConnectors();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadConnectors]);

  const connectGoogleDrive = useCallback(async () => {
    setState((current) => ({ ...current, connectorAction: 'google_drive', connectorError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.authorizeGoogleDrive(
        caseId,
        { display_name: 'Google Drive' },
        { token },
      );
      recordFingerprint(result, 'Authorize Google Drive');
      window.location.assign(result.data.auth_url);
    } catch (error) {
      setState((current) => ({ ...current, connectorAction: null, connectorError: error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  const disconnectConnection = useCallback((connection) => {
    setDisconnectDialog({ open: true, connection });
  }, []);

  const closeDisconnectDialog = useCallback(() => {
    setDisconnectDialog({ open: false, connection: null });
  }, []);

  const performDisconnect = useCallback(async (removeImportedFiles = false) => {
    const sourceConnectionId = disconnectDialog.connection?.source_connection_id;
    if (!sourceConnectionId) {
      return;
    }
    setState((current) => ({ ...current, connectorAction: sourceConnectionId, connectorError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.disconnectSourceConnector(
        caseId,
        sourceConnectionId,
        { remove_imported_files: removeImportedFiles },
        { token },
      );
      addFingerprint(result, removeImportedFiles ? 'Request source cleanup' : 'Disconnect source');
      setState((current) => ({
        ...current,
        connectorMessage: result.data?.message || t('Source disconnected.'),
      }));
      closeDisconnectDialog();
      await loadConnectors();
    } catch (error) {
      setState((current) => ({ ...current, connectorAction: null, connectorError: error }));
    } finally {
      setState((current) => ({ ...current, connectorAction: null }));
    }
  }, [addFingerprint, caseId, closeDisconnectDialog, disconnectDialog.connection?.source_connection_id, getAccessToken, loadConnectors, t]);

  const loadDriveWatchItems = useCallback(async (sourceConnectionId = activeGoogleConnection?.source_connection_id) => {
    if (!sourceConnectionId) {
      setDriveBrowser((current) => ({ ...current, watchItems: [], watchLoading: false }));
      return;
    }

    setDriveBrowser((current) => ({ ...current, watchLoading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getSourceWatchItems(caseId, sourceConnectionId, { token });
      recordFingerprint(result, 'Source watch items');
      setDriveBrowser((current) => ({
        ...current,
        watchLoading: false,
        watchItems: result.data?.items || [],
      }));
    } catch (error) {
      setDriveBrowser((current) => ({ ...current, watchLoading: false, error }));
    }
  }, [activeGoogleConnection?.source_connection_id, caseId, getAccessToken, recordFingerprint]);

  const openDriveFolder = useCallback(async (folderId = 'root', folderName = 'My Drive', pathStack = null) => {
    if (!activeGoogleConnection?.source_connection_id) {
      return;
    }

    const nextPathStack = pathStack || [{ id: folderId, name: folderName }];
    setDriveBrowser((current) => ({
      ...current,
      loading: true,
      error: null,
      mode: 'browse',
      folderId,
      pathStack: nextPathStack,
      lastSearch: '',
    }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.browseGoogleDrive(
        caseId,
        activeGoogleConnection.source_connection_id,
        { folder_id: folderId, page_size: 100 },
        { token },
      );
      recordFingerprint(result, 'Browse Google Drive');
      setDriveBrowser((current) => ({
        ...current,
        loading: false,
        files: result.data?.files || [],
        nextPageToken: result.data?.next_page_token || null,
      }));
    } catch (error) {
      setDriveBrowser((current) => ({ ...current, loading: false, error }));
    }
  }, [activeGoogleConnection?.source_connection_id, caseId, getAccessToken, recordFingerprint]);

  const runDriveSearch = useCallback(async () => {
    if (!activeGoogleConnection?.source_connection_id) {
      return;
    }

    const query = driveBrowser.searchText.trim();
    if (!query) {
      await openDriveFolder('root', 'My Drive', [{ id: 'root', name: 'My Drive' }]);
      return;
    }

    setDriveBrowser((current) => ({ ...current, loading: true, error: null, mode: 'search', lastSearch: query }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.searchGoogleDrive(
        caseId,
        activeGoogleConnection.source_connection_id,
        { q: query, page_size: 50 },
        { token },
      );
      recordFingerprint(result, 'Search Google Drive');
      setDriveBrowser((current) => ({
        ...current,
        loading: false,
        files: result.data?.files || [],
        nextPageToken: result.data?.next_page_token || null,
      }));
    } catch (error) {
      setDriveBrowser((current) => ({ ...current, loading: false, error }));
    }
  }, [activeGoogleConnection?.source_connection_id, caseId, driveBrowser.searchText, getAccessToken, openDriveFolder, recordFingerprint]);

  const addDriveWatchItem = useCallback(async (driveItem, selectionMode = 'include') => {
    if (!activeGoogleConnection?.source_connection_id) {
      return;
    }

    const isFolder = driveItem.mimeType === GOOGLE_FOLDER_MIME_TYPE;
    const actionId = `${selectionMode}:${driveItem.id}`;
    setDriveBrowser((current) => ({ ...current, action: actionId, error: null }));
    try {
      const token = await getAccessToken();
      const payload = {
        item_type: isFolder ? 'folder' : 'file',
        external_id: driveItem.id,
        selection_mode: selectionMode,
        display_name: driveItem.name,
        path_hint: driveItemPath(driveBrowser.pathStack, driveItem.name),
        metadata_json: {
          drive_file: driveItem,
          selected_from: driveBrowser.mode,
          parent_folder_id: driveBrowser.folderId,
          path_hint: driveItemPath(driveBrowser.pathStack, driveItem.name),
        },
      };
      const result = await evidenceApi.addSourceWatchItem(caseId, activeGoogleConnection.source_connection_id, payload, { token });
      addFingerprint(result, `${selectionMode === 'exclude' ? 'Exclude' : 'Include'} source`);
      await loadDriveWatchItems(activeGoogleConnection.source_connection_id);
    } catch (error) {
      setDriveBrowser((current) => ({ ...current, error }));
    } finally {
      setDriveBrowser((current) => ({ ...current, action: null }));
    }
  }, [
    activeGoogleConnection?.source_connection_id,
    addFingerprint,
    caseId,
    driveBrowser.folderId,
    driveBrowser.mode,
    driveBrowser.pathStack,
    getAccessToken,
    loadDriveWatchItems,
  ]);

  const deactivateDriveWatchItem = useCallback(async (sourceWatchItemId) => {
    if (!activeGoogleConnection?.source_connection_id) {
      return;
    }

    setDriveBrowser((current) => ({ ...current, action: sourceWatchItemId, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.deactivateSourceWatchItem(
        caseId,
        activeGoogleConnection.source_connection_id,
        sourceWatchItemId,
        { token },
      );
      addFingerprint(result, 'Remove source selection');
      await loadDriveWatchItems(activeGoogleConnection.source_connection_id);
    } catch (error) {
      setDriveBrowser((current) => ({ ...current, error }));
    } finally {
      setDriveBrowser((current) => ({ ...current, action: null }));
    }
  }, [activeGoogleConnection?.source_connection_id, addFingerprint, caseId, getAccessToken, loadDriveWatchItems]);

  const resolveDriveWatchItems = useCallback(async () => {
    if (!activeGoogleConnection?.source_connection_id) {
      return;
    }

    setDriveBrowser((current) => ({ ...current, action: 'resolve-watch-items', error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.resolveGoogleDriveWatchItems(
        caseId,
        activeGoogleConnection.source_connection_id,
        { source_watch_item_ids: [] },
        { token },
      );
      addFingerprint(result, 'Resolve source selections');
      await loadDriveWatchItems(activeGoogleConnection.source_connection_id);
    } catch (error) {
      setDriveBrowser((current) => ({ ...current, error }));
    } finally {
      setDriveBrowser((current) => ({ ...current, action: null }));
    }
  }, [activeGoogleConnection?.source_connection_id, addFingerprint, caseId, getAccessToken, loadDriveWatchItems]);

  const importDriveFile = useCallback(async (driveItem) => {
    if (!activeGoogleConnection?.source_connection_id || driveItem.mimeType === GOOGLE_FOLDER_MIME_TYPE) {
      return;
    }

    setDriveBrowser((current) => ({ ...current, action: `import:${driveItem.id}`, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.importGoogleDriveFile(
        caseId,
        activeGoogleConnection.source_connection_id,
        { drive_file_id: driveItem.id, add_to_watch: true, register: true },
        { token },
      );
      addFingerprint(result, 'Import Google Drive file');
      setState((current) => ({
        ...current,
        step: 'registered',
        presign: { upload: result.data?.upload, presign: { key: result.data?.storage?.key } },
        upload: { ok: Boolean(result.data?.storage?.ok), status: result.status },
        register: result.data?.registration,
      }));
      if (isGoogleWorkspaceFile(driveItem)) {
        setDriveReview((current) => {
          const updatedItems = current.items.map((item) => (
            item.drive_file_id === driveItem.id
              ? {
                ...item,
                already_mirrored: true,
                upload_id: result.data?.upload?.upload_id,
                upload_status: result.data?.upload?.status,
                s3_key: result.data?.storage?.key,
              }
              : item
          ));
          const selected = current.selected?.drive_file_id === driveItem.id
            ? updatedItems.find((item) => item.drive_file_id === driveItem.id) || current.selected
            : current.selected;
          return { ...current, items: updatedItems, selected };
        });
      }
      await loadDriveWatchItems(activeGoogleConnection.source_connection_id);
    } catch (error) {
      setDriveBrowser((current) => ({ ...current, error }));
    } finally {
      setDriveBrowser((current) => ({ ...current, action: null }));
    }
  }, [activeGoogleConnection?.source_connection_id, addFingerprint, caseId, getAccessToken, loadDriveWatchItems]);

  const reviewGoogleWorkspaceFiles = useCallback(async () => {
    if (!activeGoogleConnection?.source_connection_id) {
      return;
    }

    setDriveReview((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.reviewGoogleDriveNativeFiles(
        caseId,
        activeGoogleConnection.source_connection_id,
        { recursive: false, max_files: 250, max_folders: 50 },
        { token },
      );
      addFingerprint(result, 'Review Google native files');
      const items = result.data?.native_files || [];
      setDriveReview((current) => ({
        ...current,
        loading: false,
        items,
        summary: result.data,
        selected: current.selected && items.some((item) => item.drive_file_id === current.selected.drive_file_id)
          ? current.selected
          : items[0] || null,
      }));
    } catch (error) {
      setDriveReview((current) => ({ ...current, loading: false, error }));
    }
  }, [activeGoogleConnection?.source_connection_id, addFingerprint, caseId, getAccessToken]);

  const previewGoogleWorkspaceFile = useCallback(async (reviewItem) => {
    if (!activeGoogleConnection?.source_connection_id || !reviewItem?.drive_file_id) {
      return;
    }

    setDriveReview((current) => ({
      ...current,
      selected: reviewItem,
      previewLoading: true,
      previewError: null,
    }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.previewGoogleDriveFile(
        caseId,
        activeGoogleConnection.source_connection_id,
        reviewItem.drive_file_id,
        { token },
      );
      addFingerprint(result, 'Preview Google native file');
      const nextUrl = URL.createObjectURL(result.blob);
      setDriveReview((current) => ({
        ...current,
        previewLoading: false,
        previewUrl: nextUrl,
      }));
    } catch (error) {
      setDriveReview((current) => ({ ...current, previewLoading: false, previewError: error }));
    }
  }, [activeGoogleConnection?.source_connection_id, addFingerprint, caseId, getAccessToken]);

  const queueDriveScan = useCallback(async () => {
    if (!activeGoogleConnection?.source_connection_id) {
      return;
    }

    setDriveBrowser((current) => ({ ...current, action: 'scan-drive', error: null, scanJob: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.syncGoogleDriveSource(
        caseId,
        activeGoogleConnection.source_connection_id,
        {
          recursive: true,
          import_new: true,
          queue_registration: true,
          include_google_workspace_exports: true,
          max_files: 5000,
          max_folders: 5000,
        },
        { token },
      );
      addFingerprint(result, 'Queue Google Drive sync');
      setDriveBrowser((current) => ({
        ...current,
        scanJob: result.data?.job || result.data,
      }));
    } catch (error) {
      setDriveBrowser((current) => ({ ...current, error }));
    } finally {
      setDriveBrowser((current) => ({ ...current, action: null }));
    }
  }, [activeGoogleConnection?.source_connection_id, addFingerprint, caseId, getAccessToken]);

  const loadGoogleContacts = useCallback(async (options = {}) => {
    if (!activeGoogleConnection?.source_connection_id) {
      return;
    }
    const nextQuery = options.query ?? contactSync.query;
    const nextMatchedOnly = options.matchedOnly ?? contactSync.matchedOnly;
    setContactSync((current) => ({ ...current, loading: true, error: null, query: nextQuery, matchedOnly: nextMatchedOnly }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getGoogleContacts(
        caseId,
        activeGoogleConnection.source_connection_id,
        {
          limit: 200,
          offset: 0,
          q: nextQuery,
          matched_only: nextMatchedOnly,
        },
        { token },
      );
      addFingerprint(result, 'Google contacts');
      setContactSync((current) => ({
        ...current,
        loading: false,
        contacts: result.data?.contacts || [],
        total: result.data?.total || 0,
      }));
    } catch (error) {
      setContactSync((current) => ({ ...current, loading: false, error }));
    }
  }, [
    activeGoogleConnection?.source_connection_id,
    addFingerprint,
    caseId,
    contactSync.matchedOnly,
    contactSync.query,
    getAccessToken,
  ]);

  const syncGoogleContacts = useCallback(async () => {
    if (!activeGoogleConnection?.source_connection_id) {
      return;
    }
    setContactSync((current) => ({ ...current, action: 'sync', error: null, summary: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.syncGoogleContacts(
        caseId,
        activeGoogleConnection.source_connection_id,
        { max_contacts: 5000 },
        { token },
      );
      addFingerprint(result, 'Sync Google contacts');
      setContactSync((current) => ({
        ...current,
        action: null,
        summary: result.data?.summary || result.data,
      }));
      await loadGoogleContacts({});
    } catch (error) {
      setContactSync((current) => ({ ...current, action: null, error }));
    }
  }, [activeGoogleConnection?.source_connection_id, addFingerprint, caseId, getAccessToken, loadGoogleContacts]);

  useEffect(() => {
    if (!activeGoogleConnection?.source_connection_id) {
      setDriveBrowser((current) => ({
        ...current,
        files: [],
        watchItems: [],
        folderId: 'root',
        pathStack: [{ id: 'root', name: 'My Drive' }],
        loading: false,
        watchLoading: false,
      }));
      setDriveReview((current) => ({
        ...current,
        loading: false,
        items: [],
        summary: null,
        selected: null,
        previewLoading: false,
        previewUrl: null,
        previewError: null,
      }));
      setContactSync((current) => ({
        ...current,
        loading: false,
        action: null,
        summary: null,
        contacts: [],
        total: 0,
      }));
      return;
    }

    const timerId = window.setTimeout(() => {
      openDriveFolder('root', 'My Drive', [{ id: 'root', name: 'My Drive' }]);
      loadDriveWatchItems(activeGoogleConnection.source_connection_id);
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [activeGoogleConnection?.source_connection_id, loadDriveWatchItems, openDriveFolder]);

  const runUpload = useCallback(async () => {
    if (!file) {
      setState((current) => ({ ...current, error: new Error('Select a file before starting intake.') }));
      return;
    }

    setState((current) => ({ ...current, busy: true, error: null, step: 'presigning' }));
    try {
      const token = await getAccessToken();
      const presignResult = await evidenceApi.presignDocumentUpload(
        caseId,
        {
          file_name: file.name,
          content_type: file.type || 'application/octet-stream',
          content_length: file.size,
          source_of_truth_mode: sourceMode,
          source_provider: sourceMode === 'google_drive_mirror' ? 'google_drive' : 'web_upload',
        },
        { token },
      );
      addFingerprint(presignResult, 'Presign upload');

      setState((current) => ({
        ...current,
        step: 'uploading',
        presign: presignResult.data,
      }));

      const presign = presignResult.data?.presign;
      const uploadResponse = await fetch(presign.upload_url, {
        method: presign.method || 'PUT',
        headers: presign.headers || { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Cloud upload failed with HTTP ${uploadResponse.status}. Check storage CORS and presigned URL settings.`);
      }

      setState((current) => ({ ...current, step: 'registering', upload: { ok: true, status: uploadResponse.status } }));

      const registerResult = await evidenceApi.registerDocumentUpload(
        caseId,
        { upload_id: presignResult.data.upload.upload_id },
        { token },
      );
      addFingerprint(registerResult, 'Register upload');

      setState((current) => ({
        ...current,
        busy: false,
        step: 'registered',
        register: registerResult.data,
      }));
    } catch (error) {
      setState((current) => ({ ...current, busy: false, error, step: 'failed' }));
    }
  }, [addFingerprint, caseId, file, getAccessToken, sourceMode]);

  const job = state.register?.job;
  const upload = state.presign?.upload;
  const activeWatchItems = driveBrowser.watchItems.filter((item) => item.status === 'active');
  const contactsPermissionMissing = Boolean(activeGoogleConnection && !activeGoogleConnection.can_sync_contacts);
  const sortedDriveItems = [...driveBrowser.files].sort((left, right) => {
    const leftFolder = left.mimeType === GOOGLE_FOLDER_MIME_TYPE ? 0 : 1;
    const rightFolder = right.mimeType === GOOGLE_FOLDER_MIME_TYPE ? 0 : 1;
    if (leftFolder !== rightFolder) {
      return leftFolder - rightFolder;
    }
    return String(left.name || '').localeCompare(String(right.name || ''));
  });

  return (
    <div>
      <PageHeader
        title="Add Documents"
        description="Connect file sources, select folders or files, and upload new documents into this case. Source files keep their original language; only the interface translates."
        actions={state.step !== 'ready' ? <StatusBadge status={state.step === 'registered' ? 'succeeded' : state.step === 'failed' ? 'failed' : 'pending'} label={state.step} /> : null}
      />

      {state.error ? <div className="mb-5"><ErrorPanel title="Intake failed" error={state.error} /></div> : null}
      {state.connectorError ? <div className="mb-5"><ErrorPanel title="Source connector failed" error={state.connectorError} /></div> : null}
      {state.connectorMessage ? (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
          {state.connectorMessage}
        </div>
      ) : null}

      <section className="mb-5 rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t('Document intake flow')}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">
              {t('Pick files from a connected account or upload files from this browser. The system keeps a controlled storage copy before extraction, graphing, vectors, or legal classification run.')}
            </p>
          </div>
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-black/20 dark:text-gray-300">
            {activeGoogleConnection
              ? t('Connected as {email}', { email: activeGoogleConnection.external_account_email || activeGoogleConnection.display_name || 'Google Drive' })
              : t('No connected document account yet')}
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            ['1', 'Choose source', 'Connect Google Drive or select a local file upload.'],
            ['2', 'Select files', 'Include folders/files and exclude anything that should not enter the case.'],
            ['3', 'Sync and process', 'Mirror selected files to controlled storage, then queue extraction and graph/vector work.'],
          ].map(([number, title, detail]) => (
            <div key={number} className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white dark:bg-white dark:text-gray-950">
                  {number}
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-950 dark:text-white">{t(title)}</div>
                  <div className="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-400">{t(detail)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-md border border-gray-200 p-2 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                  <Link2 size={18} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Connected File Accounts')}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('Connect the accounts that contain case documents. Other case members can see that a source exists, but only the connected-account owner can browse and manage its files unless they have owner/admin rights.')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={loadConnectors}
                className="rounded-md border border-gray-300 p-2 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
                title={t('Refresh connectors')}
                aria-label={t('Refresh connectors')}
              >
                <RefreshCw size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3">
              {state.connectors.length ? (
                state.connectors.map((provider) => {
                  const activeConnections = provider.connections?.filter((connection) => connection.status === 'active') || [];
                  const canConnectGoogle = provider.provider === 'google_drive' && provider.configured;
                  return (
                    <div key={provider.provider} className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-semibold text-gray-950 dark:text-white">{provider.label}</h4>
                            <StatusBadge status={provider.status === 'ready' ? 'configured' : provider.status} />
                          </div>
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{provider.notes}</p>
                        </div>
                        <button
                          type="button"
                          onClick={connectGoogleDrive}
                          disabled={!canConnectGoogle || Boolean(state.connectorAction)}
                          className="inline-flex items-center justify-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Link2 size={16} aria-hidden="true" />
                          {state.connectorAction === provider.provider ? t('Opening') : provider.provider === 'google_drive' ? t('Connect') : t('Stub')}
                        </button>
                      </div>

                      {provider.required_config?.length && !provider.configured ? (
                        <div className="mt-3 rounded-md bg-gray-50 p-2 font-mono text-xs text-gray-700 dark:bg-black/20 dark:text-gray-300">
                          {provider.required_config.join(' | ')}
                        </div>
                      ) : null}

                      {activeConnections.length ? (
                        <div className="mt-3 space-y-2">
                          {activeConnections.map((connection) => {
                            const isOwned = Boolean(connection.owned_by_current_user);
                            const canDisconnect = Boolean(connection.can_disconnect);
                            return (
                              <div key={connection.source_connection_id} className="flex flex-col gap-2 rounded-md bg-gray-50 p-2 text-sm dark:bg-black/20 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <div className="break-all text-gray-700 dark:text-gray-300">
                                    {connection.external_account_email || connection.display_name || connection.source_connection_id}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                    <span className="rounded-full border border-gray-300 px-2 py-0.5 dark:border-gray-700">
                                      {isOwned ? t('Your connection') : t('Case connection')}
                                    </span>
                                    {connection.missing_scopes?.length ? (
                                      <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                                        {t('Needs reconnect for new permissions')}
                                      </span>
                                    ) : null}
                                    {!connection.can_browse ? (
                                      <span className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-2 py-0.5 dark:border-gray-700">
                                        <Lock size={11} aria-hidden="true" />
                                        {t('Browsing locked')}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => disconnectConnection(connection)}
                                  disabled={Boolean(state.connectorAction) || !canDisconnect}
                                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
                                  title={canDisconnect ? t('Disconnect source') : t('Only the source owner or case owner/admin can disconnect this source.')}
                                >
                                  <Unlink size={13} aria-hidden="true" />
                                  {canDisconnect ? t('Disconnect') : t('Locked')}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {state.connectorLoading ? t('Loading connectors.') : t('No connectors returned.')}
                </p>
              )}
            </div>
          </section>

          {activeGoogleConnection ? (
            <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-md border border-gray-200 p-2 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                    <FolderOpen size={18} aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Google Drive Documents')}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('Select the Drive folders or files that should be part of this case, then sync them into controlled storage for processing.')}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">{activeGoogleConnection.external_account_email || activeGoogleConnection.display_name}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openDriveFolder('root', 'My Drive', [{ id: 'root', name: 'My Drive' }])}
                    disabled={driveBrowser.loading}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-white/10"
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                    {t('Root')}
                  </button>
                  <button
                    type="button"
                    onClick={resolveDriveWatchItems}
                    disabled={Boolean(driveBrowser.action)}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-white/10"
                  >
                    <CheckCircle2 size={15} aria-hidden="true" />
                    {t('Verify selections')}
                  </button>
                  <button
                    type="button"
                    onClick={queueDriveScan}
                    disabled={Boolean(driveBrowser.action) || !activeWatchItems.length}
                    className="inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <UploadCloud size={15} aria-hidden="true" />
                    {driveBrowser.action === 'scan-drive' ? t('Queueing') : t('Sync selected Drive files')}
                  </button>
                  <button
                    type="button"
                    onClick={reviewGoogleWorkspaceFiles}
                    disabled={driveReview.loading || Boolean(driveBrowser.action) || !activeWatchItems.length}
                    className="inline-flex items-center gap-2 rounded-md border border-violet-300 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-800 dark:text-violet-200 dark:hover:bg-violet-950/40"
                  >
                    <Eye size={15} aria-hidden="true" />
                    {driveReview.loading ? t('Reviewing') : t('Review Google Docs/Sheets')}
                  </button>
                </div>
              </div>

              {driveBrowser.error ? (
                <div className="mb-4">
                  <ErrorPanel title="Google Drive selector failed" error={driveBrowser.error} />
                </div>
              ) : null}
              {driveBrowser.scanJob ? (
                <div className="mb-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
                  <div className="font-semibold">{t('Google Drive sync queued')}</div>
                  <div className="mt-1 break-all">{driveBrowser.scanJob.job_id}</div>
                  <div className="mt-2 text-xs">{t('The worker will copy selected Drive files, including supported Google Docs exports, into controlled storage and queue new files for registration.')}</div>
                </div>
              ) : null}
              {driveReview.error ? (
                <div className="mb-4">
                  <ErrorPanel title="Google Docs review failed" error={driveReview.error} />
                </div>
              ) : null}
              {driveReview.items.length || driveReview.loading ? (
                <div className="mb-5 rounded-md border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900/50 dark:bg-violet-950/20">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-950 dark:text-white">{t('Google Docs and Sheets Review')}</h4>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {driveReview.summary
                          ? t('{count} native file(s); {pending} need import review.', {
                            count: driveReview.summary.total || 0,
                            pending: driveReview.summary.needs_review || 0,
                          })
                          : t('Scanning the selected top-level folders for native Google files.')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={reviewGoogleWorkspaceFiles}
                      disabled={driveReview.loading}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-violet-300 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-800 dark:text-violet-100 dark:hover:bg-violet-950/40"
                    >
                      <RefreshCw size={13} aria-hidden="true" />
                      {t('Refresh review')}
                    </button>
                  </div>
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                    <div className="max-h-[440px] overflow-auto rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-[#0b1117]">
                      {driveReview.loading ? (
                        <div className="p-4 text-sm text-gray-600 dark:text-gray-400">{t('Loading Google Docs review.')}</div>
                      ) : driveReview.items.length ? (
                        driveReview.items.map((item) => {
                          const selected = driveReview.selected?.drive_file_id === item.drive_file_id;
                          return (
                            <button
                              key={item.drive_file_id}
                              type="button"
                              onClick={() => previewGoogleWorkspaceFile(item)}
                              className={`block w-full border-b border-gray-100 p-3 text-left last:border-0 dark:border-gray-800 ${selected ? 'bg-violet-50 dark:bg-violet-950/30' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-gray-950 dark:text-white">{item.name}</div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                    <span>{t(googleWorkspaceLabel(item.mimeType))}</span>
                                    <span>{item.already_mirrored ? t('Already mirrored') : t('Needs review')}</span>
                                  </div>
                                </div>
                                <StatusBadge status={item.already_mirrored ? 'succeeded' : 'pending'} label={item.already_mirrored ? 'cloud copy' : 'review'} />
                              </div>
                              {item.relative_path ? <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{item.relative_path}</div> : null}
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-4 text-sm text-gray-600 dark:text-gray-400">{t('No native Google files returned.')}</div>
                      )}
                    </div>
                    <div className="min-h-[360px] rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-[#0b1117]">
                      {driveReview.selected ? (
                        <div className="flex h-full min-h-[360px] flex-col">
                          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-gray-950 dark:text-white">{driveReview.selected.name}</div>
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {t(googleWorkspaceLabel(driveReview.selected.mimeType))} | {driveReview.selected.export_extension} {t('export')}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {driveReview.selected.webViewLink ? (
                                <a
                                  href={driveReview.selected.webViewLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
                                >
                                  <ExternalLink size={13} aria-hidden="true" />
                                  {t('Open in Drive')}
                                </a>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => previewGoogleWorkspaceFile(driveReview.selected)}
                                disabled={driveReview.previewLoading}
                                className="inline-flex items-center gap-1 rounded-md border border-violet-300 px-2 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-800 dark:text-violet-200 dark:hover:bg-violet-950/40"
                              >
                                <Eye size={13} aria-hidden="true" />
                                {driveReview.previewLoading ? t('Loading') : t('Preview')}
                              </button>
                              <button
                                type="button"
                                onClick={() => importDriveFile({
                                  id: driveReview.selected.drive_file_id,
                                  name: driveReview.selected.name,
                                  mimeType: driveReview.selected.mimeType,
                                })}
                                disabled={Boolean(driveBrowser.action)}
                                className="inline-flex items-center gap-1 rounded-md border border-sky-300 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-950/40"
                              >
                                <UploadCloud size={13} aria-hidden="true" />
                                {t('Import export')}
                              </button>
                            </div>
                          </div>
                          {driveReview.previewError ? (
                            <ErrorPanel title="Preview failed" error={driveReview.previewError} />
                          ) : driveReview.previewUrl ? (
                            <iframe
                              title={driveReview.selected.name}
                              src={driveReview.previewUrl}
                              className="min-h-[420px] flex-1 rounded-md border border-gray-200 bg-white dark:border-gray-800"
                            />
                          ) : (
                            <div className="flex min-h-[300px] flex-1 items-center justify-center rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
                              {t('Select Preview to render the exported PDF before adding it to controlled cloud storage.')}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex min-h-[300px] items-center justify-center text-sm text-gray-600 dark:text-gray-400">
                          {t('Select a Google Doc or Sheet to review.')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              <form
                className="mb-4 flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  runDriveSearch();
                }}
              >
                <label className="min-w-0 flex-1">
                  <span className="sr-only">{t('Search Google Drive')}</span>
                  <input
                    type="search"
                    value={driveBrowser.searchText}
                    onChange={(event) => setDriveBrowser((current) => ({ ...current, searchText: event.target.value }))}
                    placeholder={t('Search Google Drive')}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                  />
                </label>
                <button
                  type="submit"
                  disabled={driveBrowser.loading}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Search size={16} aria-hidden="true" />
                  {t('Search')}
                </button>
              </form>

              <div className="mb-3 flex flex-wrap items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                {driveBrowser.mode === 'search' ? (
                  <span>{t('Search: {query}', { query: driveBrowser.lastSearch })}</span>
                ) : (
                  driveBrowser.pathStack.map((part, index) => (
                    <span key={`${part.id}-${index}`} className="inline-flex items-center gap-1">
                      {index > 0 ? <ChevronRight size={14} aria-hidden="true" /> : null}
                      <button
                        type="button"
                        onClick={() => openDriveFolder(part.id, part.name, driveBrowser.pathStack.slice(0, index + 1))}
                        className="rounded px-1 py-0.5 font-medium text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/10"
                      >
                        {part.name}
                      </button>
                    </span>
                  ))
                )}
              </div>

              <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="overflow-hidden rounded-md border border-gray-200 dark:border-gray-800">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:border-gray-800 dark:bg-black/20 dark:text-gray-400">
                    <span>{t('Drive item')}</span>
                    <span>{t('Actions')}</span>
                  </div>
                  <div className="max-h-[520px] overflow-auto">
                    {driveBrowser.loading ? (
                      <div className="p-4 text-sm text-gray-600 dark:text-gray-400">{t('Loading Drive items.')}</div>
                    ) : sortedDriveItems.length ? (
                      sortedDriveItems.map((driveItem) => {
                        const isFolder = driveItem.mimeType === GOOGLE_FOLDER_MIME_TYPE;
                        const includeSelected = activeWatchItems.some((item) => item.external_id === driveItem.id && item.selection_mode === 'include');
                        const excludeSelected = activeWatchItems.some((item) => item.external_id === driveItem.id && item.selection_mode === 'exclude');
                        return (
                          <div key={driveItem.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-gray-100 px-3 py-3 last:border-0 dark:border-gray-800">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {isFolder ? <Folder size={17} className="shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" /> : <FileText size={17} className="shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isFolder) {
                                      openDriveFolder(
                                        driveItem.id,
                                        driveItem.name,
                                        [...driveBrowser.pathStack, { id: driveItem.id, name: driveItem.name }],
                                      );
                                    }
                                  }}
                                  disabled={!isFolder}
                                  className={`min-w-0 truncate text-left text-sm font-semibold ${isFolder ? 'text-gray-950 hover:text-sky-700 dark:text-white dark:hover:text-sky-300' : 'cursor-default text-gray-950 dark:text-white'}`}
                                >
                                  {driveItem.name}
                                </button>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <span>{isFolder ? t('Folder') : t(formatBytes(driveItem.size))}</span>
                                {driveItem.modifiedTime ? <span>{new Date(driveItem.modifiedTime).toLocaleDateString()}</span> : null}
                              </div>
                            </div>
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => addDriveWatchItem(driveItem, 'include')}
                                disabled={includeSelected || Boolean(driveBrowser.action)}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                              >
                                <PlusCircle size={13} aria-hidden="true" />
                                {t('Include')}
                              </button>
                              <button
                                type="button"
                                onClick={() => addDriveWatchItem(driveItem, 'exclude')}
                                disabled={excludeSelected || Boolean(driveBrowser.action)}
                                className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/40"
                              >
                                <MinusCircle size={13} aria-hidden="true" />
                                {t('Exclude')}
                              </button>
                              {!isFolder ? (
                                <button
                                  type="button"
                                  onClick={() => importDriveFile(driveItem)}
                                  disabled={Boolean(driveBrowser.action)}
                                  className="inline-flex items-center gap-1 rounded-md border border-sky-300 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-950/40"
                                >
                                  <UploadCloud size={13} aria-hidden="true" />
                                  {t('Import')}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-4 text-sm text-gray-600 dark:text-gray-400">{t('No Drive items returned.')}</div>
                    )}
                  </div>
                </div>

                <aside className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-gray-950 dark:text-white">{t('Selected Sources')}</h4>
                    <StatusBadge status="active" label={`${activeWatchItems.length}`} />
                  </div>
                  <div className="max-h-[480px] space-y-2 overflow-auto">
                    {driveBrowser.watchLoading ? (
                      <p className="text-sm text-gray-600 dark:text-gray-400">{t('Loading selections.')}</p>
                    ) : activeWatchItems.length ? (
                      activeWatchItems.map((item) => (
                        <div key={item.source_watch_item_id} className="rounded-md bg-gray-50 p-2 text-sm dark:bg-black/20">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-gray-950 dark:text-white">{item.display_name || item.external_id}</div>
                              <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <StatusBadge status={item.selection_mode === 'exclude' ? 'pending' : 'active'} label={item.selection_mode} />
                                <span>{item.item_type}</span>
                                {item.metadata_json?.resolution_status ? <span>{item.metadata_json.resolution_status}</span> : null}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => deactivateDriveWatchItem(item.source_watch_item_id)}
                              disabled={Boolean(driveBrowser.action)}
                              className="rounded-md border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/10"
                              title={t('Remove source selection')}
                              aria-label={t('Remove source selection')}
                            >
                              <Unlink size={13} aria-hidden="true" />
                            </button>
                          </div>
                          {item.path_hint ? <div className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">{item.path_hint}</div> : null}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-600 dark:text-gray-400">{t('No selected sources.')}</p>
                    )}
                  </div>
                </aside>
              </div>
            </section>
          ) : null}

          <section id="contacts" className="scroll-mt-24 rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-md border border-gray-200 p-2 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                  <Users size={18} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Contact Syncs')}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('Import contact names and phone numbers to help connect communication addresses to real people and entity records.')}</p>
                  {activeGoogleConnection ? (
                    <p className="text-xs text-gray-500 dark:text-gray-500">{activeGoogleConnection.external_account_email || activeGoogleConnection.display_name}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeGoogleConnection && !contactsPermissionMissing ? (
                  <button
                    type="button"
                    onClick={syncGoogleContacts}
                    disabled={Boolean(contactSync.action)}
                    className="inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Users size={15} aria-hidden="true" />
                    {contactSync.action === 'sync' ? t('Syncing contacts') : t('Sync Contacts')}
                  </button>
                ) : activeGoogleConnection ? (
                  <button
                    type="button"
                    onClick={connectGoogleDrive}
                    disabled={Boolean(state.connectorAction)}
                    className="inline-flex items-center gap-2 rounded-md border border-amber-700 bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Link2 size={15} aria-hidden="true" />
                    {state.connectorAction === 'google_drive' ? t('Opening') : t('Reconnect Google')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={connectGoogleDrive}
                    disabled={Boolean(state.connectorAction)}
                    className="inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Link2 size={15} aria-hidden="true" />
                    {t('Connect Google')}
                  </button>
                )}
              </div>
            </div>

            {!activeGoogleConnection ? (
              <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-black/20 dark:text-gray-300">
                {t('Connect your Google account before syncing contacts. Contact sync is separate from document folder selection, and only the connected-account owner can view or manage imported contacts.')}
              </div>
            ) : null}
            {contactsPermissionMissing ? (
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
                <div className="font-semibold">{t('Contacts permission is not granted yet.')}</div>
                <div className="mt-1">{t('Reconnect Google and approve the Contacts permission. Your existing Drive selections stay attached to this connection.')}</div>
              </div>
            ) : null}

            {contactSync.error ? (
              <div className="mb-4">
                <ErrorPanel title="Google contacts failed" error={contactSync.error} />
              </div>
            ) : null}

            {activeGoogleConnection && !contactsPermissionMissing && (contactSync.summary || contactSync.contacts.length || contactSync.loading) ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-950 dark:text-white">{t('Google Contacts Correlation')}</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {contactSync.summary
                        ? t('{contacts} contact row(s); {matched} matched communication address row(s).', {
                          contacts: contactSync.summary.active_contacts || contactSync.summary.inserted_or_updated || 0,
                          matched: contactSync.summary.matched_phone_rows || 0,
                        })
                        : t('Contacts can label phone numbers already found in SMS and WhatsApp evidence.')}
                    </p>
                  </div>
                  <form
                    className="flex flex-col gap-2 sm:flex-row sm:items-center"
                    onSubmit={(event) => {
                      event.preventDefault();
                      loadGoogleContacts({});
                    }}
                  >
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={contactSync.matchedOnly}
                        onChange={(event) => {
                          const matchedOnly = event.target.checked;
                          setContactSync((current) => ({ ...current, matchedOnly }));
                          loadGoogleContacts({ matchedOnly });
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-700"
                      />
                      {t('Matched only')}
                    </label>
                    <input
                      type="search"
                      value={contactSync.query}
                      onChange={(event) => setContactSync((current) => ({ ...current, query: event.target.value }))}
                      placeholder={t('Search contacts')}
                      className="min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 dark:border-gray-700 dark:bg-[#0b1117] dark:text-white dark:focus:ring-emerald-950"
                    />
                    <button
                      type="submit"
                      disabled={contactSync.loading}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-100 dark:hover:bg-emerald-950/40"
                    >
                      <Search size={14} aria-hidden="true" />
                      {contactSync.loading ? t('Loading') : t('View Contacts')}
                    </button>
                  </form>
                </div>
                <div className="max-h-[260px] overflow-auto rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-[#0b1117]">
                  {contactSync.loading ? (
                    <div className="p-4 text-sm text-gray-600 dark:text-gray-400">{t('Loading contact mappings.')}</div>
                  ) : contactSync.contacts.length ? (
                    <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
                      <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-white/5 dark:text-gray-400">
                        <tr>
                          <th className="px-3 py-2 text-left">{t('Contact')}</th>
                          <th className="px-3 py-2 text-left">{t('Phone')}</th>
                          <th className="px-3 py-2 text-left">{t('Email')}</th>
                          <th className="px-3 py-2 text-right">{t('Matched')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {contactSync.contacts.map((contact) => (
                          <tr key={contact.contact_mapping_id}>
                            <td className="max-w-[220px] px-3 py-2">
                              <div className="truncate font-medium text-gray-950 dark:text-white">{contact.display_name || t('Unnamed contact')}</div>
                              <div className="truncate text-xs text-gray-500 dark:text-gray-400">{contact.contact_resource_name}</div>
                            </td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{contact.phone_value || contact.phone_match_key || t('None')}</td>
                            <td className="max-w-[220px] truncate px-3 py-2 text-gray-700 dark:text-gray-300">{contact.email_address || t('None')}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-950 dark:text-white">{contact.matched_address_count || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-4 text-sm text-gray-600 dark:text-gray-400">{t('No contact mappings loaded yet.')}</div>
                  )}
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-md border border-gray-200 p-2 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                <FileUp size={18} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Upload From This Computer')}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('Uploaded files are copied into controlled storage first. Processing can be started after registration.')}</p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('File')}</span>
                <input
                  type="file"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gray-800 hover:file:bg-gray-200 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100 dark:file:bg-gray-800 dark:file:text-gray-100"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Where did this file come from?')}</span>
                <select
                  value={sourceMode}
                  onChange={(event) => setSourceMode(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                >
                  <option value="web_upload">{t('Uploaded from this browser')}</option>
                  <option value="google_drive_mirror">{t('Copied from Google Drive')}</option>
                </select>
              </label>

              {file ? (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-[#0c1218]">
                  <DetailRow label="Name" value={file.name} />
                  <DetailRow label="Type" value={file.type || 'application/octet-stream'} />
                  <DetailRow label="Bytes" value={file.size.toLocaleString()} />
                </div>
              ) : null}

              <button
                type="button"
                onClick={runUpload}
                disabled={!file || state.busy}
                className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <UploadCloud size={16} aria-hidden="true" />
                {state.busy ? t('Working') : t('Upload file')}
              </button>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">{t('Intake Status')}</h3>
            <DetailRow label="Step" value={state.step} />
            <DetailRow label="Upload" value={state.upload?.ok ? t('Uploaded') : null} />
            {showDiagnostics ? <DetailRow label="Upload ID" value={upload?.upload_id} /> : null}
            {showDiagnostics ? <DetailRow label="Cloud Storage Key" value={state.presign?.presign?.key} /> : null}
            {showDiagnostics ? <DetailRow label="Register Job" value={job?.job_id} /> : null}
            {showDiagnostics && job ? (
              <div className="mt-3">
                <Link
                  to={`/evidence/cases/${caseId}/jobs/${job.job_id}`}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-white/10"
                >
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {t('Open Job')}
                </Link>
              </div>
            ) : null}
          </section>

          {debugEnabled ? <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">{t('Fingerprints')}</h3>
            <div className="space-y-2">
              {state.fingerprints.length ? (
                state.fingerprints.map((fingerprint) => (
                  <RequestFingerprint
                    key={`${fingerprint.id}-${fingerprint.label}`}
                    fingerprintId={fingerprint.id}
                    correlationId={fingerprint.correlationId}
                    label={fingerprint.label}
                    compact
                  />
                ))
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('No intake request fingerprint yet.')}</p>
              )}
            </div>
          </section> : null}
        </aside>
      </div>

      {disconnectDialog.open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label={t('Cancel disconnect')}
            onClick={closeDisconnectDialog}
          />
          <div className="relative w-full max-w-lg rounded-lg border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-[#101820]">
            <div className="flex items-start gap-3">
              <div className="rounded-md border border-gray-200 p-2 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                <Unlink size={18} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Disconnect source account')}</h3>
                <p className="mt-1 break-words text-sm text-gray-600 dark:text-gray-400">
                  {disconnectDialog.connection?.external_account_email || disconnectDialog.connection?.display_name || t('Connected account')}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-sm text-gray-700 dark:text-gray-300">
              <p>{t('Choose what should happen to this source connection.')}</p>
              <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                <div className="font-semibold text-gray-950 dark:text-white">{t('Sever connection only')}</div>
                <div className="mt-1">{t('Stops future access to this connected account. Documents already added to the case stay available.')}</div>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
                <div className="font-semibold">{t('Request file cleanup review')}</div>
                <div className="mt-1">{t('Disconnects the account and queues a non-destructive review of files imported from this source. Nothing is deleted until a controlled cleanup is approved and propagated through the system.')}</div>
              </div>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDisconnectDialog}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                onClick={() => performDisconnect(false)}
                disabled={Boolean(state.connectorAction)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
              >
                {t('Sever only')}
              </button>
              <button
                type="button"
                onClick={() => performDisconnect(true)}
                disabled={Boolean(state.connectorAction)}
                className="rounded-md border border-amber-700 bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('Request cleanup')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
