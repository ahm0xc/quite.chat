import { cn } from "~/lib/utils";

function CircularProgress({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, progress));
  const circumference = 2 * Math.PI * 18;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center justify-center",
        className,
      )}
    >
      <div className="rounded-full bg-black/40 p-2 backdrop-blur-sm">
        <svg
          className="size-10 -rotate-90"
          viewBox="0 0 40 40"
          fill="none"
          aria-label={`Uploading ${Math.round(clamped)}%`}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <circle
            cx="20"
            cy="20"
            r="18"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="3"
          />
          <circle
            cx="20"
            cy="20"
            r="18"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-[stroke-dashoffset] duration-150"
          />
        </svg>
      </div>
    </div>
  );
}

export { CircularProgress };
