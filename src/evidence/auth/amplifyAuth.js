import { Amplify } from 'aws-amplify';
import {
  fetchAuthSession,
  confirmSignUp as amplifyConfirmSignUp,
  confirmSignIn as amplifyConfirmSignIn,
  getCurrentUser,
  resendSignUpCode as amplifyResendSignUpCode,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  signUp as amplifySignUp,
} from 'aws-amplify/auth';

let configured = false;

export function getCognitoConfig() {
  const region = import.meta.env.VITE_AWS_REGION || import.meta.env.VITE_COGNITO_REGION || '';
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID || '';
  const userPoolClientId = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID || '';

  if (!region || !userPoolId || !userPoolClientId) {
    return {
      configured: false,
      region,
      userPoolId,
      userPoolClientId,
    };
  }

  return {
    configured: true,
    region,
    userPoolId,
    userPoolClientId,
    amplifyConfig: {
      Auth: {
        Cognito: {
          userPoolId,
          userPoolClientId,
          loginWith: {
            email: true,
          },
        },
      },
    },
  };
}

export function configureAmplifyAuth() {
  if (configured) {
    return getCognitoConfig();
  }

  const config = getCognitoConfig();
  if (config.configured) {
    Amplify.configure(config.amplifyConfig);
    configured = true;
  }
  return config;
}

export async function getCognitoUser() {
  return getCurrentUser();
}

export async function getCognitoAccessToken() {
  const session = await fetchAuthSession();
  return session.tokens?.idToken?.toString() || session.tokens?.accessToken?.toString() || null;
}

export async function signInWithCognito({ username, email, password }) {
  return amplifySignIn({
    username: username || email,
    password,
  });
}

export async function signOutOfCognito() {
  return amplifySignOut();
}

export async function confirmCognitoNewPassword({ newPassword }) {
  return amplifyConfirmSignIn({ challengeResponse: newPassword });
}

export async function signUpWithCognito({ username, email, password, displayName, phoneNumber }) {
  const userAttributes = {
    email,
  };
  if (displayName) {
    userAttributes.name = displayName;
  }
  if (phoneNumber) {
    userAttributes.phone_number = phoneNumber;
  }

  return amplifySignUp({
    username: username || email,
    password,
    options: {
      userAttributes,
    },
  });
}

export async function confirmSignUpWithCognito({ username, email, confirmationCode }) {
  return amplifyConfirmSignUp({
    username: username || email,
    confirmationCode,
  });
}

export async function resendCognitoSignUpCode({ username, email }) {
  return amplifyResendSignUpCode({
    username: username || email,
  });
}
