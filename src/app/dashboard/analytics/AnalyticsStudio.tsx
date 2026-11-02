"use client";

import NextDynamicModule from "next/dynamic.js";
import { useCallback, useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { api } from "@/components/api.js";
import { Button } from "@/components/Button.js";
import { Card } from "@/components/Card.js";
import { Link } from "@/components/Link.js";
import type { AnalyticsData } from "./studio.js";

// next/dynamic is CommonJS; under NodeNext resolution its function sits on `.default`.
const dynamicModule = NextDynamicModule as unknown as typeof NextDynamicModule & { default?: typeof NextDynamicModule };
const dynamic = (dynamicModule.default ?? dynamicModule) as unknown as (typeof import("next/dynamic.js"))["default"];

const StudioView = dynamic(() => import("./StudioView.js").then((module) => module.StudioView), {
  ssr: false,
  loading: () => <StudioSkeleton />,
});

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: AnalyticsData };

function StudioSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-6" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-cream" />)}
      <div className="col-span-2 h-72 animate-pulse rounded-2xl bg-cream sm:col-span-4" />
      <div className="col-span-2 h-72 animate-pulse rounded-2xl bg-cream" />
    </div>
  );
}

export function AnalyticsStudio() {
  const [state, setState] = useState<State>({ status: "loading" });
  const load = useCallback(async () => {
    setState({ status: "loading" });
    const result = await api<AnalyticsData>("/api/analytics");
    if (result.ok) setState({ status: "ready", data: result.data });
    else setState({ status: "error", message: result.message });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") return <StudioSkeleton />;
  if (state.status === "error") {
    return (
      <Card className="px-6 py-10 text-center">
        <p className="text-sm text-ink-soft">{state.message}</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => void load()}>
          Try again
        </Button>
      </Card>
    );
  }

  const { data } = state;
  if (data.orders.length === 0 && data.watches.length === 0) {
    return (
      <Card className="px-6 py-12 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-tan text-ink">
          <BarChart3 className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-ink-900">No data to chart yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
          Analytics fills in from your PayPal orders, refunds, disputes and price watches. Place an order from the shop or Claude to see it here.
        </p>
        <Link href="/dashboard/shop" className="mt-5 inline-flex rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink">
          Open the shop
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <StudioView data={data} />
    </div>
  );
}
