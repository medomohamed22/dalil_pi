"use client";

import { LazyMotion } from "framer-motion";

/** Animations load their engine after first paint (~30 kB less JavaScript up front). */
const features = () => import("@/lib/motion-features").then((r) => r.default);

export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={features} strict>
      {children}
    </LazyMotion>
  );
}
