export default function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold text-gray-950 dark:text-white">{title}</h2>
        {description ? <p className="mt-1 max-w-3xl text-sm text-gray-600 dark:text-gray-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
