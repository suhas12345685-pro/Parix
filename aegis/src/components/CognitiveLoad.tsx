interface Props {
  load: number;
  breakdown: {
    plans: number;
    blockers: number;
    uncertainty: number;
  };
}

export function CognitiveLoad({ load, breakdown }: Props) {
  const percent = Math.round(Math.max(0, Math.min(1, load)) * 100);
  const tone =
    percent < 40
      ? {
          ring: "#34d399",
          text: "text-emerald-200",
        }
      : percent < 70
        ? {
            ring: "#fcd34d",
            text: "text-amber-200",
          }
        : {
            ring: "#fb7185",
            text: "text-rose-200",
          };
  const gaugeStyle = {
    background: `conic-gradient(${tone.ring} ${percent * 3.6}deg, #24162f 0deg)`,
  };

  return (
    <section className="rounded-lg border border-purple-400/15 bg-[#120b18]/70 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-[#8f82a0]">
            Cognitive Load
          </div>
          <div className={`mt-2 text-3xl font-semibold ${tone.text}`}>
            {percent}%
          </div>
        </div>
        <div
          className="relative h-16 w-16 rounded-full p-1"
          style={gaugeStyle}
          title={`Plans: ${breakdown.plans}, blockers: ${breakdown.blockers}, uncertainty: ${Math.round(
            breakdown.uncertainty * 100,
          )}%`}
        >
          <div className="flex h-full w-full items-center justify-center rounded-full bg-[#0b0710] text-xs text-[#d8cde6]">
            {percent}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-[#b8aec5]">
        <span>{breakdown.plans} plans</span>
        <span>{breakdown.blockers} blockers</span>
        <span>{Math.round(breakdown.uncertainty * 100)}% unsure</span>
      </div>
    </section>
  );
}
