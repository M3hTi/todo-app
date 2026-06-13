import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettingsStore } from "@/store/useSettingsStore";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CloseBehaviorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** First-run prompt: minimize to tray or quit, with an optional remember. */
export function CloseBehaviorDialog({ open, onOpenChange }: CloseBehaviorDialogProps) {
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const [remember, setRemember] = useState(true);

  const choose = async (behavior: "tray" | "quit"): Promise<void> => {
    if (remember) await updateSetting("closeBehavior", behavior);
    onOpenChange(false);
    if (behavior === "tray") {
      await getCurrentWindow().hide();
    } else {
      await invoke("quit_app");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keep Todo App running in the tray?</DialogTitle>
          <DialogDescription>
            Minimizing to the system tray keeps reminders running. Quitting closes the app
            completely and stops reminders until you reopen it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Checkbox
            id="remember-close"
            checked={remember}
            onCheckedChange={(checked) => setRemember(checked === true)}
          />
          <Label htmlFor="remember-close">Remember my choice</Label>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => void choose("quit")}>
            Quit
          </Button>
          <Button onClick={() => void choose("tray")}>Minimize to tray</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
