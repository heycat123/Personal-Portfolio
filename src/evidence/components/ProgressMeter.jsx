export default function ProgressMeter({
  value = 0,
  label,
  detail,
  className = '',
}) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  const displayLabel = label || `${percent}%`;

  return (
    <div
      className={className}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={displayLabel}
    >
      <div className="mb-1 flex items-center justify-between gap-3 text-xs font-semibold text-gray-700 dark:text-gray-200">
        <span>{displayLabel}</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-black/40">
        <div
          className="h-full rounded-full bg-amber-500 transition-[width] duration-300 dark:bg-amber-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      {detail ? (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</p>
      ) : null}
    </div>
  );
}
