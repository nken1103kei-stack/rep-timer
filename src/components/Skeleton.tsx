import { motion } from "motion/react";

/** Mirrors the home layout box for box, so the swap to real content does not jump. */
export function Skeleton() {
  return (
    <motion.div
      data-testid="skeleton"
      aria-busy="true"
      aria-label="読み込み中"
      className="mx-auto min-h-dvh max-w-md px-4"
      exit={{ opacity: 0, filter: "blur(6px)" }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex h-16 items-center justify-between pt-[env(safe-area-inset-top)]">
        <div className="skeleton h-7 w-24 rounded-lg" />
        <div className="flex gap-2">
          <div className="skeleton size-10 rounded-full" />
          <div className="skeleton size-10 rounded-full" />
        </div>
      </div>
      <div className="glass mb-3 flex flex-col items-center gap-2 rounded-[24px] px-5 pt-3.5 pb-3">
        <div className="skeleton h-3 w-36 rounded-md" />
        <div className="skeleton h-5 w-64 rounded-md" />
        <div className="skeleton h-5 w-44 rounded-md" />
        <div className="skeleton h-3 w-32 rounded-md" />
      </div>
      <div className="glass rounded-[28px] p-4">
        <div className="flex gap-2">
          {[64, 56, 60, 52].map((w, i) => (
            <div key={i} className="skeleton h-10 rounded-full" style={{ width: w }} />
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between">
          <div className="space-y-2">
            <div className="skeleton h-14 w-44 rounded-xl" />
            <div className="skeleton h-4 w-28 rounded-md" />
          </div>
          <div className="skeleton size-20 rounded-full" />
        </div>
      </div>
      <div className="mt-7 flex items-center justify-between">
        <div className="skeleton h-6 w-24 rounded-lg" />
        <div className="skeleton size-10 rounded-full" />
      </div>
      <div className="mt-3 space-y-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="glass flex h-[76px] items-center gap-3 rounded-[22px] px-4">
            <div className="skeleton h-10 w-1.5 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-32 rounded-md" />
              <div className="skeleton h-3 w-24 rounded-md" />
            </div>
            <div className="skeleton size-6 rounded-md" />
          </div>
        ))}
      </div>
    </motion.div>
  );
}
