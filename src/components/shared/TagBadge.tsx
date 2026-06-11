import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TagBadgeProps {
  name: string;
  className?: string;
}

export function TagBadge({ name, className }: TagBadgeProps) {
  return (
    <Badge variant="secondary" className={cn("px-1.5 py-0 text-[11px] font-normal", className)}>
      {name}
    </Badge>
  );
}
