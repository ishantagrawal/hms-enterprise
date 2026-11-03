import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';

let initialization;

export function usesNativeGoogleSignIn() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function signInWithNativeGoogle(webClientId) {
  if (!usesNativeGoogleSignIn()) {
    throw new Error('Native Google sign-in is only available in the Android app.');
  }
  if (!webClientId) {
    throw new Error('Google sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID to the Web OAuth client ID.');
  }

  if (!initialization) {
    initialization = SocialLogin.initialize({
      google: {
        webClientId,
        mode: 'online'
      }
    }).catch((error) => {
      initialization = undefined;
      throw error;
    });
  }
  await initialization;

  const { result } = await SocialLogin.login({
    provider: 'google',
    options: { scopes: ['email', 'profile'] }
  });
  if (result.responseType !== 'online' || !result.idToken) {
    throw new Error('Google did not return an ID token. Please try signing in again.');
  }
  return result.idToken;
}
