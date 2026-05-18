import { useState } from "react";
import type { AuditEntry } from "../types";

interface Props {
  entries: AuditEntry[];
  onExplain: (taskId: string) => void;
}

export function AuditTrail({ entries, onExplain }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-100">Audit Trail</h1>
        <span className="text-sm text-gray-500">
          {entries.length} entries (SHA-256 chained)
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="card flex items-center justify-center py-16 text-sm text-gray-600">
          No audit entries yet. Actions will appear here.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="card cursor-pointer transition-colors hover:border-gray-700"
              onClick={() =>
                setExpanded(expanded === entry.id ? null : entry.id)
              }
            >
              <div className="flex items-center gap-3">
                {/* Action icon */}
                <div className={`flex-shrink-0 ${actionColor(entry.action)}`}>
                  {actionIcon(entry.action)}
                </div>

                {/* Main content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-gray-200">
                      {entry.action}
                    </span>
                    <span className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-400">
                      {entry.actor}
                    </span>
                  </div>
                  {entry.taskId && (
                    <div className="mt-0.5 font-mono text-xs text-gray-500">
                      task: {entry.taskId.slice(0, 12)}...
                    </div>
                  )}
                </div>

                {/* Timestamp + explain */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">
                    {entry.ts ? new Date(entry.ts).toLocaleTimeString() : ""}
                  </span>
                  {entry.taskId && entry.action.startsWith("execute:") && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onExplain(entry.taskId!);
                      }}
                      className="rounded bg-parix-700/20 px-2 py-0.5 text-xs text-parix-400 transition-colors hover:bg-parix-700/40"
                    >
                      Why?
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded detail */}
              {expanded === entry.id && (
                <div className="mt-3 border-t border-gray-800 pt-3">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-gray-500">Hash:</span>
                      <div className="mt-0.5 font-mono text-gray-400 break-all">
                        {entry.thisHash}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Prev Hash:</span>
                      <div className="mt-0.5 font-mono text-gray-400 break-all">
                        {entry.prevHash}
                      </div>
                    </div>
                  </div>
                  {entry.payload && (
                    <div className="mt-2">
                      <span className="text-xs text-gray-500">Payload:</span>
                      <pre className="mt-1 max-h-32 overflow-auto rounded bg-gray-900 p-2 font-mono text-xs text-gray-400">
                        {JSON.stringify(entry.payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function actionColor(action: string): string {
  if (action.startsWith("execute:")) return "text-blue-400";
  if (action === "success") return "text-green-400";
  if (action === "failure" || action === "error") return "text-red-400";
  if (action === "pause") return "text-yellow-400";
  if (action === "resume") return "text-green-400";
  return "text-gray-400";
}

function actionIcon(action: string): string {
  if (action.startsWith("execute:")) return ">";
  if (action === "success") return "OK";
  if (action === "failure" || action === "error") return "X";
  if (action === "pause") return "II";
  if (action === "resume") return ">";
  return ".";
}
