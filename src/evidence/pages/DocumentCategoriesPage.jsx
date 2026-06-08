import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CategoryReviewPanel from '../components/CategoryReviewPanel';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import RequestFingerprint from '../components/RequestFingerprint';
import { useApiStatus } from '../context/ApiStatusContext';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { evidenceApi } from '../services/evidenceApi';

const DEFAULT_CATEGORY_QA_LENS_ID = 'florida_relocation_best_interest';

function categoryReviewFilterValues(category) {
  if (!category) {
    return {};
  }
  if (category.kind === 'document_category') {
    return {
      evidence_type_label: category.label || category.code || category.category_id,
    };
  }
  if (category.code) {
    return {
      legal_factor_code: String(category.code).toLowerCase(),
    };
  }
  return {};
}

function categoryReviewExportQuery(category) {
  const filters = categoryReviewFilterValues(category);
  return {
    ...(filters.evidence_type_label ? { evidence_type: filters.evidence_type_label } : {}),
    ...(filters.legal_factor_code ? { factor_code: filters.legal_factor_code } : {}),
    sort_by: 'updated_at',
    sort_dir: 'desc',
  };
}

function exportToken(value) {
  return String(value || 'documents')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'documents';
}

function exportGuardrailMessage(guardrails, t) {
  const lines = [
    t('Review for sensitive information before sharing or filing. Court rules may require personal information to be removed or limited. Exports should be reviewed by you or your lawyer before use.'),
  ];
  const categories = guardrails?.sensitive_info_warnings || guardrails?.warning_categories || guardrails?.categories || [];
  const documentsWithWarnings = guardrails?.documents_with_warnings ?? guardrails?.sensitive_document_count ?? null;
  if (Number(documentsWithWarnings) > 0) {
    lines.push(t('{count} documents in this export may contain sensitive information.', { count: documentsWithWarnings }));
  }
  if (Array.isArray(categories) && categories.length) {
    const labels = categories
      .map((item) => item?.label || item?.category || item?.value || item)
      .filter(Boolean)
      .slice(0, 6)
      .join(', ');
    if (labels) {
      lines.push(`${t('Sensitive categories to review')}: ${labels}`);
    }
  }
  lines.push(t('Select OK only after you have reviewed who should receive this export.'));
  return lines.join('\n\n');
}

export default function DocumentCategoriesPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
  const { canSeeOperations, debugEnabled } = useOperatorMode();
  const showDiagnostics = canSeeOperations || debugEnabled;
  const [lensId, setLensId] = useState(DEFAULT_CATEGORY_QA_LENS_ID);
  const [categoryQa, setCategoryQa] = useState({
    loading: true,
    error: null,
    data: null,
    fingerprint: null,
  });
  const [categoryResolve, setCategoryResolve] = useState({
    loading: true,
    error: null,
    data: null,
    result: null,
    busyActionId: null,
    fingerprint: null,
  });
  const [exportState, setExportState] = useState({
    busy: false,
    error: null,
    fingerprint: null,
  });

  const loadCategoryQa = useCallback(async () => {
    setCategoryQa((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getCategoryQa(
        caseId,
        {
          lens_id: lensId || DEFAULT_CATEGORY_QA_LENS_ID,
          include_documents: true,
        },
        { token },
      );
      recordFingerprint(result, 'Category review');
      setCategoryQa({
        loading: false,
        error: null,
        data: result.data || null,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      });
    } catch (error) {
      setCategoryQa((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, getAccessToken, lensId, recordFingerprint]);

  const loadCategoryResolvePlan = useCallback(async () => {
    setCategoryResolve((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getCategoryQaResolvePlan(
        caseId,
        { lens_id: lensId || DEFAULT_CATEGORY_QA_LENS_ID },
        { token },
      );
      recordFingerprint(result, 'Category review actions');
      setCategoryResolve((current) => ({
        ...current,
        loading: false,
        error: null,
        data: result.data || null,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
    } catch (error) {
      setCategoryResolve((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, getAccessToken, lensId, recordFingerprint]);

  useEffect(() => {
    loadCategoryQa();
    loadCategoryResolvePlan();
  }, [loadCategoryQa, loadCategoryResolvePlan]);

  const showMatchingDocuments = (category) => {
    const filters = categoryReviewFilterValues(category);
    const params = new URLSearchParams();
    if (filters.evidence_type_label) {
      params.set('evidence_type', filters.evidence_type_label);
    }
    if (filters.legal_factor_code) {
      params.set('factor_code', filters.legal_factor_code);
    }
    navigate(`/evidence/cases/${caseId}/documents${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const filterUncategorizedDocuments = () => {
    navigate(`/evidence/cases/${caseId}/documents?evidence_type=${encodeURIComponent('Uncategorized')}`);
  };

  const exportCategoryReview = useCallback(async (category) => {
    const query = categoryReviewExportQuery(category);
    const name = category?.code || category?.label || category?.category_id || 'category-review';
    setExportState({ busy: true, error: null, fingerprint: null });
    try {
      const token = await getAccessToken();
      let guardrails = null;
      try {
        const guardrailResult = await evidenceApi.getDocumentExportGuardrails(caseId, query, { token });
        recordFingerprint(guardrailResult, 'Document category export guardrails');
        guardrails = guardrailResult.data?.export_guardrails || guardrailResult.data || null;
      } catch (guardrailError) {
        guardrails = guardrailError?.payload?.detail?.export_guardrails || null;
      }
      const confirmed = window.confirm(exportGuardrailMessage(guardrails, t));
      if (!confirmed) {
        setExportState({ busy: false, error: null, fingerprint: null });
        return;
      }
      const result = await evidenceApi.exportDocuments(
        caseId,
        { ...query, acknowledge_sensitive_export: true },
        { token },
      );
      recordFingerprint(result, 'Document category export');
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `evidence-export-${exportToken(`category-review-${name}`)}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 500);
      setExportState({
        busy: false,
        error: null,
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      });
    } catch (error) {
      setExportState({ busy: false, error, fingerprint: null });
    }
  }, [caseId, getAccessToken, recordFingerprint, t]);

  const resolveCategoryReviewAction = useCallback(async (action, extraPayload = {}) => {
    const actionId = action?.action_id || action?.id || action?.status || 'category_review_action';
    setCategoryResolve((current) => ({
      ...current,
      busyActionId: actionId,
      error: null,
      result: null,
    }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.resolveCategoryQaAction(
        caseId,
        {
          action_id: actionId,
          lens_id: lensId || DEFAULT_CATEGORY_QA_LENS_ID,
          category: action?.category || action?.category_id || action?.code || null,
          ...extraPayload,
        },
        { token },
      );
      recordFingerprint(result, 'Category review action');
      setCategoryResolve((current) => ({
        ...current,
        busyActionId: null,
        error: null,
        result: result.data || {},
        fingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
      await Promise.all([loadCategoryQa(), loadCategoryResolvePlan()]);
    } catch (error) {
      setCategoryResolve((current) => ({
        ...current,
        busyActionId: null,
        error,
        result: null,
      }));
    }
  }, [caseId, getAccessToken, lensId, loadCategoryQa, loadCategoryResolvePlan, recordFingerprint]);

  return (
    <div>
      <PageHeader
        title="Document categories"
        description="Review how documents are grouped and what still needs attention."
      />
      {exportState.error ? <div className="mb-5"><ErrorPanel title="Document category export failed" error={exportState.error} /></div> : null}
      <CategoryReviewPanel
        caseId={caseId}
        data={categoryQa.data}
        error={categoryQa.error}
        exportBusy={exportState.busy}
        lensId={lensId}
        loading={categoryQa.loading}
        onLoadResolvePlan={loadCategoryResolvePlan}
        onExportCurrentView={exportCategoryReview}
        onFilterCategory={showMatchingDocuments}
        onFilterUncategorized={filterUncategorizedDocuments}
        onLensChange={(value) => setLensId(value || DEFAULT_CATEGORY_QA_LENS_ID)}
        onRetry={loadCategoryQa}
        onResolveAction={resolveCategoryReviewAction}
        resolveActionBusyId={categoryResolve.busyActionId}
        resolveError={categoryResolve.error}
        resolveLoading={categoryResolve.loading}
        resolvePlan={categoryResolve.data}
        resolveResult={categoryResolve.result}
      />
      {showDiagnostics && categoryQa.fingerprint?.id ? (
        <div className="mb-5">
          <RequestFingerprint fingerprintId={categoryQa.fingerprint.id} correlationId={categoryQa.fingerprint.correlationId} label={t('Category review fingerprint')} />
        </div>
      ) : null}
      {showDiagnostics && exportState.fingerprint?.id ? (
        <div className="mb-5">
          <RequestFingerprint fingerprintId={exportState.fingerprint.id} correlationId={exportState.fingerprint.correlationId} label={t('Export fingerprint')} />
        </div>
      ) : null}
    </div>
  );
}
