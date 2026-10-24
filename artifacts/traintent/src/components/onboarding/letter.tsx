import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

// The "Coach's letter" kit shared by everything between program generation and
// the navigation tour: the presentation deck, the start-day screen and the
// calibration walkthrough. Each page opens with one sentence built from the
// client's data - facts (wrapped in <b>) read white, the words between grey.

export function Say({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`font-light tracking-[-0.02em] text-muted-foreground [&_b]:font-light [&_b]:text-foreground ${className}`}>
      {children}
    </p>
  );
}

// A plain title saying what the page shows, with the letter sentence under it.
export function PageHead({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h2 className="text-[34px] font-light leading-[1.08] tracking-[-0.025em] text-foreground">{title}</h2>
      <Say className="mt-3 text-[20px] leading-[1.35]">{children}</Say>
    </>
  );
}

// The full storm wash only bookends a flow (its first and last page); the
// pages between get the colourless one.
export function LetterWash({ bookend }: { bookend: boolean }) {
  return (
    <div
      className={`absolute inset-x-0 top-0 ${bookend ? "sessions-wash h-[560px]" : "sessions-wash-mono h-[440px]"}`}
      aria-hidden
    />
  );
}

// One white pill pinned in thumb reach, with a round Back beside it when there
// is somewhere to go back to.
export function LetterDock({
  label,
  onNext,
  onBack,
  disabled,
  nextTestId,
  backTestId,
  children,
}: {
  label: ReactNode;
  onNext: () => void;
  onBack?: () => void;
  disabled?: boolean;
  nextTestId?: string;
  backTestId?: string;
  children?: ReactNode;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-b from-transparent via-background/90 to-background px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-10">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center gap-2.5">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back"
              className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-card text-foreground"
              data-testid={backTestId}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.6} />
            </button>
          )}
          <button
            onClick={onNext}
            disabled={disabled}
            className="h-[52px] min-w-0 flex-1 rounded-full bg-primary text-sm font-semibold uppercase tracking-[0.06em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            data-testid={nextTestId}
          >
            {label}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageDots({ count, index, onSelect }: { count: number; index: number; onSelect?: (i: number) => void }) {
  return (
    <div className="flex gap-1.5" aria-label={`Page ${index + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => {
        const cls = `h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-1.5 bg-secondary"}`;
        return onSelect ? (
          <button key={i} onClick={() => onSelect(i)} aria-label={`Page ${i + 1}`} className={cls} />
        ) : (
          <span key={i} className={cls} />
        );
      })}
    </div>
  );
}
