export default function ProgressBar({ value, indeterminate = false, label }) {
  return (
    <div className="w-full">
      {label && <p className="mb-1.5 text-sm text-(--color-text-2)">{label}</p>}
      <div className="relative h-2 overflow-hidden rounded-full bg-(--color-surface-3)">
        {indeterminate ? (
          <div className="progress-indeterminate absolute inset-0" />
        ) : (
          <div
            className="h-full rounded-full bg-(--color-brand) transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
          />
        )}
      </div>
    </div>
  )
}
