import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import EmptyState from './components/EmptyState';
import PageHeader from './components/PageHeader';
import { useCaseContext } from './context/CaseContext';
import EvidenceLayout from './layout/EvidenceLayout';
import DashboardPage from './pages/DashboardPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import DocumentsPage from './pages/DocumentsPage';
import EntitiesPage from './pages/EntitiesPage';
import HealthPage from './pages/HealthPage';
import IntakePage from './pages/IntakePage';
import JobDetailPage from './pages/JobDetailPage';
import JobsPage from './pages/JobsPage';
import QueryPage from './pages/QueryPage';
import SettingsPage from './pages/SettingsPage';
import SystemQueryPage from './pages/SystemQueryPage';
import TestsPage from './pages/TestsPage';

function EvidenceIndex() {
  const { defaultCaseId } = useCaseContext();
  return <Navigate to={`cases/${defaultCaseId}/dashboard`} replace />;
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

export default function EvidenceRoutes() {
  return (
    <Routes>
      <Route element={<EvidenceLayout />}>
        <Route index element={<EvidenceIndex />} />
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
          <Route path="tests" element={<TestsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
