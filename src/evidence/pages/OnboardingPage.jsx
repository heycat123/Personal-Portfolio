import { ArrowLeft, ArrowRight, Briefcase, CheckCircle2, FolderPlus, HelpCircle, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ErrorPanel from '../components/ErrorPanel';
import PageHeader from '../components/PageHeader';
import { useEvidenceAuth } from '../context/AuthContext';
import { evidenceApi } from '../services/evidenceApi';

const OPTIONS = [
  {
    id: 'active-case',
    title: 'Create a new active case',
    description: 'Use this when a formal court case, agency matter, appeal, or filed legal matter already exists.',
    icon: Briefcase,
    cta: 'Start active case setup',
  },
  {
    id: 'precase',
    title: 'Prepare for a possible future case',
    description: 'Organize documents, define parties, build a timeline, and preserve evidence before anything is filed.',
    icon: FolderPlus,
    cta: 'Start pre-case workspace',
    emphasized: true,
  },
  {
    id: 'join',
    title: 'Join an existing case',
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
const EVIDENCE_GOALS = ['Build a timeline', 'Prove communication attempts', 'Identify contradictions', 'Prepare for attorney review', 'Organize documents', 'Find missing evidence'];
const DOCUMENT_SOURCES = ['Manual uploads', 'Google Drive', 'Gmail', 'Text messages', 'Photos and videos', 'Financial records', 'School records', 'Medical records'];

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

export default function OnboardingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getAccessToken } = useEvidenceAuth();
  const initialIntent = searchParams.get('intent') || null;
  const [selected, setSelected] = useState(initialIntent);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [unsure, setUnsure] = useState({ filed: '', invited: '', preparing: '' });
  const [form, setForm] = useState({
    workspace_name:
      initialIntent === 'precase'
        ? 'Pre-case preparation workspace'
        : initialIntent === 'active-case'
          ? 'New active legal case'
          : '',
    matter_type: 'Family law',
    case_subtype: '',
    jurisdiction_country: 'United States',
    jurisdiction_state: '',
    jurisdiction_county: '',
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
      const caseId = result.data?.case_id || result.data?.workspace?.case_id;
      navigate(`/evidence/cases/${encodeURIComponent(caseId)}/dashboard`, { replace: true });
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

  const selectedOption = OPTIONS.find((option) => option.id === selected);
  const showWorkspaceForm = selected === 'active-case' || selected === 'precase';
  const stageOptions = selected === 'precase' ? PRECASE_STAGES : ACTIVE_STAGES;

  return (
    <div>
      <PageHeader
        title="Evidence Onboarding"
        description="Choose how this account should start. A user can exist without a case, with a pre-case workspace, with an active case, or as an invited participant."
        actions={
          <Link
            to="/evidence/cases"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            My cases
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
                  <h3 className="text-base font-semibold text-gray-950 dark:text-white">{option.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{option.description}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => selectPath(option.id)}
                className="mt-5 inline-flex items-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                {option.cta}
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
              <p className="text-xs font-semibold uppercase text-sky-700 dark:text-sky-300">7.13 setup path</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-950 dark:text-white">{selectedOption.title}</h2>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100 dark:hover:bg-white/10"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Change path
            </button>
          </div>

          {error ? <div className="mb-4"><ErrorPanel error={error} onRetry={() => setError(null)} /></div> : null}

          {showWorkspaceForm ? (
            <form className="space-y-5" onSubmit={submitWorkspace}>
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Workspace name">
                  <input className={inputClass()} value={form.workspace_name} onChange={(event) => update('workspace_name', event.target.value)} required minLength={3} />
                </Field>
                <Field label="Matter type">
                  <select className={inputClass()} value={form.matter_type} onChange={(event) => update('matter_type', event.target.value)}>
                    {MATTER_TYPES.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </Field>
                <Field label="Subtype">
                  <input className={inputClass()} value={form.case_subtype} onChange={(event) => update('case_subtype', event.target.value)} placeholder="Relocation, custody, debt collection, employment termination" />
                </Field>
                <Field label={selected === 'precase' ? 'Preparation status' : 'Case stage'}>
                  <select className={inputClass()} value={form.procedural_stage} onChange={(event) => update('procedural_stage', event.target.value)}>
                    {stageOptions.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </Field>
                {selected === 'active-case' ? (
                  <>
                    <Field label="Case number, if known">
                      <input className={inputClass()} value={form.case_number} onChange={(event) => update('case_number', event.target.value)} />
                    </Field>
                    <Field label="Court or agency">
                      <input className={inputClass()} value={form.court_or_agency} onChange={(event) => update('court_or_agency', event.target.value)} />
                    </Field>
                  </>
                ) : null}
                <Field label="Country">
                  <input className={inputClass()} value={form.jurisdiction_country} onChange={(event) => update('jurisdiction_country', event.target.value)} />
                </Field>
                <Field label="State or region">
                  <input className={inputClass()} value={form.jurisdiction_state} onChange={(event) => update('jurisdiction_state', event.target.value)} />
                </Field>
                <Field label="County or city">
                  <input className={inputClass()} value={form.jurisdiction_county} onChange={(event) => update('jurisdiction_county', event.target.value)} />
                </Field>
                <Field label="People, organizations, or agencies involved">
                  <input className={inputClass()} value={form.parties} onChange={(event) => update('parties', event.target.value)} placeholder="Separate names with commas" />
                </Field>
              </div>

              <Field label={selected === 'precase' ? 'What happened or what are you preparing for?' : 'Requested outcome'}>
                <textarea
                  className={`${inputClass()} min-h-28 resize-y`}
                  value={selected === 'precase' ? form.situation_summary : form.requested_outcome}
                  onChange={(event) => update(selected === 'precase' ? 'situation_summary' : 'requested_outcome', event.target.value)}
                />
              </Field>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">Evidence goals</p>
                  <div className="flex flex-wrap gap-2">
                    {EVIDENCE_GOALS.map((item) => (
                      <button
                        type="button"
                        key={item}
                        onClick={() => toggle('evidence_goals', item)}
                        className={[
                          'rounded-full border px-3 py-1.5 text-sm font-medium',
                          form.evidence_goals.includes(item)
                            ? 'border-sky-600 bg-sky-50 text-sky-900 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-100'
                            : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/10',
                        ].join(' ')}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">Expected document sources</p>
                  <div className="flex flex-wrap gap-2">
                    {DOCUMENT_SOURCES.map((item) => (
                      <button
                        type="button"
                        key={item}
                        onClick={() => toggle('document_sources', item)}
                        className={[
                          'rounded-full border px-3 py-1.5 text-sm font-medium',
                          form.document_sources.includes(item)
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100'
                            : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/10',
                        ].join(' ')}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  {submitting ? 'Creating workspace...' : 'Create workspace'}
                  <CheckCircle2 size={16} aria-hidden="true" />
                </button>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  This creates the workspace and owner membership. Document source setup comes next.
                </p>
              </div>
            </form>
          ) : null}

          {selected === 'join' ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Invitation acceptance is the next backend slice. For now this screen preserves the product path and avoids sending invited users into a dead-end case error.
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Invite code">
                  <input className={inputClass()} placeholder="Paste invite code" />
                </Field>
                <Field label="Inviter email">
                  <input className={inputClass()} placeholder="Optional" />
                </Field>
              </div>
            </div>
          ) : null}

          {selected === 'unsure' ? (
            <div className="space-y-4">
              {[
                ['filed', 'Has anything been filed in court or with an agency?'],
                ['invited', "Were you invited to join someone else's case?"],
                ['preparing', 'Are you organizing documents before speaking with an attorney or filing?'],
              ].map(([key, label]) => (
                <div key={key}>
                  <p className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</p>
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
                        {value}
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
                Recommend path
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
