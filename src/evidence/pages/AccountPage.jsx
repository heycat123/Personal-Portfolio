import { Save, UserCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import { useEvidenceAuth } from '../context/AuthContext';
import { useLocaleSettings } from '../context/LocaleContext';

function initialProfile() {
  return {
    email: '',
    displayName: '',
    firstName: '',
    familyName: '',
    locale: typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US',
    timeZone:
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago'
        : 'America/Chicago',
  };
}

function optionalValue(value) {
  const normalized = String(value || '').trim();
  return normalized ? normalized : undefined;
}

export default function AccountPage() {
  const { authMode, getUserAttributes, updateProfile, user } = useEvidenceAuth();
  const { preferences, supportedLanguages, t, updatePreferences } = useLocaleSettings();
  const [profile, setProfile] = useState(() => initialProfile());
  const [state, setState] = useState({
    loading: true,
    saving: false,
    error: null,
    notice: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setState((current) => ({ ...current, loading: true, error: null, notice: null }));
      try {
        const attributes = await getUserAttributes();
        if (cancelled) return;
        setProfile({
          email: attributes.email || user?.email || '',
          displayName: attributes.name || user?.displayName || '',
          firstName: attributes.given_name || '',
          familyName: attributes.family_name || '',
          locale: attributes.locale || preferences.language || initialProfile().locale,
          timeZone: attributes.zoneinfo || preferences.timeZone || initialProfile().timeZone,
        });
        setState((current) => ({ ...current, loading: false }));
      } catch (error) {
        if (cancelled) return;
        setState((current) => ({ ...current, loading: false, error }));
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [getUserAttributes, preferences.language, preferences.timeZone, user?.displayName, user?.email]);

  async function handleSubmit(event) {
    event.preventDefault();
    setState((current) => ({ ...current, saving: true, error: null, notice: null }));
    try {
      if (authMode === 'cognito') {
        await updateProfile({
          displayName: optionalValue(profile.displayName),
          firstName: optionalValue(profile.firstName),
          familyName: optionalValue(profile.familyName),
          locale: optionalValue(profile.locale),
          timeZone: optionalValue(profile.timeZone),
        });
      }
      await updatePreferences({
        language: optionalValue(profile.locale),
        timeZone: optionalValue(profile.timeZone),
      });
      setState((current) => ({ ...current, saving: false, notice: t('Account information updated.') }));
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    }
  }

  return (
    <div>
      <PageHeader
        title="Account"
        description="Manage the profile information attached to your Evidence AI login."
        actions={
          <div className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300">
            <UserCircle size={16} aria-hidden="true" />
            {user?.displayName || user?.email || t('Evidence User')}
          </div>
        }
      />

      {state.error ? <div className="mb-5"><ErrorPanel title="Account update failed" error={state.error} /></div> : null}
      {state.notice ? (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
          {state.notice}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Email')}</span>
              <input
                type="email"
                value={profile.email}
                readOnly
                className="mt-1 w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-black/20 dark:text-gray-300"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Display name')}</span>
              <input
                type="text"
                value={profile.displayName}
                onChange={(event) => setProfile((current) => ({ ...current, displayName: event.target.value }))}
                autoComplete="name"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('First name')}</span>
              <input
                type="text"
                value={profile.firstName}
                onChange={(event) => setProfile((current) => ({ ...current, firstName: event.target.value }))}
                autoComplete="given-name"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Last name')}</span>
              <input
                type="text"
                value={profile.familyName}
                onChange={(event) => setProfile((current) => ({ ...current, familyName: event.target.value }))}
                autoComplete="family-name"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Default language')}</span>
              <select
                value={profile.locale}
                onChange={(event) => setProfile((current) => ({ ...current, locale: event.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              >
                {supportedLanguages.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('Timezone')}</span>
              <input
                type="text"
                value={profile.timeZone}
                onChange={(event) => setProfile((current) => ({ ...current, timeZone: event.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={state.loading || state.saving}
              className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              <Save size={16} aria-hidden="true" />
              {state.saving ? t('Saving') : t('Save account')}
            </button>
          </div>
        </form>

        <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <h2 className="text-sm font-semibold text-gray-950 dark:text-white">{t('Security')}</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">{t('Provider')}</dt>
              <dd className="mt-1 font-medium text-gray-900 dark:text-gray-100">Amazon Cognito</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">{t('User ID')}</dt>
              <dd className="mt-1 break-all font-mono text-xs text-gray-900 dark:text-gray-100">{user?.userId || '-'}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">{t('Email')}</dt>
              <dd className="mt-1 break-all text-gray-900 dark:text-gray-100">{profile.email || '-'}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
