import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Dumbbell } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { MUSCLE_COLORS } from "@/lib/muscles";
import {
  EXERCISE_LIBRARY,
  LIBRARY_GROUPS,
  searchExercises,
  type LibraryExercise,
  type MuscleOption,
} from "@/lib/exerciseLibrary";

type Props = {
  value: string;
  /** Free text as typed - the field stays writable, the library only assists. */
  onChange: (name: string) => void;
  /** A library entry was chosen, so the primary muscle is known too. */
  onPick: (exercise: LibraryExercise) => void;
  invalid?: boolean;
  maxLength?: number;
  testId?: string;
};

// Typing one or two characters matches too much of the library to be useful as
// a suggestion list, so suggestions hold off until there's something to narrow.
const MIN_QUERY = 2;

/**
 * The program builder's exercise name field: a plain text input that also
 * suggests from the exercise library.
 *
 * The input is always the source of truth - anything typed saves as-is, whether
 * or not it's in the library. Choosing a suggestion additionally reports the
 * exercise's primary muscle so the caller can fill that dropdown in.
 *
 * Suggestions arrive two ways: typing narrows the library by relevance, while
 * the dumbbell button opens it as collapsed muscle groups to drill into. The
 * whole library is ~100 entries, which is far too many to dump into one list.
 */
export function ExerciseNamePicker({ value, onChange, onPick, invalid, maxLength, testId }: Props) {
  const [open, setOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  // Which muscle group is expanded while browsing. One at a time keeps the
  // popover short instead of unrolling the entire library at once.
  const [openGroup, setOpenGroup] = useState<MuscleOption | null>(null);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Whatever the arrow keys can currently land on: the ranked matches while
  // typing, or the expanded group's exercises while browsing.
  const items = useMemo(() => {
    if (!browsing) return searchExercises(value);
    if (!openGroup) return [];
    return EXERCISE_LIBRARY[openGroup].map((name) => ({ name, muscle: openGroup }));
  }, [browsing, value, openGroup]);

  // Keep the highlighted row in view when it moves off the scrolled area.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, highlight, items]);

  function choose(exercise: LibraryExercise) {
    onPick(exercise);
    setOpen(false);
    setBrowsing(false);
    inputRef.current?.focus();
  }

  function handleChange(next: string) {
    onChange(next);
    setHighlight(0);
    // Typing leaves browse mode - the list becomes the ranked matches for what's
    // now in the box. With nothing to suggest the popover gets out of the way
    // entirely rather than hanging around empty over a custom exercise name.
    setBrowsing(false);
    setOpen(next.trim().length >= MIN_QUERY && searchExercises(next).length > 0);
  }

  function openBrowse() {
    setBrowsing(true);
    // Start with every group closed so the popover opens as a short list of
    // muscle groups rather than the whole library.
    setOpenGroup(null);
    setHighlight(0);
    setOpen(true);
    inputRef.current?.focus();
  }

  function toggleGroup(muscle: MuscleOption) {
    setOpenGroup((g) => (g === muscle ? null : muscle));
    setHighlight(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (!open) return;
      // Swallow it so the surrounding editor doesn't also treat this as a
      // cancel - closing the suggestions leaves the typed text alone.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setBrowsing(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!open) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          openBrowse();
        }
        return;
      }
      if (items.length === 0) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => (h + step + items.length) % items.length);
      return;
    }
    if (e.key === "Enter" && open && items[highlight]) {
      e.preventDefault();
      choose(items[highlight]);
      return;
    }
    if (e.key === "Tab" && open) {
      setOpen(false);
      setBrowsing(false);
    }
  }

  function renderRow(item: LibraryExercise, i: number, nested = false) {
    return (
      <button
        key={`${item.muscle}-${item.name}`}
        type="button"
        // Without this the input blurs on press and the popover closes before
        // the click ever lands.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => choose(item)}
        onMouseEnter={() => setHighlight(i)}
        data-highlighted={i === highlight}
        className={`w-full flex items-center gap-2 py-2.5 pr-3 text-left text-sm transition-colors ${
          // Indented under its group header so the nesting is legible.
          nested ? "pl-9" : "pl-3"
        } ${i === highlight ? "bg-secondary/70 text-foreground" : "text-foreground/90"}`}
      >
        {!nested && (
          <span
            className="shrink-0 w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: MUSCLE_COLORS[item.muscle] }}
          />
        )}
        <span className="flex-1 min-w-0 truncate">{item.name}</span>
        {/* Browse mode already says the muscle in the section header; in search
            results it's what tells two same-named entries apart (dips are both
            a chest and a triceps exercise). */}
        {!browsing && (
          <span className="shrink-0 text-[11px] text-muted-foreground">{item.muscle}</span>
        )}
      </button>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setBrowsing(false);
      }}
    >
      <PopoverAnchor asChild>
        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={maxLength}
            placeholder="Exercise name"
            autoComplete="off"
            className={`w-full min-w-0 pl-3 pr-9 py-1.5 rounded-lg border bg-secondary/20 text-foreground text-sm focus:outline-none focus:border-primary placeholder:text-muted-foreground ${
              invalid ? "border-destructive" : "border-border"
            }`}
            data-testid={testId}
          />
          {/* Sits inside the field's right edge: the row already carries three
              icon buttons, and a fourth one alongside them squeezes the name
              field on a phone. */}
          <button
            type="button"
            onClick={() => (open && browsing ? setOpen(false) : openBrowse())}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            title="Browse exercise library"
            aria-label="Browse exercise library"
            data-testid={testId ? `${testId}-library` : undefined}
          >
            <Dumbbell className="w-3.5 h-3.5" />
          </button>
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={4}
        // Focus stays in the text field so the list narrows as the user keeps
        // typing - the popover is a suggestion surface, not a modal.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        collisionPadding={12}
        // Matches the field on desktop, but with a floor: on a phone the name
        // input is only ~120px between the index badge and the three row
        // buttons, which truncates every suggestion to "Dumbbell ...". Capped
        // at the viewport so the wider list still can't cause a sideways scroll.
        //
        // Explicit var(): the bare `w-[--custom-prop]` shorthand silently
        // resolves to nothing here and the list collapses to its content width.
        className="w-[max(var(--radix-popover-trigger-width),18rem)] max-w-[calc(100vw-1.5rem)] p-0 overflow-hidden"
      >
        <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
          {browsing
            ? LIBRARY_GROUPS.map(({ muscle, names }) => {
                const expanded = openGroup === muscle;
                return (
                  <div key={muscle}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggleGroup(muscle)}
                      aria-expanded={expanded}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                        expanded ? "bg-secondary/40 text-foreground" : "text-foreground/90 hover:bg-secondary/25"
                      }`}
                    >
                      <ChevronRight
                        className={`w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform ${
                          expanded ? "rotate-90" : ""
                        }`}
                      />
                      <span
                        className="shrink-0 w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: MUSCLE_COLORS[muscle] }}
                      />
                      <span className="flex-1 min-w-0 truncate font-medium">{muscle}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                        {names.length}
                      </span>
                    </button>
                    {expanded &&
                      names.map((name, i) => renderRow({ name, muscle }, i, true))}
                  </div>
                );
              })
            : items.map((item, i) => renderRow(item, i))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
