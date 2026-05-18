import type React from "react";

interface Props {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, detail, action }: Props) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-purple-400/20 bg-[#100817]/55 px-5 py-8 text-center">
      <div className="max-w-md">
        <div className="text-sm font-semibold text-white">{title}</div>
        {detail && (
          <div className="mt-1 text-sm leading-6 text-[#9d91ad]">{detail}</div>
        )}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
