import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Dumbbell, RefreshCw } from "lucide-react";
import { pickQuote, QUOTE_COLORS } from "../lib/quotes";
import { haptic } from "../lib/feedback";
import { spring } from "./ui";

/** Today's parody quote: random on every open, tap for another. */
export function QuoteCard() {
  const [quote, setQuote] = useState(() => pickQuote(null));
  const [spins, setSpins] = useState(0);
  const color = QUOTE_COLORS[quote.category];

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      aria-label="別の名言を表示"
      data-testid="quote-card"
      data-quote-id={quote.id}
      onClick={() => {
        haptic(8);
        setSpins((n) => n + 1);
        setQuote((q) => pickQuote(q.id));
      }}
      className="glass sheen relative mb-3 block w-full overflow-hidden rounded-[24px] px-5 pt-3.5 pb-3 text-center"
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -top-10 left-1/2 size-28 -translate-x-1/2 rounded-full blur-2xl"
        animate={{ backgroundColor: `${color}33` }}
        transition={{ duration: 0.5 }}
      />
      <motion.span
        aria-hidden
        animate={{ rotate: spins * 180 }}
        transition={spring}
        className="absolute top-3 right-3 text-slate-400"
      >
        <RefreshCw size={14} strokeWidth={2.4} />
      </motion.span>

      <span className="relative flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-wide text-mute">
        <Dumbbell size={14} strokeWidth={2.4} className="text-ink" />
        本日の筋トレ偉人の名言
      </span>

      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={quote.id}
          className="relative block"
          initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
          transition={{ duration: 0.22 }}
        >
          <span
            data-testid="quote-text"
            className="mt-1.5 flex min-h-[46px] items-center justify-center text-[16px] leading-snug font-extrabold text-balance [word-break:auto-phrase]"
          >
            「{quote.quote}」
          </span>
          <span className="mt-1 block text-xs font-bold text-ink/70" data-testid="quote-name">
            — {quote.name} —
          </span>
        </motion.span>
      </AnimatePresence>

      <span className="relative mt-1 block text-[9px] font-semibold text-slate-400">※フィクション・名言パロディ</span>
    </motion.button>
  );
}
