import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation, useOutletContext, useParams } from 'react-router-dom';
import EmptyState from './components/EmptyState';
import ErrorPanel from './components/ErrorPanel';
import PageHeader from './components/PageHeader';
import { useEvidenceAuth } from './context/AuthContext';
import { useCaseContext } from './context/CaseContext';
import { useOperatorMode } from './context/OperatorModeContext';
import EvidenceLayout from './layout/EvidenceLayout';
import DashboardPage from './pages/DashboardPage';
import AccountPage from './pages/AccountPage';
import AccessSharingPage from './pages/AccessSharingPage';
import AdminPage from './pages/AdminPage';
import CaseSelectorPage from './pages/CaseSelectorPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import DocumentsPage from './pages/DocumentsPage';
import EntityDetailPage from './pages/EntityDetailPage';
import EntitiesPage from './pages/EntitiesPage';
import HealthPage from './pages/HealthPage';
import IntakePage from './pages/IntakePage';
import InvitationSplashPage from './pages/InvitationSplashPage';
import InvitationsPage from './pages/InvitationsPage';
import JobDetailPage from './pages/JobDetailPage';
import JobsPage from './pages/JobsPage';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import PlaceholderPage from './pages/PlaceholderPage';
import QueryPage from './pages/QueryPage';
import SettingsPage from './pages/SettingsPage';
import SupportPage from './pages/SupportPage';
import SystemQueryPage from './pages/SystemQueryPage';
import TestsPage from './pages/TestsPage';
import { evidenceApi } from './services/evidenceApi';
import { caseMatchesRouteId, evidenceCasePath, evidenceCaseRelativePath, getCaseRouteId } from './utils/caseRouting';

function EvidenceIndex() {
  const { getAccessToken } = useEvidenceAuth();
  const { registerCases } = useCaseContext();
  const [state, setState] = useState({
    loading: true,
    error: null,
    cases: [],
    pendingInvitations: [],
  });

  const loadCases = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.getCases({ token });
      const cases = result.data?.cases || [];
      const pendingInvitations = result.data?.pending_invitations || [];
      registerCases(cases);
      setState({ loading: false, error: null, cases, pendingInvitations });
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
    return <Navigate to={evidenceCaseRelativePath(state.cases[0], '/dashboard')} replace />;
  }

  if (state.cases.length > 1) {
    return <Navigate to="cases" replace />;
  }

  if (state.pendingInvitations.length > 0) {
    return <Navigate to="invitations" replace />;
  }

  return <Navigate to="onboarding" replace />;
}

function ProtectedEvidenceRoute({ darkTheme, setDarkTheme }) {
  const location = useLocation();
  const { loading, isAuthenticated } = useEvidenceAuth();
  const searchParams = new URLSearchParams(location.search);
  const isInviteOnboardingLink =
    location.pathname.endsWith('/evidence/onboarding') &&
    searchParams.get('intent') === 'join' &&
    Boolean(searchParams.get('invite_code'));

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-6 py-8 text-gray-900 dark:bg-[#0b1117] dark:text-gray-100">
        <PageHeader title="Checking Access" description="Validating the current evidence session." />
      </div>
    );
  }

  if (isInviteOnboardingLink) {
    return <InvitationSplashPage darkTheme={darkTheme} setDarkTheme={setDarkTheme} />;
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
              to="/evidence/invitations"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
            >
              Enter invite code
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

function RestrictedFeaturePage() {
  return (
    <div>
      <PageHeader title="Feature Not Available" description="This page is limited to case administrators and system operators." />
      <EmptyState
        title="Use the case workspace"
        description="You can still search, review documents, add evidence, and use support from the main case navigation."
        action={
          <Link
            to="/evidence/cases"
            className="rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            My cases
          </Link>
        }
      />
    </div>
  );
}

function OperationsRoute({ children }) {
  const { canSeeOperations } = useOperatorMode();
  return canSeeOperations ? children : <RestrictedFeaturePage />;
}

function ContributorRoute({ children }) {
  const { canContribute } = useOperatorMode();
  return canContribute ? children : <RestrictedFeaturePage />;
}

function AdminRoute({ children }) {
  const { canSeeAdmin } = useOperatorMode();
  return canSeeAdmin ? children : <RestrictedFeaturePage />;
}

function AccessManagementRoute({ children }) {
  const { canManageAccess } = useOperatorMode();
  return canManageAccess ? children : <RestrictedFeaturePage />;
}

function CaseScope() {
  const { caseId } = useParams();
  const location = useLocation();
  const layoutContext = useOutletContext() || {};
  const { getAccessToken } = useEvidenceAuth();
  const { cases: knownCases, isKnownCase, registerCases, setActiveCaseId } = useCaseContext();
  const [remoteCheck, setRemoteCheck] = useState({ caseId: null, loading: false, checked: false, found: false });
  const knownCase = knownCases.find((item) => caseMatchesRouteId(item, caseId));
  const canonicalCaseRouteId = getCaseRouteId(knownCase);

  useEffect(() => {
    if (caseId && isKnownCase(caseId)) {
      setActiveCaseId(caseId);
    }
  }, [caseId, isKnownCase, setActiveCaseId]);

  useEffect(() => {
    if (!caseId) {
      return undefined;
    }
    let cancelled = false;
    getAccessToken()
      .then((token) => evidenceApi.getCases({ token }))
      .then((result) => {
        if (cancelled) {
          return;
        }
        const cases = result.data?.cases || [];
        registerCases(cases);
        setRemoteCheck({
          caseId,
          loading: false,
          checked: true,
          found: cases.some((item) => caseMatchesRouteId(item, caseId)),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setRemoteCheck({ caseId, loading: false, checked: true, found: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, getAccessToken, registerCases]);

  if (!caseId) {
    return <UnknownCasePage />;
  }

  if (canonicalCaseRouteId && canonicalCaseRouteId !== caseId) {
    const suffix = location.pathname.replace(/^\/evidence\/cases\/[^/]+/, '');
    return <Navigate to={`${evidenceCasePath(knownCase, suffix)}${location.search}${location.hash}`} replace />;
  }

  const currentRemoteCheck = remoteCheck.caseId === caseId
    ? remoteCheck
    : { loading: true, checked: false, found: false };

  if (!isKnownCase(caseId) && currentRemoteCheck.loading && !currentRemoteCheck.checked) {
    return (
      <div>
        <PageHeader title="Checking Case Access" description="Refreshing the case list for this account." />
        <EmptyState title="Loading case" />
      </div>
    );
  }

  if (!isKnownCase(caseId) && currentRemoteCheck.checked && !currentRemoteCheck.found) {
    return <UnknownCasePage />;
  }

  return <Outlet context={layoutContext} />;
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
      <Route element={<ProtectedEvidenceRoute darkTheme={darkTheme} setDarkTheme={setDarkTheme} />}>
        <Route element={<EvidenceLayout darkTheme={darkTheme} setDarkTheme={setDarkTheme} />}>
          <Route index element={<EvidenceIndex />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="cases" element={<CaseSelectorPage />} />
          <Route path="invitations" element={<InvitationsPage />} />
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="cases/:caseId" element={<CaseScope />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="documents/:fileId" element={<DocumentDetailPage />} />
            <Route path="intake" element={<ContributorRoute><IntakePage /></ContributorRoute>} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="jobs/:jobId" element={<JobDetailPage />} />
            <Route path="query" element={<QueryPage />} />
            <Route
              path="packets"
              element={(
                <PlaceholderPage
                  title="Packets"
                  description="Organize document groups for review or lawyer handoff. This workspace will keep packet labels as organizational aids, not legal filing readiness."
                />
              )}
            />
            <Route path="system-query" element={<OperationsRoute><SystemQueryPage /></OperationsRoute>} />
            <Route path="health" element={<OperationsRoute><HealthPage /></OperationsRoute>} />
            <Route path="entities" element={<EntitiesPage />} />
            <Route path="entities/:personId" element={<EntityDetailPage />} />
            <Route path="access" element={<AccessManagementRoute><AccessSharingPage /></AccessManagementRoute>} />
            <Route path="tests" element={<OperationsRoute><TestsPage /></OperationsRoute>} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
