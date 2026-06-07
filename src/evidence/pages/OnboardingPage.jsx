import { ArrowLeft, ArrowRight, Briefcase, CheckCircle2, FolderPlus, HelpCircle, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import { useEvidenceAuth } from '../context/AuthContext';
import { useCaseContext } from '../context/CaseContext';
import { useLocaleSettings } from '../context/LocaleContext';
import { evidenceApi } from '../services/evidenceApi';
import { caseMatchesRouteId, evidenceCasePath } from '../utils/caseRouting';

const OPTIONS = [
  {
    id: 'active-case',
    title: 'Create personal case workspace',
    description: 'Create a private workspace for a family-law case or issue. Add what you know now and update details later.',
    icon: Briefcase,
    cta: 'Create personal case workspace',
    emphasized: true,
  },
  {
    id: 'precase',
    title: 'Prepare before a case is filed',
    description: 'Use this when you are gathering documents or preparing before anything has been filed.',
    icon: FolderPlus,
    cta: 'Prepare workspace',
  },
  {
    id: 'join',
    title: 'Join an existing workspace',
    description: 'Use an invitation link, invite code, or access request when someone else already created the case.',
    icon: UserPlus,
    cta: 'Enter invite details',
  },
  {
    id: 'unsure',
    title: 'I am not sure yet',
    description: 'Answer routing questions so the system can recommend the safest starting path.',
    icon: HelpCircle,
    cta: 'Help me choose',
  },
];

const MATTER_TYPES = ['Family law', 'Civil lawsuit', 'Employment', 'Landlord/tenant', 'Contract dispute', 'Debt collection', 'Immigration', 'Probate', 'Other'];
const ACTIVE_STAGES = ['Filed', 'Waiting for service', 'Service completed', 'Discovery', 'Mediation', 'Trial preparation', 'Final judgment', 'Enforcement', 'Modification', 'Appeal', 'Unknown'];
const PRECASE_STAGES = ['No case filed', 'Considering filing', 'Gathering documents', 'Waiting for attorney review', 'Demand letter stage', 'Settlement discussion', 'Agency complaint pending', 'Unsure'];
const EVIDENCE_GOALS = ['Build a timeline', 'Track communication attempts', 'Organize communication history', 'Prepare for attorney review', 'Organize documents', 'Find evidence gaps'];
const DOCUMENT_SOURCES = ['Manual uploads', 'Google Drive', 'Gmail', 'Text messages', 'Photos and videos', 'Financial records', 'School records', 'Medical records'];
const LEGAL_ISSUES = ['Parenting plan / time-sharing', 'Parental responsibility', 'Relocation', 'Child support', 'Mandatory disclosure', 'Financial affidavit', 'Order-related issue', 'Modification', 'Debt collection', 'Employment termination', 'Contract breach', 'Immigration status'];
const EVIDENCE_CATEGORIES = ['Court filings', 'Court orders', 'Emails', 'Text messages', 'Chat messages', 'Photos', 'Videos', 'Financial records', 'School records', 'Medical records', 'Police reports', 'Travel records', 'Contracts', 'Personal notes'];
const SENSITIVE_MATERIALS = ['Attorney-client communications', 'Settlement negotiations', 'Minor child information', 'Medical information', 'School records', 'Financial disclosures', 'Sealed records', 'Confidential addresses', 'Domestic violence or safety-sensitive information', 'Immigration records'];
const ENTITY_TYPES = ['People', 'Children', 'Parents', 'Attorneys', 'Courts', 'Agencies', 'Schools', 'Employers', 'Doctors', 'Addresses', 'Phone numbers', 'Email accounts', 'Case numbers', 'Orders', 'Documents', 'Events', 'Payments', 'Locations'];
const RELATIONSHIP_TYPES = ['Parent of', 'Represented by', 'Employed by', 'Enrolled at', 'Lives at', 'Sent message to', 'Possible missed response', 'Filed document', 'Served document', 'Related to order', 'Order-related event', 'Payment history', 'Amount owed', 'Moved from', 'Moved to'];
const FACT_PRIORITIES = ['Timeline of events', 'Possible missed communication', 'Parenting time notes', 'Payment history', 'Differences between records', 'Location history', 'School history', 'Medical events', 'Safety-related events', 'Deadlines', 'Order-related events', 'Damages', 'Witnesses', 'Evidence gaps'];
const ACCESS_ROLES = ['Owner', 'Attorney', 'Paralegal', 'Co-party', 'Expert', 'Witness', 'Viewer', 'Document uploader'];
const COUNTRIES = ['United States', 'Brazil'];

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</span>
      {children}
    </label>
  );
}

function inputClass() {
  return 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-gray-700 dark:bg-[#0b1117] dark:text-white dark:focus:border-sky-500 dark:focus:ring-sky-900/50';
}

function ChipGroup({ title, values, selectedValues, onToggle, tone = 'sky' }) {
  const { t } = useLocaleSettings();
  const activeClass =
    tone === 'emerald'
      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100'
      : 'border-sky-600 bg-sky-50 text-sky-900 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-100';
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">{t(title)}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => onToggle(item)}
            className={[
              'rounded-full border px-3 py-1.5 text-sm font-medium',
              selectedValues.includes(item)
                ? activeClass
                : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/10',
            ].join(' ')}
          >
            {t(item)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getAccessToken } = useEvidenceAuth();
  const { registerCases } = useCaseContext();
  const { t } = useLocaleSettings();
  const initialIntent = searchParams.get('intent') || null;
  const initialInviteCode = searchParams.get('invite_code') || '';
  const [selected, setSelected] = useState(initialIntent || 'active-case');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [autoAcceptAttempted, setAutoAcceptAttempted] = useState(false);
  const [unsure, setUnsure] = useState({ filed: '', invited: '', preparing: '' });
  const [joinForm, setJoinForm] = useState({ invite_code: initialInviteCode });
  const [form, setForm] = useState({
    workspace_name:
      (initialIntent || 'active-case') === 'precase'
        ? 'Pre-case preparation workspace'
        : 'Personal case workspace',
    matter_type: 'Family law',
    case_subtype: '',
    jurisdiction_country: 'United States',
    jurisdiction_state: 'Florida',
    jurisdiction_county: 'Indian River County',
    court_or_agency: '',
    procedural_stage:
      initialIntent === 'precase'
        ? 'Gathering documents'
        : initialIntent === 'active-case'
          ? 'Unknown'
          : '',
    case_number: '',
    requested_outcome: '',
    situation_summary: '',
    parties: '',
    evidence_goals: [],
    document_sources: [],
    legal_issues: [],
    known_laws_rules_orders: '',
    existing_orders_agreements: '',
    important_dates: '',
    evidence_categories: [],
    sensitive_materials: [],
    entity_types: ['People', 'Documents', 'Events'],
    relationship_types: [],
    fact_extraction_priorities: [],
    access_roles: ['Owner'],
  });

  const selectPath = (id) => {
    setSelected(id);
    setError(null);
    setForm((current) => ({
      ...current,
      workspace_name:
        current.workspace_name ||
        (id === 'precase' ? 'Pre-case preparation workspace' : id === 'active-case' ? 'New active legal case' : ''),
      procedural_stage: id === 'precase' ? 'Gathering documents' : id === 'active-case' ? 'Unknown' : current.procedural_stage,
    }));
  };

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateCountry = (value) => {
    setForm((current) => ({
      ...current,
      jurisdiction_country: value,
      jurisdiction_state:
        value === 'Brazil'
          ? current.jurisdiction_country === 'Brazil' && current.jurisdiction_state
            ? current.jurisdiction_state
            : 'São Paulo'
          : current.jurisdiction_country === 'United States' && current.jurisdiction_state
            ? current.jurisdiction_state
            : 'Florida',
      jurisdiction_county:
        value === 'Brazil'
          ? current.jurisdiction_country === 'Brazil' && current.jurisdiction_county
            ? current.jurisdiction_county
            : 'São Paulo'
          : current.jurisdiction_country === 'United States' && current.jurisdiction_county
            ? current.jurisdiction_county
            : 'Indian River County',
    }));
  };
  const toggle = (key, value) => {
    setForm((current) => {
      const next = new Set(current[key] || []);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return { ...current, [key]: Array.from(next) };
    });
  };

  const submitWorkspace = async (event) => {
    event.preventDefault();
    if (!['active-case', 'precase'].includes(selected)) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.createOnboardingWorkspace({
        onboarding_path: selected,
        ...form,
        parties: splitList(form.parties),
      }, { token });
      navigate(evidenceCasePath(result.data?.workspace || result.data, '/dashboard'), { replace: true });
    } catch (requestError) {
      setError(requestError);
    } finally {
      setSubmitting(false);
    }
  };

  const routeUnsure = () => {
    if (unsure.invited === 'yes') {
      selectPath('join');
    } else if (unsure.filed === 'yes') {
      selectPath('active-case');
    } else {
      selectPath('precase');
    }
  };

  const acceptInviteCode = useCallback(async (rawInviteCode) => {
    const inviteCode = String(rawInviteCode || '').trim();
    if (!inviteCode) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const result = await evidenceApi.acceptInvitation({ invite_code: inviteCode }, { token });
      const casesResult = await evidenceApi.getCases({ token });
      const cases = casesResult.data?.cases || [];
      registerCases(cases);
      const acceptedCase = cases.find((item) => caseMatchesRouteId(item, result.data?.case_url_id || result.data?.case_id)) || result.data;
      navigate(evidenceCasePath(acceptedCase, '/dashboard'), { replace: true });
    } catch (requestError) {
      setError(requestError);
    } finally {
      setSubmitting(false);
    }
  }, [getAccessToken, navigate, registerCases]);

  useEffect(() => {
    if (selected !== 'join' || !initialInviteCode || autoAcceptAttempted) {
      return;
    }
    setAutoAcceptAttempted(true);
    acceptInviteCode(initialInviteCode);
  }, [acceptInviteCode, autoAcceptAttempted, initialInviteCode, selected]);

  const acceptInvitation = async (event) => {
    event.preventDefault();
    await acceptInviteCode(joinForm.invite_code);
  };

  const selectedOption = OPTIONS.find((option) => option.id === selected);
  const showWorkspaceForm = selected === 'active-case' || selected === 'precase';
  const stageOptions = selected === 'precase' ? PRECASE_STAGES : ACTIVE_STAGES;

  return (
    <div>
      <PageHeader
        title="Start New Workspace"
        description="Start with the country and location for this case or issue. You can update these details later."
        actions={
          <Link
            to="/evidence/cases"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            {t('My cases')}
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = selected === option.id;
          return (
            <section
              key={option.id}
              className={[
                'rounded-lg border bg-white p-5 shadow-sm dark:bg-[#101820]',
                option.emphasized || active
                  ? 'border-sky-300 ring-2 ring-sky-200/70 dark:border-sky-700 dark:ring-sky-900/50'
                  : 'border-gray-200 dark:border-gray-800',
              ].join(' ')}
            >
              <div className="flex items-start gap-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-sky-700 dark:border-gray-800 dark:bg-[#0b1117] dark:text-sky-300">
                  <Icon size={22} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-gray-950 dark:text-white">{t(option.title)}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{t(option.description)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => selectPath(option.id)}
                className="mt-5 inline-flex items-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                {t(option.cta)}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </section>
          );
        })}
      </div>

      {selectedOption ? (
        <section className="mt-5 rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#101820]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-sky-700 dark:text-sky-300">{t('Set up your workspace')}</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-950 dark:text-white">{t(selectedOption.title)}</h2>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100 dark:hover:bg-white/10"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t('Change path')}
            </button>
          </div>

          {error ? <div className="mb-4"><ErrorPanel error={error} onRetry={() => setError(null)} /></div> : null}

          {showWorkspaceForm ? (
            <form className="space-y-5" onSubmit={submitWorkspace}>
              <section className="rounded-lg border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900/60 dark:bg-sky-950/20">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase text-sky-700 dark:text-sky-300">{t('Location')}</p>
                  <h3 className="mt-1 text-base font-semibold text-gray-950 dark:text-white">{t('Where is this case or issue located?')}</h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {t('Choose the country first. For a personal case workspace, city and state or region are enough to get started.')}
                  </p>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  <Field label={t('Country')}>
                    <select className={inputClass()} value={form.jurisdiction_country} onChange={(event) => updateCountry(event.target.value)}>
                      {COUNTRIES.map((item) => <option key={item} value={item}>{t(item)}</option>)}
                    </select>
                  </Field>
                  <Field label={form.jurisdiction_country === 'Brazil' ? t('State') : t('State')}>
                    <input className={inputClass()} value={form.jurisdiction_state} onChange={(event) => update('jurisdiction_state', event.target.value)} placeholder={form.jurisdiction_country === 'Brazil' ? 'São Paulo' : 'Florida'} />
                  </Field>
                  <Field label={form.jurisdiction_country === 'Brazil' ? t('City') : t('County')}>
                    <input className={inputClass()} value={form.jurisdiction_county} onChange={(event) => update('jurisdiction_county', event.target.value)} placeholder={form.jurisdiction_country === 'Brazil' ? 'São Paulo' : 'Indian River County'} />
                  </Field>
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <Field label={t('Workspace name')}>
                  <input className={inputClass()} value={form.workspace_name} onChange={(event) => update('workspace_name', event.target.value)} required minLength={3} />
                </Field>
                <Field label={t('Family-law topic')}>
                  <select className={inputClass()} value={form.matter_type} onChange={(event) => update('matter_type', event.target.value)}>
                    {MATTER_TYPES.map((item) => <option key={item} value={item}>{t(item)}</option>)}
                  </select>
                </Field>
                <Field label={t('Topic details')}>
                  <input className={inputClass()} value={form.case_subtype} onChange={(event) => update('case_subtype', event.target.value)} placeholder={t('Parenting, divorce, support, documents, or another family matter')} />
                </Field>
                <Field label={selected === 'precase' ? t('Preparation status') : t('Case stage')}>
                  <select className={inputClass()} value={form.procedural_stage} onChange={(event) => update('procedural_stage', event.target.value)}>
                    {stageOptions.map((item) => <option key={item} value={item}>{t(item)}</option>)}
                  </select>
                </Field>
                {selected === 'active-case' ? (
                  <>
                    <Field label={t('Court case number, if known')}>
                      <input className={inputClass()} value={form.case_number} onChange={(event) => update('case_number', event.target.value)} />
                    </Field>
                    <Field label={form.jurisdiction_country === 'Brazil' ? t('Court or forum, if known') : t('Court/county, if known')}>
                      <input className={inputClass()} value={form.court_or_agency} onChange={(event) => update('court_or_agency', event.target.value)} />
                    </Field>
                  </>
                ) : null}
                <Field label={t('People involved, if known')}>
                  <input className={inputClass()} value={form.parties} onChange={(event) => update('parties', event.target.value)} placeholder={t('Separate names with commas. You can add people later.')} />
                </Field>
              </div>

              <Field label={selected === 'precase' ? t('What happened or what are you preparing for?') : t('What would you like to organize first?')}>
                <textarea
                  className={`${inputClass()} min-h-28 resize-y`}
                  value={selected === 'precase' ? form.situation_summary : form.requested_outcome}
                  onChange={(event) => update(selected === 'precase' ? 'situation_summary' : 'requested_outcome', event.target.value)}
                />
              </Field>

              <section className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-[#0b1117]">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase text-sky-700 dark:text-sky-300">{t('Workspace setup')}</p>
                  <h3 className="mt-1 text-base font-semibold text-gray-950 dark:text-white">{t('Guide document organization before processing')}</h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {t('These choices help organize documents and search. They do not decide what applies to your case or whether any material is legally important.')}
                  </p>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <ChipGroup title="Issue tags" values={LEGAL_ISSUES} selectedValues={form.legal_issues} onToggle={(item) => toggle('legal_issues', item)} />
                  <ChipGroup title="Evidence goals" values={EVIDENCE_GOALS} selectedValues={form.evidence_goals} onToggle={(item) => toggle('evidence_goals', item)} />
                  <ChipGroup title="Expected document sources" values={DOCUMENT_SOURCES} selectedValues={form.document_sources} onToggle={(item) => toggle('document_sources', item)} tone="emerald" />
                  <ChipGroup title="Evidence categories" values={EVIDENCE_CATEGORIES} selectedValues={form.evidence_categories} onToggle={(item) => toggle('evidence_categories', item)} tone="emerald" />
                  <ChipGroup title="Sensitive or privileged material" values={SENSITIVE_MATERIALS} selectedValues={form.sensitive_materials} onToggle={(item) => toggle('sensitive_materials', item)} />
                  <ChipGroup title="People/contact details to review" values={ENTITY_TYPES} selectedValues={form.entity_types} onToggle={(item) => toggle('entity_types', item)} />
                  <ChipGroup title="Relationship types to track" values={RELATIONSHIP_TYPES} selectedValues={form.relationship_types} onToggle={(item) => toggle('relationship_types', item)} />
                  <ChipGroup title="Information to look for" values={FACT_PRIORITIES} selectedValues={form.fact_extraction_priorities} onToggle={(item) => toggle('fact_extraction_priorities', item)} />
                  <ChipGroup title="Expected access roles" values={ACCESS_ROLES} selectedValues={form.access_roles} onToggle={(item) => toggle('access_roles', item)} />
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  <Field label={t('Known laws, rules, orders, or standards (optional)')}>
                    <textarea className={`${inputClass()} min-h-28 resize-y`} value={form.known_laws_rules_orders} onChange={(event) => update('known_laws_rules_orders', event.target.value)} placeholder={t('Optional. You can leave this blank if you do not know.')} />
                  </Field>
                  <Field label={t('Existing orders or agreements')}>
                    <textarea className={`${inputClass()} min-h-28 resize-y`} value={form.existing_orders_agreements} onChange={(event) => update('existing_orders_agreements', event.target.value)} placeholder={t('Court orders, contracts, agreements, or agency decisions.')} />
                  </Field>
                  <Field label={t('Important dates')}>
                    <textarea className={`${inputClass()} min-h-28 resize-y`} value={form.important_dates} onChange={(event) => update('important_dates', event.target.value)} placeholder={t('Filing dates, incidents, deadlines, move dates, or hearing dates.')} />
                  </Field>
                </div>
              </section>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  {submitting ? t('Creating workspace...') : t('Create personal case workspace')}
                  <CheckCircle2 size={16} aria-hidden="true" />
                </button>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('This creates a personal case workspace. Case owner means the person who controls access to this workspace. Document source setup comes next.')}
                </p>
              </div>
            </form>
          ) : null}

          {selected === 'join' ? (
            <form className="space-y-4" onSubmit={acceptInvitation}>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('Paste an invitation code from a case owner, attorney, or admin. The email on the invitation must match this account.')}
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label={t('Invite code')}>
                  <input
                    className={inputClass()}
                    value={joinForm.invite_code}
                    onChange={(event) => setJoinForm({ invite_code: event.target.value })}
                    placeholder={t('case_xxxxxxxxxx_xxxxxxxxxx')}
                    required
                  />
                </Field>
                <Field label={t('Inviter email')}>
                  <input className={inputClass()} placeholder={t('Optional reference only')} disabled />
                </Field>
              </div>
              <button
                type="submit"
                disabled={submitting || !joinForm.invite_code.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                {submitting ? t('Accepting invitation...') : t('Accept invitation')}
                <CheckCircle2 size={16} aria-hidden="true" />
              </button>
            </form>
          ) : null}

          {selected === 'unsure' ? (
            <div className="space-y-4">
              {[
                ['filed', 'Has anything been filed in court or with an agency?'],
                ['invited', "Were you invited to join someone else's case?"],
                ['preparing', 'Are you organizing documents before speaking with an attorney or filing?'],
              ].map(([key, label]) => (
                <div key={key}>
                  <p className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">{t(label)}</p>
                  <div className="flex gap-2">
                    {['yes', 'no', 'not sure'].map((value) => (
                      <button
                        type="button"
                        key={value}
                        onClick={() => setUnsure((current) => ({ ...current, [key]: value }))}
                        className={[
                          'rounded-md border px-3 py-2 text-sm font-semibold capitalize',
                          unsure[key] === value
                            ? 'border-sky-600 bg-sky-50 text-sky-900 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-100'
                            : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/10',
                        ].join(' ')}
                      >
                        {t(value)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={routeUnsure}
                className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                {t('Recommend path')}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
