/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  confirmSignUpWithCognito,
  confirmCognitoNewPassword,
  configureAmplifyAuth,
  getCognitoAccessToken,
  getCognitoUser,
  resendCognitoSignUpCode,
  signInWithCognito,
  signOutOfCognito,
  signUpWithCognito,
} from '../auth/amplifyAuth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState(() => ({
    loading: true,
    authMode: 'initializing',
    isConfigured: false,
    isAuthenticated: false,
    user: null,
    error: null,
    config: null,
  }));

  const refreshUser = useCallback(async () => {
    const requestedMode = import.meta.env.VITE_EVIDENCE_AUTH_MODE || (import.meta.env.DEV ? 'local' : 'cognito');
    const config = configureAmplifyAuth();

    if (requestedMode === 'local') {
      setState({
        loading: false,
        authMode: 'phase7-local',
        isConfigured: true,
        isAuthenticated: true,
        user: {
          displayName: 'Evidence Operator',
          email: null,
          userId: 'local-evidence-operator',
        },
        error: null,
        config,
      });
      return;
    }

    if (!config.configured) {
      setState({
        loading: false,
        authMode: 'cognito',
        isConfigured: false,
        isAuthenticated: false,
        user: null,
        error: new Error('Cognito is not configured. Set VITE_AWS_REGION, VITE_COGNITO_USER_POOL_ID, and VITE_COGNITO_USER_POOL_CLIENT_ID.'),
        config,
      });
      return;
    }

    try {
      const cognitoUser = await getCognitoUser();
      setState({
        loading: false,
        authMode: 'cognito',
        isConfigured: true,
        isAuthenticated: true,
        user: {
          displayName: cognitoUser.signInDetails?.loginId || cognitoUser.username || 'Evidence User',
          email: cognitoUser.signInDetails?.loginId || null,
          userId: cognitoUser.userId || cognitoUser.username,
        },
        error: null,
        config,
      });
    } catch {
      setState({
        loading: false,
        authMode: 'cognito',
        isConfigured: true,
        isAuthenticated: false,
        user: null,
        error: null,
        config,
      });
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const signIn = useCallback(async ({ username, email, password }) => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await signInWithCognito({ username, email, password });
      if (result?.nextStep?.signInStep && result.nextStep.signInStep !== 'DONE') {
        setState((current) => ({
          ...current,
          loading: false,
          error: null,
        }));
        return result;
      }
      await refreshUser();
      return result;
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
      throw error;
    }
  }, [refreshUser]);

  const signUp = useCallback(async ({
    username,
    email,
    password,
    firstName,
    familyName,
    displayName,
    phoneNumber,
    address,
    birthdate,
    gender,
    locale,
    timeZone,
  }) => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await signUpWithCognito({
        username,
        email,
        password,
        firstName,
        familyName,
        displayName,
        phoneNumber,
        address,
        birthdate,
        gender,
        locale,
        timeZone,
      });
      setState((current) => ({ ...current, loading: false, error: null }));
      return result;
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
      throw error;
    }
  }, []);

  const confirmSignUp = useCallback(async ({ username, email, confirmationCode }) => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await confirmSignUpWithCognito({ username, email, confirmationCode });
      setState((current) => ({ ...current, loading: false, error: null }));
      return result;
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
      throw error;
    }
  }, []);

  const resendSignUpCode = useCallback(async ({ username, email }) => {
    try {
      return resendCognitoSignUpCode({ username, email });
    } catch (error) {
      setState((current) => ({ ...current, error }));
      throw error;
    }
  }, []);

  const confirmNewPassword = useCallback(async ({ newPassword }) => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await confirmCognitoNewPassword({ newPassword });
      if (result?.nextStep?.signInStep && result.nextStep.signInStep !== 'DONE') {
        setState((current) => ({
          ...current,
          loading: false,
          error: new Error(`Additional sign-in step required: ${result.nextStep.signInStep}`),
        }));
        return result;
      }
      await refreshUser();
      return result;
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
      throw error;
    }
  }, [refreshUser]);

  const signOut = useCallback(async () => {
    if (state.authMode === 'cognito' && state.isConfigured) {
      await signOutOfCognito();
    }
    await refreshUser();
  }, [refreshUser, state.authMode, state.isConfigured]);

  const getAccessToken = useCallback(async () => {
    if (state.authMode !== 'cognito' || !state.isConfigured || !state.isAuthenticated) {
      return null;
    }
    return getCognitoAccessToken();
  }, [state.authMode, state.isAuthenticated, state.isConfigured]);

  const value = useMemo(
    () => ({
      ...state,
      refreshUser,
      signIn,
      signUp,
      confirmSignUp,
      resendSignUpCode,
      confirmNewPassword,
      signOut,
      getAccessToken,
    }),
    [confirmNewPassword, confirmSignUp, getAccessToken, refreshUser, resendSignUpCode, signIn, signOut, signUp, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useEvidenceAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useEvidenceAuth must be used inside AuthProvider.');
  }
  return value;
}
