import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import EmptyState from './components/EmptyState';
import PageHeader from './components/PageHeader';
import { useEvidenceAuth } from './context/AuthContext';
import { useCaseContext } from './context/CaseContext';
import EvidenceLayout from './layout/EvidenceLayout';
import DashboardPage from './pages/DashboardPage';
import AccountPage from './pages/AccountPage';
import AdminPage from './pages/AdminPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import DocumentsPage from './pages/DocumentsPage';
import EntityDetailPage from './pages/EntityDetailPage';
import EntitiesPage from './pages/EntitiesPage';
import HealthPage from './pages/HealthPage';
import IntakePage from './pages/IntakePage';
import JobDetailPage from './pages/JobDetailPage';
import JobsPage from './pages/JobsPage';
import LoginPage from './pages/LoginPage';
import QueryPage from './pages/QueryPage';
import SettingsPage from './pages/SettingsPage';
import SystemQueryPage from './pages/SystemQueryPage';
import TestsPage from './pages/TestsPage';

function EvidenceIndex() {
  const { defaultCaseId } = useCaseContext();
  return <Navigate to={`cases/${defaultCaseId}/dashboard`} replace />;
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
      <PageHeader title="Case Not Available" description={caseId} />
      <EmptyState title="Case not found" description="The current Phase 7 build exposes one MVP case." />
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
            <Route path="admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
