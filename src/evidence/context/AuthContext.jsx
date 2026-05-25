/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  confirmSignUpWithCognito,
  confirmCognitoNewPassword,
  configureAmplifyAuth,
  getCognitoAccessToken,
  getCognitoUser,
  getCognitoUserAttributes,
  resendCognitoSignUpCode,
  signInWithCognito,
  signOutOfCognito,
  signUpWithCognito,
  updateCognitoUserProfile,
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
      let attributes = {};
      try {
        attributes = await getCognitoUserAttributes();
      } catch {
        attributes = {};
      }
      const loginId = cognitoUser.signInDetails?.loginId || cognitoUser.username || '';
      const displayName = attributes.name || [attributes.given_name, attributes.family_name].filter(Boolean).join(' ') || loginId || 'Evidence User';
      setState({
        loading: false,
        authMode: 'cognito',
        isConfigured: true,
        isAuthenticated: true,
        user: {
          displayName,
          email: attributes.email || loginId || null,
          userId: cognitoUser.userId || cognitoUser.username,
          attributes,
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

  const signUp = useCallback(async ({ username, email, password, displayName, phoneNumber }) => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await signUpWithCognito({ username, email, password, displayName, phoneNumber });
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

  const getUserAttributes = useCallback(async () => {
    if (state.authMode !== 'cognito' || !state.isConfigured || !state.isAuthenticated) {
      return {};
    }
    return getCognitoUserAttributes();
  }, [state.authMode, state.isAuthenticated, state.isConfigured]);

  const updateProfile = useCallback(async (profile) => {
    if (state.authMode !== 'cognito' || !state.isConfigured || !state.isAuthenticated) {
      throw new Error('Profile updates require a Cognito session.');
    }
    const result = await updateCognitoUserProfile(profile);
    await refreshUser();
    return result;
  }, [refreshUser, state.authMode, state.isAuthenticated, state.isConfigured]);

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
      getUserAttributes,
      updateProfile,
      signOut,
      getAccessToken,
    }),
    [confirmNewPassword, confirmSignUp, getAccessToken, getUserAttributes, refreshUser, resendSignUpCode, signIn, signOut, signUp, state, updateProfile],
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
