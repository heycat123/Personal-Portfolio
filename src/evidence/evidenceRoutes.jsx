import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import EmptyState from './components/EmptyState';
import ErrorPanel from './components/ErrorPanel';
import PageHeader from './components/PageHeader';
import { useEvidenceAuth } from './context/AuthContext';
import { useCaseContext } from './context/CaseContext';
import EvidenceLayout from './layout/EvidenceLayout';
import DashboardPage from './pages/DashboardPage';
import AccountPage from './pages/AccountPage';
import AdminPage from './pages/AdminPage';
import CaseSelectorPage from './pages/CaseSelectorPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import DocumentsPage from './pages/DocumentsPage';
import EntityDetailPage from './pages/EntityDetailPage';
import EntitiesPage from './pages/EntitiesPage';
import HealthPage from './pages/HealthPage';
import IntakePage from './pages/IntakePage';
import JobDetailPage from './pages/JobDetailPage';
import JobsPage from './pages/JobsPage';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import QueryPage from './pages/QueryPage';
import SettingsPage from './pages/SettingsPage';
import SupportPage from './pages/SupportPage';
import SystemQueryPage from './pages/SystemQueryPage';
import TestsPage from './pages/TestsPage';
import { evidenceApi } from './services/evidenceApi';

function EvidenceIndex() {
  const { getAccessToken } = useEvidenceAuth();
  const { registerCases } = useCaseContext();
  const [state, setState] = useState({
    loading: true,
    error: null,
    cases: [],
  });

  const loadCases = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getCases({ token });
      const cases = result.data?.cases || [];
      registerCases(cases);
      setState({ loading: false, error: null, cases });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, [getAccessToken, registerCases]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  if (state.loading) {
    return (
      <div>
        <PageHeader title="Checking Cases" description="Finding the workspaces available to this account." />
        <EmptyState title="Loading cases" description="This only checks access. It does not process documents." />
      </div>
    );
  }

  if (state.error) {
    return (
      <div>
        <PageHeader title="Case Access Check Failed" />
        <ErrorPanel error={state.error} onRetry={loadCases} />
      </div>
    );
  }

  if (state.cases.length === 1) {
    const caseId = state.cases[0].case_id || state.cases[0].caseId;
    return <Navigate to={`cases/${encodeURIComponent(caseId)}/dashboard`} replace />;
  }

  if (state.cases.length > 1) {
    return <Navigate to="cases" replace />;
  }

  return <Navigate to="onboarding" replace />;
}

function ProtectedEvidenceRoute() {
  const location = useLocation();
  const { loading, isAuthenticated } = useEvidenceAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-6 py-8 text-gray-900 dark:bg-[#0b1117] dark:text-gray-100">
        <PageHeader title="Checking Access" description="Validating the current evidence session." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/evidence/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

function UnknownCasePage() {
  const { caseId } = useParams();
  return (
    <div>
      <PageHeader
        title="Restricted Case"
        description={`This account does not have access to ${caseId || 'this case'}.`}
      />
      <EmptyState
        title="Choose a next step"
        description="You can return to your cases, enter onboarding, or prepare a possible future case instead of staying on a dead-end error screen."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              to="/evidence/cases"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              My cases
            </Link>
            <Link
              to="/evidence/onboarding"
              className="rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              Start new workspace
            </Link>
            <Link
              to="/evidence/onboarding?intent=precase"
              className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100 dark:hover:bg-sky-900/40"
            >
              Prepare future case
            </Link>
          </div>
        }
      />
    </div>
  );
}

function CaseScope() {
  const { caseId } = useParams();
  const { isKnownCase, setActiveCaseId } = useCaseContext();

  useEffect(() => {
    if (caseId && isKnownCase(caseId)) {
      setActiveCaseId(caseId);
    }
  }, [caseId, isKnownCase, setActiveCaseId]);

  if (!caseId || !isKnownCase(caseId)) {
    return <UnknownCasePage />;
  }

  return <Outlet />;
}

function NotFoundPage() {
  return (
    <div>
      <PageHeader title="Evidence Route Not Found" />
      <EmptyState title="No matching evidence route" />
    </div>
  );
}

export default function EvidenceRoutes({ darkTheme, setDarkTheme }) {
  return (
    <Routes>
      <Route path="login" element={<LoginPage darkTheme={darkTheme} setDarkTheme={setDarkTheme} />} />
      <Route element={<ProtectedEvidenceRoute />}>
        <Route element={<EvidenceLayout darkTheme={darkTheme} setDarkTheme={setDarkTheme} />}>
          <Route index element={<EvidenceIndex />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="cases" element={<CaseSelectorPage />} />
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="cases/:caseId" element={<CaseScope />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="documents/:fileId" element={<DocumentDetailPage />} />
            <Route path="intake" element={<IntakePage />} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="jobs/:jobId" element={<JobDetailPage />} />
            <Route path="query" element={<QueryPage />} />
            <Route path="system-query" element={<SystemQueryPage />} />
            <Route path="health" element={<HealthPage />} />
            <Route path="entities" element={<EntitiesPage />} />
            <Route path="entities/:personId" element={<EntityDetailPage />} />
            <Route path="tests" element={<TestsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
