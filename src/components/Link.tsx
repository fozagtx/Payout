"use client";

import NextLinkModule from "next/link.js";
import type { ComponentProps, ComponentType } from "react";

type LinkProps = Omit<ComponentProps<"a">, "href"> & { href: string; prefetch?: boolean | null; replace?: boolean; scroll?: boolean };

// next/link is CommonJS; under the repo's NodeNext resolution its component sits on `.default`.
const mod = NextLinkModule as unknown as ComponentType<LinkProps> & { default?: ComponentType<LinkProps> };
const NextLink: ComponentType<LinkProps> = mod.default ?? mod;

/** Client-side navigation link (next/link, typed to work under NodeNext). */
export function Link(props: LinkProps) {
  return <NextLink {...props} />;
}
