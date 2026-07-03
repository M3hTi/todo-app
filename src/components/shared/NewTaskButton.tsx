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
        "flex shrink-0 items-center gap-2 rounded-[9px] bg-[#4f46e5] px-[17px] py-[11px] text-sm font-semibold text-white shadow-[0_1px_2px_rgba(79,70,229,.4)] hover:bg-[#4338ca]",
        className,
      )}
    >
      <Plus className="h-4 w-4" strokeWidth={2.4} />
      New Task
    </button>
  );
}
