import { useEffect, useMemo, useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertCircle, CheckCircle2, Flame, ListTodo, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTaskStore } from "@/store/useTaskStore";
import { isTaskOverdue } from "@/components/tasks/TaskCard";

export function DashboardView() {
  const tasks = useTaskStore((state) => state.tasks);

  const stats = useMemo(() => {
    const todayKey = format(new Date(), "yyyy-MM-dd");
    const completed = tasks.filter((task) => task.status === "Completed");

    const completedDays = new Set(
      completed
        .filter((task) => task.completedAt)
        .map((task) => format(parseISO(task.completedAt as string), "yyyy-MM-dd")),
    );

    // Streak counts back from today; if nothing is completed yet today, the
    // streak ending yesterday still counts.
    let streak = 0;
    let cursor = completedDays.has(todayKey) ? new Date() : subDays(new Date(), 1);
    while (completedDays.has(format(cursor, "yyyy-MM-dd"))) {
      streak += 1;
      cursor = subDays(cursor, 1);
    }

    const last7Days = Array.from({ length: 7 }, (_, index) => {
      const date = subDays(new Date(), 6 - index);
      const key = format(date, "yyyy-MM-dd");
      return {
        day: format(date, "EEE"),
        count: completed.filter(
          (task) =>
            task.completedAt &&
            format(parseISO(task.completedAt), "yyyy-MM-dd") === key,
        ).length,
      };
    });

    return {
      total: tasks.length,
      completedToday: completed.filter(
        (task) =>
          task.completedAt &&
          format(parseISO(task.completedAt), "yyyy-MM-dd") === todayKey,
      ).length,
      pending: tasks.filter(
        (task) => task.status !== "Completed" && task.status !== "Cancelled",
      ).length,
      overdue: tasks.filter(isTaskOverdue).length,
      completionRate:
        tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0,
      streak,
      last7Days,
    };
  }, [tasks]);

  return (
    <section className="space-y-4 p-6" aria-label="Dashboard">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={ListTodo} label="Total tasks" value={stats.total} />
        <StatCard icon={Sun} label="Completed today" value={stats.completedToday} />
        <StatCard icon={CheckCircle2} label="Pending" value={stats.pending} />
        <StatCard
          icon={AlertCircle}
          label="Overdue"
          value={stats.overdue}
          accent={stats.overdue > 0 ? "text-rose-500" : undefined}
        />
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-card p-4">
          <div>
            <p className="text-xs text-muted-foreground">Completion rate</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.completionRate}%</p>
          </div>
          <ProgressRing value={stats.completionRate} />
        </div>
        <StatCard
          icon={Flame}
          label="Day streak"
          value={stats.streak}
          accent={stats.streak > 0 ? "text-amber-500" : undefined}
        />
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Completed last 7 days</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.last7Days} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "hsl(var(--popover-foreground))",
                }}
              />
              <Bar
                dataKey="count"
                name="Completed"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  accent?: string;
}

function StatCard({ icon: Icon, label, value, accent }: StatCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`h-4 w-4 ${accent ?? ""}`} aria-hidden="true" />
        <p className="text-xs">{label}</p>
      </div>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ?? ""}`}>{value}</p>
    </div>
  );
}

const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ProgressRing({ value }: { value: number }) {
  // Start fully empty, then animate to the target on mount via CSS transition.
  const [offset, setOffset] = useState(RING_CIRCUMFERENCE);

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setOffset(RING_CIRCUMFERENCE - (value / 100) * RING_CIRCUMFERENCE),
    );
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      role="img"
      aria-label={`Completion rate ${value}%`}
    >
      <circle
        cx="32"
        cy="32"
        r={RING_RADIUS}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth="6"
      />
      <circle
        cx="32"
        cy="32"
        r={RING_RADIUS}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={offset}
        transform="rotate(-90 32 32)"
        style={{ transition: "stroke-dashoffset 700ms ease-out" }}
      />
    </svg>
  );
}
