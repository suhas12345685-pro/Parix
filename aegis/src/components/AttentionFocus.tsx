interface Props {
  focus: string | null;
  strength: number;
  admitRate: number;
  suppressedCount: number;
}

export function AttentionFocus({
  focus,
  strength,
  admitRate,
  suppressedCount,
}: Props) {
  const strengthPercent = Math.round(Math.max(0, Math.min(1, strength)) * 100);
  const admitPercent = Math.round(Math.max(0, Math.min(1, admitRate)) * 100);

  return (
    <section className="rounded-lg border border-purple-400/15 bg-[#120b18]/70 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-[#8f82a0]">
          Attention
        </div>
        <span className="text-xs text-[#b8aec5]">{admitPercent}% admitted</span>
      </div>

      <div className="mt-3 min-h-[2.5rem] text-sm font-medium text-white">
        {focus ?? "Open attention"}
      </div>

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs text-[#a99bb9]">
          <span>Focus strength</span>
          <span>{strengthPercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#24162f]">
          <div
            className="h-full rounded-full bg-fuchsia-300"
            style={{ width: `${strengthPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-3 text-xs text-[#b8aec5]">
        {suppressedCount} suppressed event{" "}
        {suppressedCount === 1 ? "type" : "types"}
      </div>
    </section>
  );
}
