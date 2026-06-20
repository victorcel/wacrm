"use client";

import Image from "next/image";

import { useTheme } from "@/hooks/use-theme";

/**
 * The TRAFIKOS wordmark is two-tone by design (teal letters, black
 * "IK") — the black ink disappears against dark surfaces, so dark
 * mode swaps in a variant with that ink recolored to white.
 */
export function BrandWordmark({ className }: { className?: string }) {
  const { mode } = useTheme();
  return (
    <Image
      src={mode === "dark" ? "/brand/wordmark-dark.png" : "/brand/wordmark-teal.png"}
      alt="TRAFIKOS"
      width={150}
      height={40}
      className={className ?? "mx-auto block h-9 w-auto"}
      priority
    />
  );
}
