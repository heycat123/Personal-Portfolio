import { CheckCircle2, ChevronRight, FileText, FileUp, Folder, FolderOpen, Link2, MinusCircle, PlusCircle, RefreshCw, Search, Unlink, UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
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
  });

  const activeGoogleConnection = useMemo(() => {
    const google = state.connectors.find((provider) => provider.provider === 'google_drive');
    return google?.connections?.find((connection) => connection.status === 'active') || null;
  }, [state.connectors]);

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

  const disconnectConnection = useCallback(async (sourceConnectionId) => {
    setState((current) => ({ ...current, connectorAction: sourceConnectionId, connectorError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.disconnectSourceConnector(caseId, sourceConnectionId, { token });
      recordFingerprint(result, 'Disconnect source');
      await loadConnectors();
    } catch (error) {
      setState((current) => ({ ...current, connectorAction: null, connectorError: error }));
    } finally {
      setState((current) => ({ ...current, connectorAction: null }));
    }
  }, [caseId, getAccessToken, loadConnectors, recordFingerprint]);

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
      await loadDriveWatchItems(activeGoogleConnection.source_connection_id);
    } catch (error) {
      setDriveBrowser((current) => ({ ...current, error }));
    } finally {
      setDriveBrowser((current) => ({ ...current, action: null }));
    }
  }, [activeGoogleConnection?.source_connection_id, addFingerprint, caseId, getAccessToken, loadDriveWatchItems]);

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
        throw new Error(`S3 upload failed with HTTP ${uploadResponse.status}. Check bucket CORS and presigned URL settings.`);
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
        title="Intake"
        description="Source coverage and ingestion entry points. Source files keep their original language; only the interface translates."
        actions={<StatusBadge status={state.step === 'registered' ? 'succeeded' : state.step === 'failed' ? 'failed' : 'pending'} label={state.step} />}
      />

      {state.error ? <div className="mb-5"><ErrorPanel title="Intake failed" error={state.error} /></div> : null}
      {state.connectorError ? <div className="mb-5"><ErrorPanel title="Source connector failed" error={state.connectorError} /></div> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-md border border-gray-200 p-2 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                  <Link2 size={18} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Source Connectors')}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('Google Drive, OneDrive, and Dropbox source connection status.')}</p>
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
                          {activeConnections.map((connection) => (
                            <div key={connection.source_connection_id} className="flex flex-col gap-2 rounded-md bg-gray-50 p-2 text-sm dark:bg-black/20 sm:flex-row sm:items-center sm:justify-between">
                              <span className="break-all text-gray-700 dark:text-gray-300">
                                {connection.external_account_email || connection.display_name || connection.source_connection_id}
                              </span>
                              <button
                                type="button"
                                onClick={() => disconnectConnection(connection.source_connection_id)}
                                disabled={Boolean(state.connectorAction)}
                                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
                              >
                                <Unlink size={13} aria-hidden="true" />
                                {t('Disconnect')}
                              </button>
                            </div>
                          ))}
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
                    <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Google Drive Selector')}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{activeGoogleConnection.external_account_email || activeGoogleConnection.display_name}</p>
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
                    {t('Resolve')}
                  </button>
                </div>
              </div>

              {driveBrowser.error ? (
                <div className="mb-4">
                  <ErrorPanel title="Google Drive selector failed" error={driveBrowser.error} />
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

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-md border border-gray-200 p-2 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                <FileUp size={18} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Source File')}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('Phase 7.5 registers uploads only; ingestion starts in a later job.')}</p>
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
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Source of Truth')}</span>
                <select
                  value={sourceMode}
                  onChange={(event) => setSourceMode(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                >
                  <option value="web_upload">{t('Web upload')}</option>
                  <option value="google_drive_mirror">{t('Google Drive mirror')}</option>
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
                {state.busy ? t('Working') : t('Upload and Register')}
              </button>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">{t('Intake Status')}</h3>
            <DetailRow label="Step" value={state.step} />
            <DetailRow label="Upload ID" value={upload?.upload_id} />
            <DetailRow label="S3 Key" value={state.presign?.presign?.key} />
            <DetailRow label="Upload" value={state.upload?.ok ? `HTTP ${state.upload.status}` : null} />
            <DetailRow label="Register Job" value={job?.job_id} />
            {job ? (
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

          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
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
          </section>
        </aside>
      </div>
    </div>
  );
}
