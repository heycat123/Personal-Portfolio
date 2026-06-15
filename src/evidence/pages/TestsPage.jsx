import { BarChart3, CheckCircle2, ClipboardCheck, Clock3, Gauge, Play, RefreshCw, Save, TrendingUp } from 'lucide-react';
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
import { formatDateTime, humanizeKey } from '../utils/formatters';

function latestRunSummary(run, t) {
  if (!run) {
    return t('No baseline run has been queued from the web UI yet.');
  }
  const caseCount = run.case_count ?? run.selected_case_ids?.length ?? 0;
  return t('{count} case(s), {status}, {time}', { count: caseCount, status: run.status, time: formatDateTime(run.created_at) });
}

function ReviewBadge({ review }) {
  if (!review) {
    return <StatusBadge status="pending" label="Needs review" />;
  }
  const status = review.decision === 'pass' ? 'succeeded' : review.decision === 'fail' ? 'failed' : 'degraded';
  return <StatusBadge status={status} label={humanizeKey(review.decision)} />;
}

function payloadArray(payload, keys) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function firstMetricValue(item, keys) {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return null;
}

function numberMetric(item, keys) {
  const value = firstMetricValue(item, keys);
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boolMetric(item, keys) {
  const value = firstMetricValue(item, keys);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    return ['true', 'yes', '1', 'pass', 'passed', 'succeeded'].includes(value.toLowerCase());
  }
  return null;
}

function statusTone(value) {
  const normalized = String(value || '').toLowerCase();
  if (['pass', 'passed', 'success', 'succeeded', 'ok'].includes(normalized)) return 'succeeded';
  if (['fail', 'failed', 'error'].includes(normalized)) return 'failed';
  if (normalized.includes('review') || normalized.includes('partial')) return 'degraded';
  return 'pending';
}

function formatMetricNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

function percentile(values, percentileValue) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index];
}

function metricCreatedAt(item) {
  return firstMetricValue(item, ['created_at', 'recorded_at', 'run_created_at', 'completed_at', 'updated_at']);
}

function metricDeploy(item) {
  return firstMetricValue(item, ['deploy_version', 'api_deploy', 'web_deploy', 'deploy', 'backend_deploy']);
}

function metricRunLabel(item) {
  return firstMetricValue(item, ['run_id', 'test_run_id', 'baseline_run_id', 'source_run_id', 'job_id'])
    || metricDeploy(item)
    || metricCreatedAt(item)
    || 'metric-run';
}

function aggregateMetricTrends(metrics) {
  const groups = new Map();
  metrics.forEach((item) => {
    const createdAt = metricCreatedAt(item);
    const groupKey = metricRunLabel(item);
    const group = groups.get(groupKey) || {
      key: groupKey,
      deploy: metricDeploy(item),
      pr: firstMetricValue(item, ['pr_number', 'pull_request', 'pr']),
      wave: firstMetricValue(item, ['wave', 'wave_id', 'upgrade_wave']),
      createdAt,
      items: [],
    };
    if (createdAt && (!group.createdAt || new Date(createdAt) > new Date(group.createdAt))) {
      group.createdAt = createdAt;
    }
    group.items.push(item);
    groups.set(groupKey, group);
  });
  return Array.from(groups.values())
    .map((group) => {
      const latencies = group.items.map((item) => numberMetric(item, ['elapsed_seconds', 'latency_seconds', 'duration_seconds'])).filter((value) => value !== null);
      const passValues = group.items
        .map((item) => boolMetric(item, ['passed', 'pass', 'success']))
        .filter((value) => value !== null);
      const budgetFailures = group.items.filter((item) => boolMetric(item, ['latency_budget_failed', 'latency_failed', 'budget_failed']) === true).length;
      const citations = group.items.map((item) => numberMetric(item, ['citation_count', 'citations_count', 'source_reference_count'])).filter((value) => value !== null);
      const sourceFacts = group.items.map((item) => numberMetric(item, ['source_fact_count', 'fact_count', 'grounded_fact_count'])).filter((value) => value !== null);
      return {
        ...group,
        count: group.items.length,
        avgLatency: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null,
        p95Latency: percentile(latencies, 95),
        maxLatency: latencies.length ? Math.max(...latencies) : null,
        passRate: passValues.length ? (passValues.filter(Boolean).length / passValues.length) * 100 : null,
        budgetFailures,
        avgCitations: citations.length ? citations.reduce((sum, value) => sum + value, 0) / citations.length : null,
        avgSourceFacts: sourceFacts.length ? sourceFacts.reduce((sum, value) => sum + value, 0) / sourceFacts.length : null,
      };
    })
    .sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0));
}

function MetricsCard({ icon: Icon, label, value, detail }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{value}</div>
          {detail ? <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{detail}</p> : null}
        </div>
        {Icon ? <Icon className="text-sky-700 dark:text-sky-300" size={20} aria-hidden="true" /> : null}
      </div>
    </section>
  );
}

function MiniLineChart({ points, valueKey, label, valueSuffix = '' }) {
  const values = points.map((point) => Number(point[valueKey])).filter((value) => Number.isFinite(value));
  if (!values.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-gray-300 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No {label.toLowerCase()} data yet
      </div>
    );
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const width = 360;
  const height = 120;
  const coordinates = points.map((point, index) => {
    const rawValue = Number(point[valueKey]);
    const value = Number.isFinite(rawValue) ? rawValue : min;
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  });
  const latest = values[values.length - 1];
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-gray-800 dark:text-gray-100">{label}</span>
        <span className="text-gray-600 dark:text-gray-400">{formatMetricNumber(latest)}{valueSuffix}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full rounded-md bg-gray-50 p-2 dark:bg-black/20" role="img" aria-label={label}>
        <polyline fill="none" stroke="currentColor" strokeWidth="3" points={coordinates.join(' ')} className="text-sky-700 dark:text-sky-300" />
        {coordinates.map((coordinate, index) => {
          const [x, y] = coordinate.split(',').map(Number);
          return <circle key={`${coordinate}-${index}`} cx={x} cy={y} r="4" className="fill-white stroke-sky-700 dark:stroke-sky-300" strokeWidth="2" />;
        })}
      </svg>
    </div>
  );
}

function MiniBarChart({ points, valueKey, label }) {
  const values = points.map((point) => Number(point[valueKey])).filter((value) => Number.isFinite(value));
  const max = Math.max(...values, 1);
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">{label}</div>
      <div className="flex h-40 items-end gap-2 rounded-md bg-gray-50 p-3 dark:bg-black/20" role="img" aria-label={label}>
        {points.length ? points.map((point) => {
          const value = Number(point[valueKey]) || 0;
          return (
            <div key={point.key} className="flex min-w-8 flex-1 flex-col items-center gap-2">
              <div className="text-xs text-gray-500 dark:text-gray-400">{formatMetricNumber(value, 0)}</div>
              <div
                className="w-full rounded-t bg-amber-500"
                style={{ height: `${Math.max(6, (value / max) * 100)}%` }}
                title={`${point.deploy || point.key}: ${value}`}
              />
            </div>
          );
        }) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            No budget failure data yet
          </div>
        )}
      </div>
    </div>
  );
}

function QueryQualityMetricsPanel({ state, latestMetricRun, metricSummary, metricTrends, loadMetrics, t }) {
  const latestDeploy = latestMetricRun?.deploy_version || latestMetricRun?.api_deploy || metricTrends[metricTrends.length - 1]?.deploy || '—';
  const latestCreatedAt = latestMetricRun?.created_at || latestMetricRun?.completed_at || metricTrends[metricTrends.length - 1]?.createdAt;
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="font-semibold">{t('Query quality scoreboard')}</div>
            <p className="mt-1">
              {t('Track whether pipeline waves improve latency, pass rate, grounding signals, and review load over time.')}
            </p>
          </div>
          <button
            type="button"
            onClick={loadMetrics}
            disabled={state.metricsLoading}
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-800 dark:bg-[#101820] dark:text-sky-100 dark:hover:bg-sky-950/40"
          >
            <RefreshCw size={16} className={state.metricsLoading ? 'animate-spin' : ''} aria-hidden="true" />
            {state.metricsLoading ? t('Refreshing') : t('Refresh metrics')}
          </button>
        </div>
      </section>

      {state.metricsError ? <ErrorPanel title="Query quality metrics failed" error={state.metricsError} onRetry={loadMetrics} /> : null}

      {state.metricsLoading && !state.metricPoints.length ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-lg bg-gray-100 dark:bg-white/10" />
          ))}
        </div>
      ) : null}

      {!state.metricsLoading && !state.metricPoints.length && !state.metricRuns.length && !state.metricsError ? (
        <section className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-[#101820]">
          <BarChart3 className="mx-auto text-gray-400" size={36} aria-hidden="true" />
          <h3 className="mt-3 text-lg font-semibold text-gray-950 dark:text-white">{t('No query quality metrics yet')}</h3>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
            {t('Production golden runs have not generated query quality metrics yet. Run a baseline wave and refresh this tab to see the scoreboard.')}
          </p>
        </section>
      ) : null}

      {state.metricPoints.length || state.metricRuns.length ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <MetricsCard icon={Gauge} label={t('Latest deploy')} value={latestDeploy} detail={latestCreatedAt ? formatDateTime(latestCreatedAt) : t('No run time reported')} />
            <MetricsCard icon={BarChart3} label={t('Metric points')} value={formatMetricNumber(metricSummary.total, 0)} detail={t('{count} recent run(s)', { count: state.metricRuns.length })} />
            <MetricsCard icon={CheckCircle2} label={t('Pass rate')} value={metricSummary.passRate === null ? '—' : `${formatMetricNumber(metricSummary.passRate, 0)}%`} detail={t('Based on reported pass fields')} />
            <MetricsCard icon={Clock3} label={t('Avg / p95 latency')} value={`${formatMetricNumber(metricSummary.avgLatency)}s / ${formatMetricNumber(metricSummary.p95Latency)}s`} detail={t('Elapsed seconds when reported')} />
            <MetricsCard icon={TrendingUp} label={t('Budget failures')} value={formatMetricNumber(metricSummary.latencyBudgetFailures, 0)} detail={t('Latency budget failed')} />
            <MetricsCard icon={ClipboardCheck} label={t('Needs review')} value={formatMetricNumber(metricSummary.reviewRequired, 0)} detail={t('Rows flagged for review')} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <MiniLineChart points={metricTrends} valueKey="avgLatency" label={t('Average latency by run/deploy')} valueSuffix="s" />
            </section>
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <MiniLineChart points={metricTrends} valueKey="passRate" label={t('Pass rate by run/deploy')} valueSuffix="%" />
            </section>
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <MiniBarChart points={metricTrends} valueKey="budgetFailures" label={t('Latency budget failures by run/deploy')} />
            </section>
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <MiniLineChart points={metricTrends} valueKey="avgCitations" label={t('Average citation count by run/deploy')} />
            </section>
          </div>

          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#101820]">
            <div className="border-b border-gray-200 p-4 dark:border-gray-800">
              <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Metric detail')}</h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {t('Use this table to compare a test case across deploys, PRs, and waves.')}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-normal text-gray-500 dark:bg-black/20 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">{t('Test case')}</th>
                    <th className="px-4 py-3">{t('Category')}</th>
                    <th className="px-4 py-3">{t('Deploy')}</th>
                    <th className="px-4 py-3">{t('PR')}</th>
                    <th className="px-4 py-3">{t('Wave')}</th>
                    <th className="px-4 py-3">{t('Passed')}</th>
                    <th className="px-4 py-3">{t('Status')}</th>
                    <th className="px-4 py-3">{t('Elapsed')}</th>
                    <th className="px-4 py-3">{t('Budget')}</th>
                    <th className="px-4 py-3">{t('Citations')}</th>
                    <th className="px-4 py-3">{t('Created')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {state.metricPoints.slice(0, 80).map((item, index) => {
                    const passed = boolMetric(item, ['passed', 'pass', 'success']);
                    const status = firstMetricValue(item, ['status', 'answer_status', 'review_status']) || (passed === null ? 'not reported' : passed ? 'passed' : 'failed');
                    const budgetFailed = boolMetric(item, ['latency_budget_failed', 'latency_failed', 'budget_failed']);
                    return (
                      <tr key={`${firstMetricValue(item, ['metric_id', 'id', 'test_case_id']) || 'metric'}-${index}`} className="align-top">
                        <td className="max-w-sm px-4 py-3 font-semibold text-gray-950 dark:text-white">
                          {firstMetricValue(item, ['test_case_id', 'case_id', 'name']) || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{humanizeKey(firstMetricValue(item, ['category', 'test_category']) || 'uncategorized')}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{metricDeploy(item) || '—'}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{firstMetricValue(item, ['pr_number', 'pull_request', 'pr']) || '—'}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{firstMetricValue(item, ['wave', 'wave_id', 'upgrade_wave']) || '—'}</td>
                        <td className="px-4 py-3"><StatusBadge status={passed ? 'succeeded' : passed === false ? 'failed' : 'pending'} label={passed === null ? t('Unknown') : passed ? t('Passed') : t('Failed')} /></td>
                        <td className="px-4 py-3"><StatusBadge status={statusTone(status)} label={humanizeKey(status)} /></td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{formatMetricNumber(numberMetric(item, ['elapsed_seconds', 'latency_seconds', 'duration_seconds']))}s</td>
                        <td className="px-4 py-3"><StatusBadge status={budgetFailed ? 'failed' : budgetFailed === false ? 'succeeded' : 'pending'} label={budgetFailed === null ? t('Unknown') : budgetFailed ? t('Failed') : t('OK')} /></td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{formatMetricNumber(numberMetric(item, ['citation_count', 'citations_count', 'source_reference_count']), 0)}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{metricCreatedAt(item) ? formatDateTime(metricCreatedAt(item)) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

export default function TestsPage() {
  const { caseId } = useParams();
  const { getAccessToken } = useEvidenceAuth();
  const { recordFingerprint } = useApiStatus();
  const { t } = useLocaleSettings();
  const [activeTab, setActiveTab] = useState('tests');
  const [state, setState] = useState({
    loading: true,
    error: null,
    metricsLoading: false,
    metricsError: null,
    actionError: null,
    cases: [],
    runs: [],
    metricRuns: [],
    metricPoints: [],
    reviewSummary: {},
    selectedCaseIds: new Set(),
    reviewForms: {},
    queueing: false,
    savingCaseId: null,
    runPaid: false,
    agenticLlmGrader: false,
    fingerprint: null,
    actionFingerprint: null,
  });

  const loadTests = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getBaselineTests(caseId, { token });
      recordFingerprint(result, 'Baseline tests');
      const cases = result.data?.cases || [];
      setState((current) => {
        const nextForms = { ...current.reviewForms };
        cases.forEach((item) => {
          if (!nextForms[item.id]) {
            nextForms[item.id] = {
              decision: item.latest_review?.decision || 'pass',
              system_answer: item.latest_review?.system_answer || '',
              reviewer_note: item.latest_review?.reviewer_note || '',
            };
          }
        });
        return {
          ...current,
          loading: false,
          error: null,
          cases,
          runs: result.data?.runs || [],
          reviewSummary: result.data?.review_summary || {},
          reviewForms: nextForms,
          fingerprint: {
            id: result.requestFingerprintId,
            correlationId: result.correlationId,
          },
        };
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadTests();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [loadTests]);

  const loadMetrics = useCallback(async () => {
    setState((current) => ({ ...current, metricsLoading: true, metricsError: null }));
    try {
      const token = await getAccessToken();
      const [runsResult, metricsResult] = await Promise.all([
        evidenceApi.getQueryQualityMetricRuns(caseId, { limit: 20, offset: 0 }, { token }),
        evidenceApi.getQueryQualityMetrics(caseId, { limit: 200, offset: 0, include_raw: false }, { token }),
      ]);
      recordFingerprint(runsResult, 'Query quality metric runs');
      recordFingerprint(metricsResult, 'Query quality metrics');
      setState((current) => ({
        ...current,
        metricsLoading: false,
        metricsError: null,
        metricRuns: payloadArray(runsResult.data, ['runs', 'items', 'metric_runs', 'query_quality_runs', 'results']),
        metricPoints: payloadArray(metricsResult.data, ['metrics', 'items', 'points', 'metric_points', 'records', 'results', 'rows']),
        fingerprint: {
          id: metricsResult.requestFingerprintId || current.fingerprint?.id,
          correlationId: metricsResult.correlationId || current.fingerprint?.correlationId,
        },
      }));
    } catch (error) {
      setState((current) => ({ ...current, metricsLoading: false, metricsError: error }));
    }
  }, [caseId, getAccessToken, recordFingerprint]);

  useEffect(() => {
    if (activeTab === 'metrics' && !state.metricsLoading && !state.metricPoints.length && !state.metricRuns.length) {
      loadMetrics();
    }
  }, [activeTab, loadMetrics, state.metricPoints.length, state.metricRuns.length, state.metricsLoading]);

  const latestRun = state.runs[0] || null;
  const latestMetricRun = state.metricRuns[0] || null;
  const selectedCount = state.selectedCaseIds.size;
  const reviewedCount = useMemo(
    () => state.cases.filter((item) => item.latest_review).length,
    [state.cases],
  );
  const metricTrends = useMemo(() => aggregateMetricTrends(state.metricPoints), [state.metricPoints]);
  const metricSummary = useMemo(() => {
    const latencies = state.metricPoints.map((item) => numberMetric(item, ['elapsed_seconds', 'latency_seconds', 'duration_seconds'])).filter((value) => value !== null);
    const passValues = state.metricPoints.map((item) => boolMetric(item, ['passed', 'pass', 'success'])).filter((value) => value !== null);
    const latencyBudgetFailures = state.metricPoints.filter((item) => boolMetric(item, ['latency_budget_failed', 'latency_failed', 'budget_failed']) === true).length;
    const reviewRequired = state.metricPoints.filter((item) => {
      const status = String(firstMetricValue(item, ['status', 'answer_status', 'review_status']) || '').toLowerCase();
      return boolMetric(item, ['review_required', 'needs_review']) === true || status.includes('review') || status.includes('insufficient');
    }).length;
    return {
      total: state.metricPoints.length,
      passRate: passValues.length ? (passValues.filter(Boolean).length / passValues.length) * 100 : null,
      avgLatency: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null,
      p95Latency: percentile(latencies, 95),
      latencyBudgetFailures,
      reviewRequired,
    };
  }, [state.metricPoints]);

  const toggleCase = useCallback((testCaseId) => {
    setState((current) => {
      const selectedCaseIds = new Set(current.selectedCaseIds);
      if (selectedCaseIds.has(testCaseId)) {
        selectedCaseIds.delete(testCaseId);
      } else {
        selectedCaseIds.add(testCaseId);
      }
      return { ...current, selectedCaseIds };
    });
  }, []);

  const updateReviewForm = useCallback((testCaseId, patch) => {
    setState((current) => ({
      ...current,
      reviewForms: {
        ...current.reviewForms,
        [testCaseId]: {
          ...(current.reviewForms[testCaseId] || { decision: 'pass', system_answer: '', reviewer_note: '' }),
          ...patch,
        },
      },
    }));
  }, []);

  const queueRun = useCallback(async (caseIds) => {
    setState((current) => ({ ...current, queueing: true, actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.queueBaselineTestRun(
        caseId,
        {
          case_ids: caseIds,
          run_paid: state.runPaid,
          agentic_llm_grader: state.agenticLlmGrader,
        },
        { token },
      );
      recordFingerprint(result, 'Queue baseline test run');
      setState((current) => ({
        ...current,
        queueing: false,
        actionFingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
      await loadTests();
    } catch (error) {
      setState((current) => ({ ...current, queueing: false, actionError: error }));
    }
  }, [caseId, getAccessToken, loadTests, recordFingerprint, state.agenticLlmGrader, state.runPaid]);

  const saveReview = useCallback(async (testCase) => {
    const form = state.reviewForms[testCase.id] || {};
    setState((current) => ({ ...current, savingCaseId: testCase.id, actionError: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.createBaselineTestReview(
        caseId,
        {
          test_case_id: testCase.id,
          decision: form.decision || 'pass',
          system_answer: form.system_answer || '',
          confirmed_answer: testCase.expected_answer || '',
          reviewer_note: form.reviewer_note || '',
          verified_facts_json: [],
          failures_json: form.decision === 'fail' && form.reviewer_note ? [form.reviewer_note] : [],
          cost_json: {},
        },
        { token },
      );
      recordFingerprint(result, 'Save baseline review');
      setState((current) => ({
        ...current,
        savingCaseId: null,
        actionFingerprint: {
          id: result.requestFingerprintId,
          correlationId: result.correlationId,
        },
      }));
      await loadTests();
    } catch (error) {
      setState((current) => ({ ...current, savingCaseId: null, actionError: error }));
    }
  }, [caseId, getAccessToken, loadTests, recordFingerprint, state.reviewForms]);

  return (
    <div>
      <PageHeader
        title="Tests"
        description={activeTab === 'metrics'
          ? t('{count} query quality metric point(s). Latest deploy: {deploy}.', {
            count: metricSummary.total,
            deploy: latestMetricRun?.deploy_version || metricTrends[metricTrends.length - 1]?.deploy || t('not reported'),
          })
          : t('{count} baseline case(s), {reviewed} reviewed. {summary}', {
            count: state.cases.length,
            reviewed: reviewedCount,
            summary: latestRunSummary(latestRun, t),
          })}
        actions={
          <>
            <button
              type="button"
              onClick={activeTab === 'metrics' ? loadMetrics : loadTests}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              <RefreshCw size={16} className={state.metricsLoading && activeTab === 'metrics' ? 'animate-spin' : ''} aria-hidden="true" />
              {t('Refresh')}
            </button>
            {activeTab === 'tests' ? (
              <>
                <button
                  type="button"
                  onClick={() => queueRun([])}
                  disabled={state.queueing || !state.cases.length}
                  className="inline-flex items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Play size={16} aria-hidden="true" />
                  {state.queueing ? t('Queueing') : t('Queue baseline')}
                </button>
                <button
                  type="button"
                  onClick={() => queueRun([...state.selectedCaseIds])}
                  disabled={state.queueing || selectedCount === 0}
                  className="inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Play size={16} aria-hidden="true" />
                  {t('Queue selected ({count})', { count: selectedCount })}
                </button>
              </>
            ) : null}
          </>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel error={state.error} onRetry={loadTests} /></div> : null}
      {state.actionError ? <div className="mb-5"><ErrorPanel title="Test action failed" error={state.actionError} /></div> : null}

      <div className="mb-5 flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800">
        {[
          ['tests', 'Tests'],
          ['metrics', 'Metrics'],
        ].map(([key, label]) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
                active
                  ? 'border-sky-700 text-sky-800 dark:border-sky-300 dark:text-sky-100'
                  : 'border-transparent text-gray-600 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              {t(label)}
            </button>
          );
        })}
      </div>

      {activeTab === 'metrics' ? (
        <QueryQualityMetricsPanel
          state={state}
          latestMetricRun={latestMetricRun}
          metricSummary={metricSummary}
          metricTrends={metricTrends}
          loadMetrics={loadMetrics}
          t={t}
        />
      ) : (
      <>
      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status="configured" label={t('Baseline suite')} />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {t('Reviews stored here are human audit records. The cloud worker currently queues the request; paid execution remains a controlled runtime task.')}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {state.fingerprint?.id ? (
              <RequestFingerprint fingerprintId={state.fingerprint.id} correlationId={state.fingerprint.correlationId} label="List fingerprint" />
            ) : null}
            {state.actionFingerprint?.id ? (
              <RequestFingerprint fingerprintId={state.actionFingerprint.id} correlationId={state.actionFingerprint.correlationId} label="Action fingerprint" />
            ) : null}
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t('Run Options')}</h3>
          <label className="mt-3 flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={state.runPaid}
              onChange={(event) => setState((current) => ({ ...current, runPaid: event.target.checked }))}
              className="mt-1"
            />
            {t('Mark the request as a paid baseline run.')}
          </label>
          <label className="mt-3 flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={state.agenticLlmGrader}
              onChange={(event) => setState((current) => ({ ...current, agenticLlmGrader: event.target.checked }))}
              className="mt-1"
            />
            {t('Request LLM answer-equivalence grading.')}
          </label>
          {latestRun ? (
            <div className="mt-4 rounded-md bg-gray-50 p-3 text-sm dark:bg-black/20">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{t('Latest run')}</span>
                <StatusBadge status={latestRun.status} />
              </div>
              <div className="mt-2 text-gray-600 dark:text-gray-400">
                {t('Estimated')}: ${Number(latestRun.estimated_cost_json?.estimated_paid_quality_usd || 0).toFixed(4)}
              </div>
              {latestRun.source_job_id ? (
                <Link
                  to={`/evidence/cases/${caseId}/jobs/${latestRun.source_job_id}`}
                  className="mt-2 inline-block text-sm font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100"
                >
                  {t('Open job')}
                </Link>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <div className="space-y-4">
        {state.cases.map((testCase) => {
          const form = state.reviewForms[testCase.id] || { decision: 'pass', system_answer: '', reviewer_note: '' };
          const latestReview = testCase.latest_review;
          const isSelected = state.selectedCaseIds.has(testCase.id);
          return (
            <section key={testCase.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCase(testCase.id)}
                      aria-label={`Select ${testCase.id}`}
                    />
                    <StatusBadge status={testCase.priority === 'high' ? 'degraded' : 'unknown'} label={testCase.priority || 'priority'} />
                    <StatusBadge status="configured" label={humanizeKey(testCase.category || 'case')} />
                    <ReviewBadge review={latestReview} />
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-gray-950 dark:text-white">{testCase.question}</h3>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{testCase.id}</div>
                </div>
                <button
                  type="button"
                  onClick={() => queueRun([testCase.id])}
                  disabled={state.queueing}
                  className="inline-flex shrink-0 items-center gap-2 rounded-md border border-sky-300 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-950/40"
                >
                  <Play size={16} aria-hidden="true" />
                  Queue this case
                </button>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className="space-y-4">
                  <div>
                  <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Confirmed answer')}</div>
                    <div className="mt-1 rounded-md bg-gray-50 p-3 text-sm text-gray-800 dark:bg-black/20 dark:text-gray-200">
                      {testCase.expected_answer || t('No confirmed answer stored; validate using required text and citations.')}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Required text')}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(testCase.must_contain || []).map((item) => (
                        <span key={item} className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                          {item}
                        </span>
                      ))}
                      {!(testCase.must_contain || []).length ? <span className="text-sm text-gray-500">{t('None')}</span> : null}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Required sources')}</div>
                    <ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300">
                      {(testCase.must_include_sources || []).map((source) => (
                        <li key={source} className="flex gap-2">
                          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                          <span>{source}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('System answer for review')}</span>
                    <textarea
                      value={form.system_answer}
                      onChange={(event) => updateReviewForm(testCase.id, { system_answer: event.target.value })}
                      rows={7}
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                      placeholder={t('Paste the system answer here when reviewing a run.')}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Decision')}</span>
                      <select
                        value={form.decision}
                        onChange={(event) => updateReviewForm(testCase.id, { decision: event.target.value })}
                        className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                      >
                        <option value="pass">{t('Pass')}</option>
                        <option value="fail">{t('Fail')}</option>
                        <option value="needs_work">{t('Needs work')}</option>
                        <option value="skip">{t('Skip')}</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{t('Review note')}</span>
                      <input
                        value={form.reviewer_note}
                        onChange={(event) => updateReviewForm(testCase.id, { reviewer_note: event.target.value })}
                        className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
                        placeholder={t('Why it passed or failed')}
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => saveReview(testCase)}
                      disabled={state.savingCaseId === testCase.id}
                      className="inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save size={16} aria-hidden="true" />
                      {state.savingCaseId === testCase.id ? t('Saving') : t('Save review')}
                    </button>
                    {latestReview ? (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <ClipboardCheck size={16} aria-hidden="true" />
                        {t('Last reviewed {time}', { time: formatDateTime(latestReview.created_at) })}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}
