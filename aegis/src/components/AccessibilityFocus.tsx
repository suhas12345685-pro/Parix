import { EmptyState } from "./EmptyState";

interface FocusedElement {
  role: string;
  name: string;
  state: string[];
}

interface Props {
  accessibility: {
    focusedApp: string;
    backendUsed: string;
    confidence: number;
    ts: number;
    focusedElement: FocusedElement | null;
  } | null;
}

const BACKEND_LABEL: Record<string, string> = {
  uiautomation: "UIAutomation (Win)",
  axapi: "AX API (macOS)",
  atspi: "AT-SPI (Linux)",
  vision: "Vision/OCR",
  fused: "Hybrid (a11y + vision)",
  none: "None",
};

export function AccessibilityFocus({ accessibility }: Props) {
  if (!accessibility) {
    return (
      <section className="rounded-lg border border-purple-400/15 bg-[#120b18]/70 p-4">
        <div className="text-xs uppercase tracking-wide text-[#8f82a0]">
          Accessibility
        </div>
        <EmptyState
          title="No accessibility snapshot yet"
          detail="Hands hasn't sent one. The poller emits on UI focus change."
        />
      </section>
    );
  }

  const { focusedApp, backendUsed, confidence, focusedElement } = accessibility;
  const confidencePct = Math.round(
    Math.max(0, Math.min(1, confidence)) * 100,
  );
  const backendLabel = BACKEND_LABEL[backendUsed] ?? backendUsed;

  return (
    <section className="rounded-lg border border-purple-400/15 bg-[#120b18]/70 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-[#8f82a0]">
          Accessibility
        </div>
        <span className="text-xs text-[#b8aec5]">{backendLabel}</span>
      </div>

      <div className="mt-3 min-h-[2.5rem] text-sm font-medium text-white">
        {focusedApp || "(no focused app)"}
      </div>

      {focusedElement ? (
        <div className="mt-2 rounded-md bg-[#1c1126]/70 px-3 py-2 text-xs text-[#b8aec5]">
          <div className="flex items-center justify-between">
            <span className="font-mono uppercase tracking-wide text-fuchsia-300">
              {focusedElement.role || "element"}
            </span>
            {focusedElement.state.length > 0 ? (
              <span className="text-[10px] text-[#8f82a0]">
                {focusedElement.state.join(" · ")}
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate text-white">
            {focusedElement.name || "(unnamed)"}
          </div>
        </div>
      ) : (
        <div className="mt-2 text-xs text-[#8f82a0]">
          No focused element reported
        </div>
      )}

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs text-[#a99bb9]">
          <span>Snapshot confidence</span>
          <span>{confidencePct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#24162f]">
          <div
            className="h-full rounded-full bg-fuchsia-300"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>
    </section>
  );
}
