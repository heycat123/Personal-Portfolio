import { ApiStatusProvider } from './context/ApiStatusContext';
import { AuthProvider } from './context/AuthContext';
import { CaseProvider } from './context/CaseContext';
import EvidenceRoutes from './evidenceRoutes';

export default function EvidenceApp() {
  return (
    <AuthProvider>
      <ApiStatusProvider>
        <CaseProvider>
          <EvidenceRoutes />
        </CaseProvider>
      </ApiStatusProvider>
    </AuthProvider>
  );
}
