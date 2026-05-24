import { CheckCircle2, FileUp, UploadCloud } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import StatusBadge from '../components/StatusBadge';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { evidenceApi } from '../services/evidenceApi';

function DetailRow({ label, value }) {
  return (
    <div className="flex flex-col gap-1 border-b border-gray-100 py-2 text-sm last:border-0 dark:border-gray-800 sm:flex-row sm:justify-between">
      <span className="font-medium text-gray-600 dark:text-gray-400">{label}</span>
      <span className="break-all text-gray-950 dark:text-gray-100">{value || 'None'}</span>
    </div>
  );
}

export default function IntakePage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const [file, setFile] = useState(null);
  const [sourceMode, setSourceMode] = useState('web_upload');
  const [state, setState] = useState({
    busy: false,
    error: null,
    step: 'ready',
    presign: null,
    upload: null,
    register: null,
    fingerprints: [],
  });

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

  return (
    <div>
      <PageHeader
        title="Intake"
        description="Register new source files into controlled S3 intake before ingestion, graphing, or vector work begins."
        actions={<StatusBadge status={state.step === 'registered' ? 'succeeded' : state.step === 'failed' ? 'failed' : 'pending'} label={state.step} />}
      />

      {state.error ? <div className="mb-5"><ErrorPanel title="Intake failed" error={state.error} /></div> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-md border border-gray-200 p-2 text-gray-600 dark:border-gray-700 dark:text-gray-300">
              <FileUp size={18} aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">Source File</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Phase 7.5 registers uploads only; ingestion starts in a later job.</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">File</span>
              <input
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gray-800 hover:file:bg-gray-200 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100 dark:file:bg-gray-800 dark:file:text-gray-100"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Source of Truth</span>
              <select
                value={sourceMode}
                onChange={(event) => setSourceMode(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              >
                <option value="web_upload">Web upload</option>
                <option value="google_drive_mirror">Google Drive mirror</option>
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
              {state.busy ? 'Working' : 'Upload and Register'}
            </button>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">Intake Status</h3>
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
                  Open Job
                </Link>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <h3 className="mb-3 text-base font-semibold text-gray-950 dark:text-white">Fingerprints</h3>
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
                <p className="text-sm text-gray-600 dark:text-gray-400">No intake request fingerprint yet.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
