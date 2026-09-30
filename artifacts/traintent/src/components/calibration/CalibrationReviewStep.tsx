import { addDays } from "@/lib/calibration";
import { phaseSolid } from "@/lib/phaseColors";

const MAX_WINDOW_DAYS = 21;
const REVIEW_FROM_DAY = 8;
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The calibration window's real end isn't known yet when this step is shown (it
// depends on later check-ins), so the mini calendar always renders the full
// possible range (the 21-day cap) rather than however many program weeks have
// been generated so far - only the day-8-onward "review possible" zone is
// meaningful right now.
export function CalibrationReviewStep({ calibrationStart, today }: { calibrationStart: Date; today: Date }) {
  const todayDayNumber = Math.round((today.getTime() - calibrationStart.getTime()) / 86_400_000) + 1;

  return (
    <>
      <div>
        <div className="text-[11px] tracking-[0.14em] uppercase text-[hsl(var(--sessions-cyan))] mb-1">Calibration</div>
        <h2 className="text-[34px] font-light leading-[1.08] tracking-[-0.025em] text-foreground mb-2.5">Calibration review</h2>
        <p className="text-[13.5px] text-muted-foreground leading-relaxed">
          Once your form is dialed in and the program feels right, you can request your review
          any day from day 8 onward - whenever you're ready. If nothing happens sooner, it
          happens automatically by day 21.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-normal text-muted-foreground uppercase tracking-[0.12em]">
            Your calibration window
          </h3>
          <span className="text-[11px] text-muted-foreground">Up to 3 weeks</span>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: MAX_WINDOW_DAYS }, (_, i) => {
            const dayNumber = i + 1;
            const date = addDays(calibrationStart, i);
            const reviewable = dayNumber >= REVIEW_FROM_DAY;
            const isToday = dayNumber === todayDayNumber;
            return (
              <div
                key={dayNumber}
                className={`relative flex flex-col items-center justify-center gap-1 h-16 rounded-2xl py-1 ${
                  reviewable
                    ? "bg-[hsl(var(--sessions-cyan)/0.1)] text-[hsl(var(--sessions-cyan))]"
                    : "bg-card text-muted-foreground"
                } ${isToday ? "ring-1 ring-white" : ""}`}
              >
                <span className="text-[8px] uppercase tracking-wide opacity-70 leading-none">
                  {WEEKDAY_SHORT[date.getDay()]}
                </span>
                <span className="text-sm font-light leading-none">{date.getDate()}</span>
                {isToday && (
                  <span className="absolute -top-2 text-[8px] font-semibold px-1.5 rounded-full bg-white text-black">
                    TODAY
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: phaseSolid("calibration") }} />
            Calibration
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--sessions-cyan))]" />
            Review possible
          </div>
        </div>
      </div>
    </>
  );
}
