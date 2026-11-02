"use client";

import { useMemo } from "react";
import { enableStudioDevValidations } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { buildStudioData, initialReport, payoutTheme, type AnalyticsData } from "./studio.js";

if (process.env.NODE_ENV !== "production") {
  enableStudioDevValidations();
}

export function StudioView({ data }: { data: AnalyticsData }) {
  const studioData = useMemo(() => buildStudioData(data), [data]);

  return (
    <AgStudioProvider licenseKey={data.licenseKey ?? undefined}>
      <div className="h-[calc(100dvh-260px)] min-h-[680px] overflow-hidden rounded-[22px]">
        <AgStudio style={{ height: "100%", width: "100%" }} data={studioData} initialState={initialReport} theme={payoutTheme} mode="view" />
      </div>
    </AgStudioProvider>
  );
}
