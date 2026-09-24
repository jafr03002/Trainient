import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  useGetVolumeProgress,
  useGetStrengthProgress,
  useGetPersonalRecords,
  useGetMuscleVolumeBreakdown,
  useListTrackedExercises,
  useGetBodyweightProgress,
  useGetProfile,
  getGetStrengthProgressQueryKey,
} from "@workspace/api-client-react";
import { ChevronDown, Trophy } from "lucide-react";

// Keys match the MuscleVolumeWeek schema. The volume card is monochrome in the
// Sessions style, so only the labels are needed here, not MUSCLE_COLORS.
const MUSCLE_GROUPS: { key: string; label: string }[] = [
  { key: "chest", label: "Chest" },
  { key: "shoulders", label: "Shoulders" },
  { key: "biceps", label: "Biceps" },
  { key: "triceps", label: "Triceps" },
  { key: "upperBack", label: "Upper Back" },
  { key: "lats", label: "Lats" },
  { key: "quads", label: "Quads" },
  { key: "hamstrings", label: "Hamstrings" },
  { key: "glutes", label: "Glutes" },
  { key: "calves", label: "Calves" },
  { key: "core", label: "Core" },
];

// How many of the ranked muscles get the white "lead" bar.
const LEAD_MUSCLES = 3;
// Weeks shown in the volume card's "All weeks" view.
const VOLUME_HISTORY_WEEKS = 8;

const tooltipStyle = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "16px",
    fontSize: 12,
  },
  labelStyle: { color: "hsl(var(--muted-foreground))" },
  itemStyle: { color: "hsl(var(--foreground))" },
  cursor: { stroke: "hsl(var(--border))" },
};

const CAPS = "text-[11px] uppercase tracking-[0.1em] text-muted-foreground";
const BIG_NUMBER = "text-[28px] font-light leading-none tracking-[-0.02em] whitespace-nowrap";

function isRecent(dateStr: string, days = 7): boolean {
  const then = new Date(dateStr);
  const now = new Date();
  return (now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24) <= days;
}

function shortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// One decimal at most, so 2.5 kg steps survive but float noise doesn't.
function fmt(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function signed(n: number): string {
  if (n > 0) return `+${fmt(n)}`;
  if (n < 0) return `−${fmt(Math.abs(n))}`;
  return "±0";
}

function Section({ title, meta, delay, testId, children }: {
  title: string;
  meta?: ReactNode;
  delay: number;
  testId: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.2 }}
      data-testid={testId}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[21px] font-light tracking-[-0.01em] text-foreground">{title}</h2>
        {meta && <span className="whitespace-nowrap text-[12.5px] text-muted-foreground">{meta}</span>}
      </div>
      {children}
    </motion.section>
  );
}

function CardMessage({ children }: { children: ReactNode }) {
  return <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-muted-foreground">{children}</div>;
}

export default function Progress() {
  const [selectedExercise, setSelectedExercise] = useState("");
  const [volumeView, setVolumeView] = useState<"latest" | "weeks">("latest");

  const exercises = useListTrackedExercises();
  const volumeProgress = useGetVolumeProgress();
  const strengthProgress = useGetStrengthProgress(
    { exercise: selectedExercise },
    { query: { enabled: !!selectedExercise, queryKey: getGetStrengthProgressQueryKey({ exercise: selectedExercise }) } }
  );
  const personalRecords = useGetPersonalRecords();
  const muscleVolume = useGetMuscleVolumeBreakdown();
  const bodyweightProgress = useGetBodyweightProgress();
  const profileQuery = useGetProfile();
  const weightUnit = profileQuery.data?.weightUnit ?? "kg";
  const goalWeight = profileQuery.data?.goalWeight ?? null;

  const recentPrCount = (personalRecords.data ?? []).filter((pr) => isRecent(pr.date, 7)).length;

  // Strength Y-axis: lower ≈ 75% of the lowest weight, upper at the top weight,
  // both snapped to multiples of 5. The axis itself is hidden; this just keeps
  // the line's shape honest instead of recharts zooming into tiny changes.
  const strengthBounds = (() => {
    const data = strengthProgress.data ?? [];
    if (!data.length) return null;
    const weights = data.map((p) => p.maxWeight);
    const lower = Math.max(0, Math.round((Math.min(...weights) * 0.75) / 5) * 5);
    const upper = Math.ceil(Math.max(...weights) / 5) * 5;
    return { lower, upper };
  })();

  // Same snapping on the bodyweight data's own scale - bodyweight moves in much
  // smaller increments. The goal weight is folded into the range too so its
  // reference line is always drawn inside the frame.
  const bodyweightBounds = (() => {
    const data = bodyweightProgress.data ?? [];
    if (!data.length) return null;
    const weights = data.map((p) => p.weight);
    if (goalWeight != null) weights.push(goalWeight);
    const lower = Math.max(0, Math.floor((Math.min(...weights) * 0.98) / 2) * 2);
    const upper = Math.ceil((Math.max(...weights) * 1.02) / 2) * 2;
    return { lower, upper };
  })();

  const strengthData = strengthProgress.data ?? [];
  const strengthFirst = strengthData[0];
  const strengthLast = strengthData[strengthData.length - 1];

  const bodyweightData = bodyweightProgress.data ?? [];
  const bodyweightFirst = bodyweightData[0];
  const bodyweightLast = bodyweightData[bodyweightData.length - 1];
  const toGoal = goalWeight != null && bodyweightLast ? Math.abs(bodyweightLast.weight - goalWeight) : null;

  // Volume: rank the latest week's muscles and compare each with the week before.
  const volumeWeeks = muscleVolume.data ?? [];
  const latestWeek = volumeWeeks[volumeWeeks.length - 1];
  const priorWeek = volumeWeeks[volumeWeeks.length - 2];
  const setsOf = (week: typeof latestWeek | undefined, key: string): number =>
    week ? ((week as unknown as Record<string, number | undefined>)[key] ?? 0) : 0;
  const weekTotal = (week: typeof latestWeek | undefined): number =>
    MUSCLE_GROUPS.reduce((sum, { key }) => sum + setsOf(week, key), 0);
  const rankedMuscles = MUSCLE_GROUPS
    .map(({ key, label }) => ({ key, label, sets: setsOf(latestWeek, key), change: setsOf(latestWeek, key) - setsOf(priorWeek, key) }))
    .filter((m) => m.sets > 0)
    .sort((a, b) => b.sets - a.sets);
  const topSets = rankedMuscles[0]?.sets ?? 0;
  const latestTotal = weekTotal(latestWeek);
  const weeklyTotals = volumeWeeks
    .slice(-VOLUME_HISTORY_WEEKS)
    .map((w) => ({ week: w.week, sets: weekTotal(w) }));

  return (
    <div className="theme-sessions min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl space-y-7 p-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <h1 className="text-[34px] font-light leading-[1.08] tracking-[-0.025em] text-foreground">Progress</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px] text-muted-foreground">
            <span>Strength, volume, bodyweight and records</span>
            {recentPrCount > 0 && (
              <span className="whitespace-nowrap rounded-full bg-[hsl(var(--sessions-cyan)/0.1)] px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-[hsl(var(--sessions-cyan))]">
                {recentPrCount} new PR{recentPrCount > 1 ? "s" : ""} this week
              </span>
            )}
          </div>
        </motion.div>

        {/* Strength */}
        <Section title="Strength" delay={0.05} testId="chart-strength">
          <div className="rounded-[26px] bg-card p-5">
            <div className="relative mb-5">
              <select
                value={selectedExercise}
                onChange={(e) => setSelectedExercise(e.target.value)}
                aria-label="Exercise"
                className="h-12 w-full min-w-0 appearance-none truncate rounded-full bg-secondary pl-5 pr-11 text-sm text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
                data-testid="select-exercise"
              >
                <option value="">Select exercise...</option>
                {(exercises.data ?? []).map((ex) => (
                  <option key={ex} value={ex}>{ex}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.6} />
            </div>

            {!selectedExercise ? (
              <CardMessage>Select an exercise to see strength progress</CardMessage>
            ) : strengthProgress.isLoading ? (
              <CardMessage>Loading...</CardMessage>
            ) : !strengthFirst || !strengthLast ? (
              <CardMessage>No data yet</CardMessage>
            ) : (
              <>
                <div className={CAPS}>Max weight</div>
                <div className="mt-1.5 flex items-end justify-between gap-3">
                  <div className={BIG_NUMBER}>
                    {fmt(strengthLast.maxWeight)}
                    <span className="ml-1 text-sm font-normal tracking-normal text-muted-foreground">{weightUnit}</span>
                  </div>
                  {strengthData.length > 1 && (
                    <div className="min-w-0 truncate text-[12.5px] text-muted-foreground">
                      <span className="font-medium text-foreground">{signed(strengthLast.maxWeight - strengthFirst.maxWeight)} {weightUnit}</span>{" "}
                      since {shortDate(strengthFirst.date)}
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <ResponsiveContainer width="100%" height={130}>
                    <AreaChart data={strengthData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                      <defs>
                        <linearGradient id="strength-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.18} />
                          <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" hide />
                      <YAxis hide domain={[strengthBounds?.lower ?? 0, strengthBounds?.upper ?? "auto"]} />
                      <Tooltip {...tooltipStyle} labelFormatter={(d: string) => shortDate(d)} formatter={(v: number) => [`${v} ${weightUnit}`, "Max weight"]} />
                      <Area
                        type="monotone"
                        dataKey="maxWeight"
                        stroke="hsl(var(--foreground))"
                        strokeWidth={2}
                        fill="url(#strength-fill)"
                        dot={{ r: 2.5, fill: "hsl(var(--card))", stroke: "hsl(var(--foreground))", strokeWidth: 1.5 }}
                        activeDot={{ r: 4.5, fill: "hsl(var(--foreground))" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className={`mt-2 flex justify-between ${CAPS}`}>
                  <span>{shortDate(strengthFirst.date)}</span>
                  <span>{shortDate(strengthLast.date)}</span>
                </div>
              </>
            )}
          </div>
        </Section>

        {/* Bodyweight */}
        <Section title="Bodyweight" delay={0.08} testId="chart-bodyweight">
          <div className="rounded-[26px] bg-card p-5">
            {bodyweightProgress.isLoading ? (
              <CardMessage>Loading...</CardMessage>
            ) : !bodyweightFirst || !bodyweightLast ? (
              <CardMessage>Log today's bodyweight from the dashboard to start tracking</CardMessage>
            ) : (
              <>
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <div className={CAPS}>Current</div>
                    <div className={`mt-1.5 ${BIG_NUMBER}`}>
                      {fmt(bodyweightLast.weight)}
                      <span className="ml-1 text-sm font-normal tracking-normal text-muted-foreground">{weightUnit}</span>
                    </div>
                    {bodyweightData.length > 1 && (
                      <div className="mt-1.5 truncate text-[12.5px] text-muted-foreground">
                        <span className="font-medium text-foreground">{signed(bodyweightLast.weight - bodyweightFirst.weight)} {weightUnit}</span>{" "}
                        since {shortDate(bodyweightFirst.date)}
                      </div>
                    )}
                  </div>
                  {goalWeight != null && (
                    <div className="min-w-0 text-right">
                      <div className="text-[11px] uppercase tracking-[0.1em] text-[hsl(var(--sessions-cyan))]">Goal</div>
                      <div className={`mt-1.5 text-muted-foreground ${BIG_NUMBER}`}>
                        {fmt(goalWeight)}
                        <span className="ml-1 text-sm font-normal tracking-normal">{weightUnit}</span>
                      </div>
                      <div className="mt-1.5 whitespace-nowrap text-[12.5px] text-muted-foreground">
                        {toGoal != null && toGoal >= 0.05 ? `${fmt(toGoal)} ${weightUnit} to go` : "Goal reached"}
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={bodyweightData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                      <defs>
                        <linearGradient id="bodyweight-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.16} />
                          <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" hide />
                      <YAxis hide domain={[bodyweightBounds?.lower ?? 0, bodyweightBounds?.upper ?? "auto"]} />
                      <Tooltip {...tooltipStyle} labelFormatter={(d: string) => shortDate(d)} formatter={(v: number) => [`${v} ${weightUnit}`, "Bodyweight"]} />
                      {goalWeight != null && (
                        <ReferenceLine
                          y={goalWeight}
                          stroke="hsl(var(--sessions-cyan))"
                          strokeWidth={1.5}
                          strokeDasharray="5 5"
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey="weight"
                        stroke="hsl(var(--foreground))"
                        strokeWidth={2}
                        fill="url(#bodyweight-fill)"
                        dot={false}
                        activeDot={{ r: 4.5, fill: "hsl(var(--foreground))" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className={`mt-2 flex justify-between ${CAPS}`}>
                  <span>{shortDate(bodyweightFirst.date)}</span>
                  <span>{shortDate(bodyweightLast.date)}</span>
                </div>
              </>
            )}
          </div>
        </Section>

        {/* Muscle volume */}
        <Section title="Volume by muscle" meta="Sets per week" delay={0.11} testId="chart-muscle-volume">
          <div className="rounded-[26px] bg-card p-5">
            {!latestWeek ? (
              <CardMessage>No data yet</CardMessage>
            ) : (
              <>
                <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {([
                    ["latest", `Week ${latestWeek.week}`],
                    ["weeks", "All weeks"],
                  ] as const).map(([view, label]) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => setVolumeView(view)}
                      aria-pressed={volumeView === view}
                      className={`shrink-0 whitespace-nowrap rounded-full px-[18px] py-2.5 text-sm transition-colors ${
                        volumeView === view
                          ? "bg-white font-medium text-black"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="mb-5 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <div className={CAPS}>Total sets</div>
                    <div className={`mt-1.5 ${BIG_NUMBER}`}>
                      {latestTotal}
                      <span className="ml-1 text-sm font-normal tracking-normal text-muted-foreground">sets</span>
                    </div>
                  </div>
                  {priorWeek && (
                    <div className="min-w-0 truncate text-[12.5px] text-muted-foreground">
                      <span className={`font-medium ${latestTotal > weekTotal(priorWeek) ? "text-[hsl(var(--sessions-cyan))]" : "text-foreground"}`}>
                        {signed(latestTotal - weekTotal(priorWeek))}
                      </span>{" "}
                      vs week {priorWeek.week}
                    </div>
                  )}
                </div>

                {volumeView === "latest" ? (
                  <ul className="space-y-3">
                    {rankedMuscles.map((m, i) => (
                      <li key={m.key} className="flex items-center gap-3">
                        <span className="w-[88px] shrink-0 truncate text-[13px] text-foreground">{m.label}</span>
                        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary">
                          <span
                            className={`block h-full rounded-full ${i < LEAD_MUSCLES ? "bg-foreground" : "bg-muted-foreground/50"}`}
                            style={{ width: `${topSets ? (m.sets / topSets) * 100 : 0}%` }}
                          />
                        </span>
                        <span className="w-6 shrink-0 text-right text-[13px] text-foreground">{m.sets}</span>
                        <span className={`w-7 shrink-0 text-right text-[11.5px] ${m.change > 0 ? "text-[hsl(var(--sessions-cyan))]" : "text-muted-foreground"}`}>
                          {priorWeek ? signed(m.change) : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ResponsiveContainer width="100%" height={170}>
                    <BarChart data={weeklyTotals} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                      <XAxis
                        dataKey="week"
                        tickFormatter={(v) => `Wk ${v}`}
                        tick={{ fontSize: 10.5, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis hide />
                      <Tooltip {...tooltipStyle} cursor={{ fill: "hsl(var(--secondary))" }} labelFormatter={(v) => `Week ${v}`} formatter={(v: number) => [`${v} sets`, "Total"]} />
                      <Bar dataKey="sets" radius={[10, 10, 10, 10]} maxBarSize={34}>
                        {weeklyTotals.map((w, i) => (
                          <Cell
                            key={w.week}
                            fill={i === weeklyTotals.length - 1 ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
                            fillOpacity={i === weeklyTotals.length - 1 ? 1 : 0.35}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </>
            )}
          </div>
        </Section>

        {/* Personal records */}
        <Section
          title="Personal records"
          meta={personalRecords.data?.length ? `${personalRecords.data.length} lift${personalRecords.data.length > 1 ? "s" : ""}` : undefined}
          delay={0.14}
          testId="table-prs"
        >
          {!personalRecords.data?.length ? (
            <div className="rounded-[26px] bg-card">
              <CardMessage>Beat a set from an earlier session to earn your first personal record</CardMessage>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[26px] bg-card">
              {[...personalRecords.data]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((pr) => {
                  const recent = isRecent(pr.date, 7);
                  return (
                    <div
                      key={pr.exercise}
                      className="group flex items-center gap-3 pl-5"
                      data-testid={`pr-${pr.exercise.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          recent ? "bg-[hsl(var(--sessions-cyan)/0.1)] text-[hsl(var(--sessions-cyan))]" : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        <Trophy className="h-3.5 w-3.5" strokeWidth={1.6} />
                      </div>
                      <div className="flex min-w-0 flex-1 items-center gap-3 border-b border-border py-[14px] pr-5 group-last:border-b-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[15px] font-normal text-foreground">{pr.exercise}</span>
                            {recent && (
                              <span className="shrink-0 rounded-full bg-[hsl(var(--sessions-cyan)/0.1)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[hsl(var(--sessions-cyan))]">
                                New
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                            {new Date(pr.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </div>
                        </div>
                        <span className="whitespace-nowrap text-[15px] text-muted-foreground">
                          <span className="text-foreground">{pr.maxWeight} {weightUnit}</span>
                          {pr.reps ? ` × ${pr.reps}` : null}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
