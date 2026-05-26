import { ArrowRight, Briefcase, FolderPlus, HelpCircle, UserPlus } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';

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

export default function OnboardingPage() {
  const [searchParams] = useSearchParams();
  const selectedIntent = searchParams.get('intent');

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
          const selected = selectedIntent === option.id || (selectedIntent === 'precase' && option.id === 'precase');
          const emphasized = option.emphasized || selected;
          return (
            <section
              key={option.id}
              className={[
                'rounded-lg border bg-white p-5 shadow-sm dark:bg-[#101820]',
                emphasized
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
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-2 rounded-md bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                  title="This 7.13 slice adds the route and product path. Workspace creation is next."
                >
                  {option.cta}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
                <span className="text-xs font-medium uppercase text-gray-500 dark:text-gray-500">
                  Setup wizard next
                </span>
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        This screen is the first 7.13 implementation step. The next cut wires these choices to active-case, pre-case,
        invite, and routing-question workflows.
      </div>
    </div>
  );
}
