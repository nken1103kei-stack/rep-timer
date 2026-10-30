import { motion } from "motion/react";
import { CalendarDays, User as UserIcon } from "lucide-react";
import { useSession } from "../lib/sync";

const dot = { off: "", syncing: "bg-ready animate-pulse", synced: "bg-go", error: "bg-danger" } as const;

export function Header({ onAccount, onCalendar }: { onAccount: () => void; onCalendar: () => void }) {
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
