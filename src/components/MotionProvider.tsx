"use client";

import { LazyMotion, MotionConfig } from "framer-motion";

/** Animations load their engine after first paint (~30 kB less JavaScript up front). */
const features = () => import("@/lib/motion-features").then((r) => r.default);

export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={features} strict>
      {/* Honors the phone's "reduce motion" setting: movement off, fades kept. */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
