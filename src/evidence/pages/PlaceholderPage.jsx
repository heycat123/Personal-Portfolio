import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';

export default function PlaceholderPage({ title, description, status = 'pending' }) {
  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={<StatusBadge status={status} label="Staged" />}
      />
      <EmptyState
        title={`${title} is staged`}
        description="This route is present so navigation and permissions can settle before write or paid workflows are enabled."
      />
    </div>
  );
}
