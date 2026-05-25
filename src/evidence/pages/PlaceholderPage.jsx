import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { useLocaleSettings } from '../context/LocaleContext';

export default function PlaceholderPage({ title, description, status = 'pending' }) {
  const { t } = useLocaleSettings();
  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={<StatusBadge status={status} label="Staged" />}
      />
      <EmptyState
        title={t('{title} is staged', { title: t(title) })}
        description="This route is present so navigation and permissions can settle before write or paid workflows are enabled."
      />
    </div>
  );
}
