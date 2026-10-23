"use client";

import { useEffect, useState } from "react";
import { api, type User } from "./api.js";

export type MeState = { status: "loading" } | { status: "signed-in"; user: User } | { status: "signed-out" };

// One request per page load, shared by every component that asks.
let pending: Promise<MeState> | null = null;
function fetchMe(): Promise<MeState> {
  pending ??= api<{ user: User }>("/api/me").then((result): MeState =>
    result.ok && result.data?.user ? { status: "signed-in", user: result.data.user } : { status: "signed-out" },
  );
  return pending;
}

/** Asks the server who is signed in (cookie session). Never throws. */
export function useMe(): MeState {
  const [state, setState] = useState<MeState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    void fetchMe().then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
