import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, isToday, parseISO, subDays } from "date-fns";
import { AlertCircle, ListTodo, TrendingUp, type LucideIcon } from "lucide-react";
import { useTaskStore } from "@/store/useTaskStore";
import { useCategoryStore } from "@/store/useCategoryStore";
import { isTaskOverdue } from "@/components/tasks/TaskCard";
import { TaskCheckbox } from "@/components/shared/TaskCheckbox";
import { NewTaskButton } from "@/components/shared/NewTaskButton";
import { toggleTaskComplete } from "@/hooks/useTasks";
import { PRIORITY_PILL_CLASSES } from "@/lib/taskVisuals";
import { cn } from "@/lib/utils";

const GREETING = (() => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
})();

const RING_RADIUS = 44;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const FOCUS_LIMIT = 4;

export function DashboardView() {
  const tasks = useTaskStore((state) => state.tasks);
  const categories = useCategoryStore((state) => state.categories);
  const navigate = useNavigate();
  const setSelectedTask = useTaskStore((state) => state.setSelectedTask);

  const stats = useMemo(() => {
    const isOpen = (task: (typeof tasks)[number]): boolean =>
      task.status !== "Completed" && task.status !== "Cancelled";

    const active = tasks.filter(isOpen);
    const overdue = tasks.filter(isTaskOverdue);
    const dueToday = active.filter((task) => task.dueDate && isToday(parseISO(task.dueDate)));

    const activeSubtasks = active.flatMap((task) => task.subtasks);
    const subtaskDone = activeSubtasks.filter((subtask) => subtask.completed).length;
    const subtaskTotal = activeSubtasks.length;
    const progressPct = subtaskTotal > 0 ? Math.round((subtaskDone / subtaskTotal) * 100) : 0;

    const completed = tasks.filter((task) => task.status === "Completed");
    const completedDays = new Set(
      completed
        .filter((task) => task.completedAt)
        .map((task) => format(parseISO(task.completedAt as string), "yyyy-MM-dd")),
    );
    const todayKey = format(new Date(), "yyyy-MM-dd");
    let streak = 0;
    let cursor = completedDays.has(todayKey) ? new Date() : subDays(new Date(), 1);
    while (completedDays.has(format(cursor, "yyyy-MM-dd"))) {
      streak += 1;
      cursor = subDays(cursor, 1);
    }

    const weekAgo = subDays(new Date(), 7);
    const completedThisWeek = completed.filter(
      (task) => task.completedAt && parseISO(task.completedAt) >= weekAgo,
    );

    return {
      active,
      overdue,
      dueToday,
      subtaskDone,
      subtaskTotal,
      progressPct,
      streak,
      completedThisWeek,
      focus: dueToday.slice(0, FOCUS_LIMIT),
      attentionCount: dueToday.length + overdue.length,
    };
  }, [tasks]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-4 px-8 pb-5 pt-[26px]">
        <div>
          <h1 className="text-[23px] font-bold tracking-[-.01em] text-[#1c1b22]">{GREETING}</h1>
          <p className="mt-1 text-sm text-[#6c6c78]">
            {format(new Date(), "EEEE, MMMM d")} ·{" "}
            {stats.attentionCount > 0
              ? `${stats.attentionCount} ${stats.attentionCount === 1 ? "task needs" : "tasks need"} your attention`
              : "You're all caught up"}
          </p>
        </div>
        <NewTaskButton />
      </div>

      <div className="flex-1 overflow-auto px-8 pb-8">
        <div className="mb-4 grid grid-cols-[1.35fr_1fr_1fr] gap-4">
          <div
            className="flex items-center gap-[22px] rounded-2xl p-6 text-white shadow-[0_8px_24px_rgba(79,70,229,.28)]"
            style={{ background: "linear-gradient(150deg, #5b54e6, #4f46e5)" }}
          >
            <div className="relative h-[104px] w-[104px] shrink-0">
              <svg width="104" height="104" viewBox="0 0 104 104">
                <circle
                  cx="52"
                  cy="52"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="rgba(255,255,255,.22)"
                  strokeWidth="10"
                />
                <circle
                  cx="52"
                  cy="52"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="#fff"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={RING_CIRCUMFERENCE - (stats.progressPct / 100) * RING_CIRCUMFERENCE}
                  transform="rotate(-90 52 52)"
                  style={{ transition: "stroke-dashoffset 700ms ease-out" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[26px] font-bold leading-none">{stats.progressPct}%</div>
                <div className="mt-0.5 text-[11px] opacity-80">done</div>
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[15px] font-semibold">Today's progress</div>
              <div className="text-[13px] leading-[1.5] opacity-90">
                {stats.subtaskTotal > 0 ? (
                  <>
                    You've completed <b>{stats.subtaskDone} of {stats.subtaskTotal}</b> steps
                    across your active tasks.{" "}
                    {stats.subtaskDone < stats.subtaskTotal
                      ? `Finish ${stats.subtaskTotal - stats.subtaskDone} more to stay on track.`
                      : "Nice work — all caught up."}
                  </>
                ) : (
                  "Break a task into subtasks to track progress here."
                )}
              </div>
              {stats.streak > 0 && (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-[20px] bg-white/[.18] px-[11px] py-1.5 text-xs font-semibold">
                  🔥 {stats.streak}-day streak
                </div>
              )}
            </div>
          </div>

          <StatCard
            icon={ListTodo}
            iconBg="#eef0fe"
            iconColor="#4f46e5"
            label="Active tasks"
            value={stats.active.length}
            deltaText={stats.dueToday.length > 0 ? `${stats.dueToday.length} due today` : "Nothing due today"}
            deltaColor={stats.dueToday.length > 0 ? "#ef4444" : "#6c6c78"}
          />

          <StatCard
            icon={AlertCircle}
            iconBg="#fef2f2"
            iconColor="#ef4444"
            label="Overdue"
            value={stats.overdue.length}
            valueColor={stats.overdue.length === 0 ? "#16a34a" : undefined}
            deltaText={
              stats.overdue.length > 0
                ? `${stats.overdue.length} need${stats.overdue.length === 1 ? "s" : ""} attention`
                : "All caught up 🎉"
            }
            deltaColor={stats.overdue.length > 0 ? "#ef4444" : "#16a34a"}
          />
        </div>

        <div className="grid grid-cols-[1.35fr_1fr] gap-4">
          <div className="rounded-2xl border border-[#ececf1] bg-white p-5">
            <div className="mb-3.5 flex items-center justify-between">
              <span className="text-[15px] font-semibold text-[#1c1b22]">Focus for today</span>
              <button
                type="button"
                onClick={() => navigate("/today")}
                className="text-[13px] font-semibold text-[#4f46e5] hover:underline"
              >
                View all
              </button>
            </div>

            {stats.focus.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-[#8a8a96]">
                Nothing due today. Enjoy the calm.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {stats.focus.map((task) => {
                  const category = categories.find((c) => c.id === task.categoryId);
                  const subtaskTotal = task.subtasks.length;
                  const subtaskDone = task.subtasks.filter((s) => s.completed).length;
                  return (
                    <div
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedTask(task.id);
                        navigate("/today");
                      }}
                      className="flex cursor-pointer gap-3 rounded-[11px] border border-[#f0f0f4] p-[13px] hover:bg-[#fafafb]"
                    >
                      <TaskCheckbox
                        checked={task.status === "Completed"}
                        onToggle={() => void toggleTaskComplete(task)}
                        size={19}
                        className="mt-px"
                        aria-label={`Mark ${task.title} complete`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-[#1c1b22]">
                            {task.title}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-[20px] px-2 py-0.5 text-[10.5px] font-semibold",
                              PRIORITY_PILL_CLASSES[task.priority],
                            )}
                          >
                            {task.priority}
                          </span>
                        </div>
                        <div className="mt-[7px] flex items-center gap-3 text-xs text-[#6c6c78]">
                          <span className="font-semibold text-[#4f46e5]">Today</span>
                          {category && (
                            <span className="flex items-center gap-[5px]">
                              <span
                                className="h-[7px] w-[7px] rounded-full"
                                style={{ backgroundColor: category.color }}
                              />
                              {category.name}
                            </span>
                          )}
                        </div>
                        {subtaskTotal > 0 && (
                          <div className="mt-[9px] flex items-center gap-2">
                            <span className="text-[11px] text-[#9a9aa6]">
                              {subtaskDone}/{subtaskTotal}
                            </span>
                            <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-[#eeeef2]">
                              <div
                                className="h-full bg-[#4f46e5]"
                                style={{ width: `${Math.round((subtaskDone / subtaskTotal) * 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col rounded-2xl border border-[#ececf1] bg-white p-5">
            <span className="mb-1 text-[15px] font-semibold text-[#1c1b22]">This week</span>
            {stats.completedThisWeek.length > 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <div className="text-[34px] font-bold leading-none text-[#1c1b22]">
                  {stats.completedThisWeek.length}
                </div>
                <div className="mt-1.5 text-[12.5px] font-medium text-[#16a34a]">
                  tasks completed this week
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-2 py-3.5 text-center">
                <div className="mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef0fe]">
                  <TrendingUp className="h-7 w-7 text-[#4f46e5]" strokeWidth={2} />
                </div>
                <div className="mb-1 text-[14.5px] font-semibold text-[#1c1b22]">
                  No completed tasks yet
                </div>
                <p className="max-w-[210px] text-[12.5px] leading-[1.5] text-[#8a8a96]">
                  Check off your first task and your weekly streak will start showing up here.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number;
  valueColor?: string;
  deltaText: string;
  deltaColor: string;
}

function StatCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  valueColor,
  deltaText,
  deltaColor,
}: StatCardProps) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-[#ececf1] bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-[#6c6c78]">{label}</span>
        <span
          className="flex h-[30px] w-[30px] items-center justify-center rounded-lg"
          style={{ backgroundColor: iconBg, color: iconColor }}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>
      <div>
        <div
          className="text-[34px] font-bold leading-none"
          style={{ color: valueColor ?? "#1c1b22" }}
        >
          {value}
        </div>
        <div className="mt-1.5 text-[12.5px] font-medium" style={{ color: deltaColor }}>
          {deltaText}
        </div>
      </div>
    </div>
  );
}
