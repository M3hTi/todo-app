import { Plus } from "lucide-react";
import { useTaskStore } from "@/store/useTaskStore";
import { cn } from "@/lib/utils";

interface NewTaskButtonProps {
  className?: string;
}

/** The redesign's primary "New Task" button — same shape everywhere it appears. */
export function NewTaskButton({ className }: NewTaskButtonProps) {
  const setTaskFormOpen = useTaskStore((state) => state.setTaskFormOpen);
  return (
    <button
      type="button"
      onClick={() => setTaskFormOpen(true)}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-[9px] bg-[var(--accent)] px-[17px] py-[11px] text-sm font-semibold text-white shadow-[0_1px_2px_var(--button-shadow)] hover:bg-[var(--accent-hover)]",
        className,
      )}
    >
      <Plus className="h-4 w-4" strokeWidth={2.4} />
      New Task
    </button>
  );
}
