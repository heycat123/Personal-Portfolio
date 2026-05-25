import { ApiStatusProvider } from './context/ApiStatusContext';
import { AuthProvider } from './context/AuthContext';
import { CaseProvider } from './context/CaseContext';
import { LocaleProvider } from './context/LocaleContext';
import EvidenceRoutes from './evidenceRoutes';

export default function EvidenceApp({ darkTheme, setDarkTheme }) {
  return (
    <AuthProvider>
      <LocaleProvider>
        <ApiStatusProvider>
          <CaseProvider>
            <EvidenceRoutes darkTheme={darkTheme} setDarkTheme={setDarkTheme} />
          </CaseProvider>
        </ApiStatusProvider>
      </LocaleProvider>
    </AuthProvider>
  );
}
