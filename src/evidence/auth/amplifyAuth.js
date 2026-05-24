import { Amplify } from 'aws-amplify';
import {
  fetchAuthSession,
  getCurrentUser,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
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
  return session.tokens?.accessToken?.toString() || null;
}

export async function signInWithCognito({ email, password }) {
  return amplifySignIn({
    username: email,
    password,
  });
}

export async function signOutOfCognito() {
  return amplifySignOut();
}
