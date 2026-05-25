/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { translateUi } from '../i18n/translations';
import { evidenceApi } from '../services/evidenceApi';
import { useEvidenceAuth } from './AuthContext';

export const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: 'English', shortLabel: 'EN' },
  { code: 'pt-BR', label: 'Português', shortLabel: 'PT' },
];

export const LOCALE_STORAGE_KEY = 'evidence.locale.preferences';

const LocaleContext = createContext(null);

function browserLanguage() {
  if (typeof navigator === 'undefined' || !navigator.language) {
    return 'en-US';
  }
  return normalizeLanguage(navigator.language);
}

function browserTimeZone() {
  if (typeof Intl === 'undefined') {
    return 'UTC';
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function normalizeLanguage(value) {
  const language = String(value || '').trim();
  if (!language) {
    return 'en-US';
  }
  if (language.toLowerCase().startsWith('pt')) {
    return 'pt-BR';
  }
  if (language.toLowerCase().startsWith('en')) {
    return 'en-US';
  }
  return 'en-US';
}

export function getDefaultLocalePreferences() {
  return {
    language: browserLanguage(),
    timeZone: browserTimeZone(),
  };
}

export function readStoredLocalePreferences() {
  const defaults = getDefaultLocalePreferences();
  if (typeof window === 'undefined') {
    return defaults;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCALE_STORAGE_KEY) || '{}');
    return {
      language: normalizeLanguage(parsed.language || parsed.locale || defaults.language),
      timeZone: String(parsed.timeZone || parsed.timezone || defaults.timeZone || 'UTC'),
    };
  } catch {
    return defaults;
  }
}

function writeStoredLocalePreferences(preferences) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(
    LOCALE_STORAGE_KEY,
    JSON.stringify({
      language: normalizeLanguage(preferences.language),
      timeZone: String(preferences.timeZone || 'UTC'),
    }),
  );
}

function normalizePreferences(next) {
  const current = readStoredLocalePreferences();
  return {
    language: normalizeLanguage(next?.language || next?.preferred_language || next?.locale || current.language),
    timeZone: String(next?.timeZone || next?.preferred_timezone || next?.timezone || current.timeZone || 'UTC'),
  };
}

export function LocaleProvider({ children }) {
  const { getAccessToken, isAuthenticated } = useEvidenceAuth();
  const [preferences, setPreferencesState] = useState(() => readStoredLocalePreferences());
  const [state, setState] = useState({ loading: false, saving: false, error: null });

  const setPreferences = useCallback((next) => {
    const normalized = normalizePreferences(next);
    setPreferencesState(normalized);
    writeStoredLocalePreferences(normalized);
    return normalized;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadServerPreferences() {
      if (!isAuthenticated) {
        return;
      }
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        const token = await getAccessToken();
        const result = await evidenceApi.getMe({ token });
        if (cancelled) return;
        const user = result.data?.user || {};
        setPreferences({
          language: user.preferred_language,
          timeZone: user.preferred_timezone,
        });
        setState((current) => ({ ...current, loading: false }));
      } catch (error) {
        if (cancelled) return;
        setState((current) => ({ ...current, loading: false, error }));
      }
    }

    loadServerPreferences();

    return () => {
      cancelled = true;
    };
  }, [getAccessToken, isAuthenticated, setPreferences]);

  const updatePreferences = useCallback(
    async (next, options = {}) => {
      const { syncRemote = true } = options;
      const normalized = setPreferences(next);
      if (!syncRemote || !isAuthenticated) {
        return normalized;
      }

      setState((current) => ({ ...current, saving: true, error: null }));
      try {
        const token = await getAccessToken();
        await evidenceApi.updateMePreferences(
          {
            preferred_language: normalized.language,
            preferred_timezone: normalized.timeZone,
          },
          { token },
        );
        setState((current) => ({ ...current, saving: false }));
        return normalized;
      } catch (error) {
        setState((current) => ({ ...current, saving: false, error }));
        throw error;
      }
    },
    [getAccessToken, isAuthenticated, setPreferences],
  );

  const t = useCallback((key, values) => translateUi(preferences.language, key, values), [preferences.language]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = preferences.language;
    }
  }, [preferences.language]);

  const value = useMemo(
    () => ({
      ...state,
      preferences,
      supportedLanguages: SUPPORTED_LANGUAGES,
      setPreferences,
      t,
      updatePreferences,
    }),
    [preferences, setPreferences, state, t, updatePreferences],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocaleSettings() {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error('useLocaleSettings must be used inside LocaleProvider.');
  }
  return value;
}
