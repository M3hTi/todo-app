import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  size?: number;
  "aria-label": string;
  className?: string;
}

/** Bespoke rounded-square checkbox matching the redesign (row + subtask checklists). */
export function TaskCheckbox({
  checked,
  onToggle,
  size = 20,
  className,
  ...aria
}: TaskCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      style={{ width: size, height: size }}
      className={cn(
        "box-border flex shrink-0 items-center justify-center rounded-[6px] border-2 transition-colors",
        checked
          ? "border-[var(--accent)] bg-[var(--accent)]"
          : "border-[var(--checkbox-border)] bg-[var(--surface-raised)]",
        className,
      )}
      {...aria}
    >
      {checked && (
        <Check
          className="text-white"
          style={{ width: size * 0.55, height: size * 0.55 }}
          strokeWidth={3.2}
        />
      )}
    </button>
  );
}
