"use client";

import { useMemo, useState } from "react";
import { enableStudioDevValidations, type AgStudioMode } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { buildStudioData, initialReport, payoutTheme, type AnalyticsData } from "./studio.js";

if (process.env.NODE_ENV !== "production") {
  enableStudioDevValidations();
}

export function StudioView({ data }: { data: AnalyticsData }) {
  const studioData = useMemo(() => buildStudioData(data), [data]);
  const [mode, setMode] = useState<AgStudioMode>("view");

  return (
    <AgStudioProvider licenseKey={data.licenseKey ?? undefined}>
      <div className="mb-3 flex items-center justify-end gap-1 rounded-full border border-line bg-paper p-1 text-sm sm:ml-auto sm:w-fit">
        {(["view", "edit"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            aria-pressed={mode === option}
            className={`rounded-full px-3.5 py-1.5 font-medium ${mode === option ? "bg-ink-900 text-white" : "text-ink-soft hover:bg-ink/5"}`}
          >
            {option === "view" ? "View" : "Edit dashboard"}
          </button>
        ))}
      </div>
      <div className="h-[calc(100dvh-260px)] min-h-[680px] overflow-hidden rounded-[22px]">
        <AgStudio style={{ height: "100%", width: "100%" }} data={studioData} initialState={initialReport} theme={payoutTheme} mode={mode} />
      </div>
    </AgStudioProvider>
  );
}
