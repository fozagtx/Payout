"use client";

import { useEffect, useState } from "react";
import { api, type User } from "./api.js";

export type MeState = { status: "loading" } | { status: "signed-in"; user: User } | { status: "signed-out" };

/** Asks the server who is signed in (cookie session). Never throws. */
export function useMe(): MeState {
  const [state, setState] = useState<MeState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    void api<{ user: User }>("/api/me").then((result) => {
      if (!alive) return;
      setState(result.ok && result.data?.user ? { status: "signed-in", user: result.data.user } : { status: "signed-out" });
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
