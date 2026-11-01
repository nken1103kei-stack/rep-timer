import { motion } from "motion/react";
import { CalendarDays, User as UserIcon } from "lucide-react";
import { usePro, useSession } from "../lib/sync";
import { Check, Crown } from "lucide-react";

const dot = { off: "", syncing: "bg-ready animate-pulse", synced: "bg-go", error: "bg-danger" } as const;

export function Header({ onAccount, onCalendar, onPro }: { onAccount: () => void; onCalendar: () => void; onPro: () => void }) {
  const pro = usePro();
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  return (
    <header className="flex h-16 items-center justify-between pt-[env(safe-area-inset-top)]">
      <div className="font-display text-[28px] leading-none font-extrabold tracking-tight italic">
        REPS<span className="text-accent">.</span>
      </div>
      <div className="flex gap-2">
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={onPro}
          aria-label={pro ? "REPS Pro 加入済み" : "REPS Pro に加入する"}
          data-testid="pro-button"
          data-pro={pro}
          className={`flex h-10 items-center gap-1 rounded-full px-3 text-xs font-extrabold tracking-wider ${
            pro ? "bg-gradient-to-r from-[#ff4f00] to-[#ff9f0a] text-white shadow-[0_8px_20px_-8px_rgb(255_79_0/0.8)]" : "glass text-ink"
          }`}
        >
          <Crown size={14} strokeWidth={2.6} />
          PRO
          {/* Spelled out so the plan is clear at a glance, not only by colour. */}
          {pro ? (
            <span className="ml-0.5 flex items-center gap-0.5 rounded-full bg-white/25 py-0.5 pr-1.5 pl-1 text-[10px] tracking-normal" data-testid="pro-joined">
              <Check size={11} strokeWidth={3.5} />
              加入済み
            </span>
          ) : (
            <span className="ml-0.5 text-[10px] tracking-normal text-mute">未加入</span>
          )}
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={onCalendar}
          aria-label="カレンダー"
          data-testid="calendar-button"
          className="glass grid size-10 place-items-center rounded-full"
        >
          <CalendarDays size={18} strokeWidth={2.4} />
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={onAccount}
          aria-label="アカウント"
          data-testid="account-button"
          className="glass relative grid size-10 place-items-center rounded-full"
        >
          {user?.picture ? (
            <img src={user.picture} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full" />
          ) : (
            <UserIcon size={18} strokeWidth={2.4} />
          )}
          {user && status !== "off" && (
            <span className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-white ${dot[status]}`} />
          )}
        </motion.button>
      </div>
    </header>
  );
}
