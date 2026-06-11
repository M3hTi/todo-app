import { useEffect, useState } from "react";
import type { Category } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const PALETTE = [
  "#6366f1",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#f43f5e",
  "#06b6d4",
  "#84cc16",
] as const;

interface CategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the form edits this category; otherwise it creates a new one. */
  category?: Category;
  onSubmit: (name: string, color: string) => Promise<void>;
}

export function CategoryForm({ open, onOpenChange, category, onSubmit }: CategoryFormProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(category?.name ?? "");
      setColor(category?.color ?? PALETTE[0]);
      setError(null);
    }
  }, [open, category]);

  const handleSubmit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(trimmed, color);
      onOpenChange(false);
    } catch {
      setError("Failed to save category. The name may already be in use.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{category ? "Rename category" : "New category"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`Use color ${swatch}`}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition-transform focus-visible:ring-2 focus-visible:ring-ring",
                    color === swatch ? "scale-110 border-foreground" : "border-transparent",
                  )}
                  style={{ backgroundColor: swatch }}
                  onClick={() => setColor(swatch)}
                />
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {category ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
