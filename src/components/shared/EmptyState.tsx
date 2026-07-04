import type { LucideIcon } from "lucide-react";
import { CalendarCheck } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
}

export function EmptyState({ icon: Icon = CalendarCheck, title, description }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-0 pb-[60px] text-center">
      <div className="mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-[18px] bg-[var(--accent-tint)]">
        <Icon className="h-7 w-7 text-[var(--accent-text)]" strokeWidth={2} aria-hidden="true" />
      </div>
      <p className="mb-1.5 text-[15px] font-semibold text-[var(--text-1)]">{title}</p>
      {description && (
        <p className="max-w-[260px] text-[13px] leading-[1.5] text-[var(--text-4b)]">{description}</p>
      )}
    </div>
  );
}
