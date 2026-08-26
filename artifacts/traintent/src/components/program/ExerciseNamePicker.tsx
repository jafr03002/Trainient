import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Dumbbell, Info } from "lucide-react";
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
  // The exercise whose detail side is showing, if any. The popover has two
  // sides: the list, and this. List state is left alone while it's set, so
  // going back lands on the same search results or expanded group.
  const [detail, setDetail] = useState<LibraryExercise | null>(null);
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
    setDetail(null);
    inputRef.current?.focus();
  }

  function handleChange(next: string) {
    onChange(next);
    setHighlight(0);
    setDetail(null);
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
    setDetail(null);
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
      // Closing is Radix's to do, from the capture-phase document listener
      // that has already run by the time this fires - see onEscapeKeyDown
      // below, which is also where the detail side is stepped back from.
      // Closing here as well would undo that step back, since the state it
      // reads has been cleared a moment earlier in the same keystroke.
      //
      // All that's left is to swallow the key so the surrounding editor
      // doesn't also treat it as a cancel - dismissing the suggestions leaves
      // the typed text alone.
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // The detail side has no rows, so there's nothing to move through or pick.
    if (detail) return;
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
      // A row carries two separate actions - pick the exercise, or look it up -
      // so it's a wrapper around two buttons rather than one button. The
      // wrapper holds the highlight state the arrow keys and the
      // scroll-into-view effect read.
      <div
        key={`${item.muscle}-${item.name}`}
        onMouseEnter={() => setHighlight(i)}
        data-highlighted={i === highlight}
        className={`w-full flex items-center transition-colors ${
          i === highlight ? "bg-secondary/70 text-foreground" : "text-foreground/90"
        }`}
      >
        <button
          type="button"
          // Without this the input blurs on press and the popover closes before
          // the click ever lands.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => choose(item)}
          className={`flex-1 min-w-0 flex items-center gap-2 py-2.5 pr-2 text-left text-sm ${
            // Indented under its group header so the nesting is legible.
            nested ? "pl-9" : "pl-3"
          }`}
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
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setDetail(item)}
          // Solid rather than translucent: at 60% the circle all but vanishes
          // against the popover and only the icon reads.
          className="shrink-0 mr-2 w-6 h-6 grid place-items-center rounded-full bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title={`About ${item.name}`}
          aria-label={`About ${item.name}`}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setBrowsing(false);
          setDetail(null);
        }
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
        // Radix runs this from a capture-phase document listener, ahead of the
        // input's own key handler - so this is the one place that still sees
        // the detail side as showing, and the only place the step back to the
        // list can be taken. Leaving it unprevented is what closes the popover
        // normally.
        onEscapeKeyDown={(e) => {
          if (!detail) return;
          e.preventDefault();
          setDetail(null);
        }}
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
        {detail ? (
          // The library's other side. It's a placeholder for now - what earns
          // the info button its place is somewhere to put per-exercise guidance later,
          // so this side exists and navigates before it has anything to say.
          <div className="p-3">
            <div className="flex items-start gap-2">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setDetail(null)}
                className="shrink-0 -ml-1 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                title="Back to the exercise list"
                aria-label="Back to the exercise list"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="shrink-0 w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: MUSCLE_COLORS[detail.muscle] }}
                  />
                  <span className="flex-1 min-w-0 truncate text-sm font-medium text-foreground">
                    {detail.name}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{detail.muscle}</p>
              </div>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              Exercise details are coming soon.
            </p>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(detail)}
              className="mt-3 w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Use this exercise
            </button>
          </div>
        ) : (
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
        )}
      </PopoverContent>
    </Popover>
  );
}
