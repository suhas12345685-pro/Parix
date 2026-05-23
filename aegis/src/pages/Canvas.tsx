import type { CanvasState } from "../types";

interface CanvasProps {
  canvas?: CanvasState | null;
}

/**
 * Agent-driven Canvas — a live document Parix writes and updates. The agent
 * pushes content via a `canvas` task; it streams here over CANVAS_UPDATE.
 */
export function Canvas({ canvas }: CanvasProps) {
  if (!canvas || !canvas.content.trim()) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500/30 to-fuchsia-700/30 text-2xl">
            ▦
          </div>
          <h2 className="text-lg font-semibold text-[#f8f2ff]">Canvas is empty</h2>
          <p className="mt-2 text-sm text-[#b9a8cf]">
            Ask Parix to draft a document, plan, report, or table — e.g.
            <span className="text-pink-300"> “draft a launch checklist on the canvas”</span>.
            It appears here live and updates as the agent works.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-baseline justify-between border-b border-pink-400/15 pb-3">
        <h2 className="text-xl font-semibold text-[#f8f2ff]">{canvas.title}</h2>
        <span className="text-xs text-[#8b7aa6]">
          updated {new Date(canvas.updatedAt).toLocaleTimeString()}
        </span>
      </div>
      <article className="flex-1 overflow-auto rounded-xl border border-pink-400/10 bg-[#0c0612]/60 p-6">
        <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-relaxed text-[#e8def8]">
          {canvas.content}
        </pre>
      </article>
    </div>
  );
}
