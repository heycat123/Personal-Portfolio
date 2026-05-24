import { formatCount } from '../utils/formatters';

export default function MetricTile({ icon: Icon, label, value, detail, tone = 'default' }) {
  const toneClasses = {
    default: 'border-gray-200 bg-white text-gray-900 dark:border-gray-800 dark:bg-[#101820] dark:text-gray-100',
    good: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100',
    warn: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100',
    bad: 'border-red-200 bg-red-50 text-red-950 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-100',
    info: 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100',
  };

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${toneClasses[tone] || toneClasses.default}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {typeof value === 'number' ? formatCount(value) : value}
          </p>
        </div>
        {Icon ? (
          <div className="rounded-md border border-black/5 bg-white/70 p-2 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
            <Icon size={18} aria-hidden="true" />
          </div>
        ) : null}
      </div>
      {detail ? <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{detail}</p> : null}
    </div>
  );
}
