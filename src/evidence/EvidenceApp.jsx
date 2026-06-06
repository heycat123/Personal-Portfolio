import { ApiStatusProvider } from './context/ApiStatusContext';
import { AuthProvider } from './context/AuthContext';
import { CaseProvider } from './context/CaseContext';
import { LocaleProvider } from './context/LocaleContext';
import { OperatorModeProvider } from './context/OperatorModeContext';
import EvidenceRoutes from './evidenceRoutes';
import './lakaiTheme.css';

export default function EvidenceApp({ darkTheme, setDarkTheme }) {
  return (
    <AuthProvider>
      <LocaleProvider>
        <ApiStatusProvider>
          <CaseProvider>
            <OperatorModeProvider>
              <EvidenceRoutes darkTheme={darkTheme} setDarkTheme={setDarkTheme} />
            </OperatorModeProvider>
          </CaseProvider>
        </ApiStatusProvider>
      </LocaleProvider>
    </AuthProvider>
  );
}
