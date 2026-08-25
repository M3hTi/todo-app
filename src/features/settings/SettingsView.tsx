import { useEffect, useState } from "react";
import { z } from "zod";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { toast } from "sonner";
import { Download, ExternalLink, FileSpreadsheet, Upload } from "lucide-react";
import { format } from "date-fns";
import type { CloseBehavior, TaskPriority, Theme } from "@/types";
import { getDb, resetAllData, withDb } from "@/lib/db";
import { autostartAction } from "@/lib/autostart";
import { useTaskStore } from "@/store/useTaskStore";
import { useCategoryStore } from "@/store/useCategoryStore";
import { useTagStore } from "@/store/useTagStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import packageJson from "../../../package.json";
import { parseImportData } from "./parseImportData";

const subtaskSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  title: z.string(),
  completed: z.boolean(),
  order: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const recurringRuleSchema = z.object({
  frequency: z.enum(["Daily", "Weekly", "Monthly", "Yearly"]),
  interval: z.number(),
  daysOfWeek: z.array(z.number()).optional(),
  dayOfMonth: z.number().optional(),
  endDate: z.string().optional(),
});

const reminderSchema = z.object({
  mode: z.enum(["relative", "absolute"]),
  minutesBefore: z.number().optional(),
  at: z.string().optional(),
  repeatMinutes: z.number().optional(),
  nextFireAt: z.string(),
  lastFiredAt: z.string().optional(),
  dismissedAt: z.string().optional(),
});

const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: z.enum(["Not Started", "In Progress", "Completed", "Cancelled"]),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]),
  dueDate: z.string().optional(),
  dueTime: z.string().optional(),
  categoryId: z.string().optional(),
  tags: z.array(z.string()),
  subtasks: z.array(subtaskSchema),
  reminderAt: z.string().optional(),
  reminderShownAt: z.string().optional(),
  reminder: reminderSchema.optional(),
  recurringRule: recurringRuleSchema.optional(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
  notes: z.string().optional(),
});

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const tagSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
});

const settingsSchema = z.object({
  theme: z.enum(["Light", "Dark", "System"]),
  defaultCategoryId: z.string().optional(),
  defaultPriority: z.enum(["Low", "Medium", "High", "Urgent"]),
  defaultReminderMinutesBefore: z.number(),
  notificationsEnabled: z.boolean(),
  closeBehavior: z.enum(["ask", "tray", "quit"]).default("ask"),
  launchOnStartup: z.boolean().default(false),
});

const exportFileSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  tasks: z.array(taskSchema),
  categories: z.array(categorySchema),
  tags: z.array(tagSchema),
  settings: settingsSchema,
});

type ExportFile = z.infer<typeof exportFileSchema>;

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Merges an export file into the DB: upsert by id — insert if not exists,
 * skip if exists. Local settings are kept (only rows are merged).
 */
async function importData(data: ExportFile): Promise<{ tasks: number; categories: number }> {
  return withDb("importData", async () => {
    const db = getDb();

    const existingCategories = await db.select<Array<{ id: string; name: string }>>(
      "SELECT id, name FROM categories",
    );
    const categoryIds = new Set(existingCategories.map((row) => row.id));
    const categoryIdByName = new Map(existingCategories.map((row) => [row.name, row.id]));
    // Maps an imported category id to the id it resolves to after the merge.
    const resolvedCategoryId = new Map<string, string>();
    let importedCategories = 0;

    for (const category of data.categories) {
      if (categoryIds.has(category.id)) {
        resolvedCategoryId.set(category.id, category.id);
        continue;
      }
      const sameName = categoryIdByName.get(category.name);
      if (sameName !== undefined) {
        resolvedCategoryId.set(category.id, sameName);
        continue;
      }
      await db.execute(
        "INSERT INTO categories (id, name, color, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
        [category.id, category.name, category.color, category.createdAt, category.updatedAt],
      );
      categoryIds.add(category.id);
      categoryIdByName.set(category.name, category.id);
      resolvedCategoryId.set(category.id, category.id);
      importedCategories += 1;
    }

    const existingTags = await db.select<Array<{ id: string; name: string }>>(
      "SELECT id, name FROM tags",
    );
    const tagIdByName = new Map(existingTags.map((row) => [row.name, row.id]));
    const tagIds = new Set(existingTags.map((row) => row.id));

    for (const tag of data.tags) {
      if (tagIds.has(tag.id) || tagIdByName.has(tag.name)) continue;
      await db.execute("INSERT INTO tags (id, name, created_at) VALUES ($1, $2, $3)", [
        tag.id,
        tag.name,
        tag.createdAt,
      ]);
      tagIds.add(tag.id);
      tagIdByName.set(tag.name, tag.id);
    }

    const existingTaskRows = await db.select<Array<{ id: string }>>("SELECT id FROM tasks");
    const existingTaskIds = new Set(existingTaskRows.map((row) => row.id));
    let importedTasks = 0;

    for (const task of data.tasks) {
      if (existingTaskIds.has(task.id)) continue;

      const categoryId = task.categoryId
        ? (resolvedCategoryId.get(task.categoryId) ??
          (categoryIds.has(task.categoryId) ? task.categoryId : null))
        : null;

      const reminderJson = task.reminder
        ? JSON.stringify(task.reminder)
        : task.reminderAt
          ? JSON.stringify({
              mode: "absolute",
              at: task.reminderAt,
              nextFireAt: task.reminderAt,
              ...(task.reminderShownAt ? { dismissedAt: task.reminderShownAt } : {}),
            })
          : null;

      await db.execute(
        `INSERT INTO tasks (id, title, description, status, priority, due_date, due_time,
          category_id, reminder_json, recurring_rule_json, sort_order,
          created_at, updated_at, completed_at, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          task.id,
          task.title,
          task.description ?? null,
          task.status,
          task.priority,
          task.dueDate ?? null,
          task.dueTime ?? null,
          categoryId,
          reminderJson,
          task.recurringRule ? JSON.stringify(task.recurringRule) : null,
          task.sortOrder,
          task.createdAt,
          task.updatedAt,
          task.completedAt ?? null,
          task.notes ?? null,
        ],
      );

      for (const subtask of task.subtasks) {
        await db.execute(
          `INSERT OR IGNORE INTO subtasks (id, task_id, title, completed, sort_order, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            subtask.id,
            task.id,
            subtask.title,
            subtask.completed ? 1 : 0,
            subtask.order,
            subtask.createdAt,
            subtask.updatedAt,
          ],
        );
      }

      for (const tagName of task.tags) {
        let tagId = tagIdByName.get(tagName);
        if (tagId === undefined) {
          tagId = crypto.randomUUID();
          await db.execute("INSERT INTO tags (id, name, created_at) VALUES ($1, $2, $3)", [
            tagId,
            tagName,
            new Date().toISOString(),
          ]);
          tagIdByName.set(tagName, tagId);
        }
        await db.execute(
          "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES ($1, $2)",
          [task.id, tagId],
        );
      }

      existingTaskIds.add(task.id);
      importedTasks += 1;
    }

    return { tasks: importedTasks, categories: importedCategories };
  });
}

const THEMES: Theme[] = ["Light", "Dark", "System"];
const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High", "Urgent"];
const REMINDER_DEFAULTS = [
  { value: 0, label: "Disabled" },
  { value: 5, label: "5 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
] as const;

export function SettingsView() {
  const tasks = useTaskStore((state) => state.tasks);
  const categories = useCategoryStore((state) => state.categories);
  const tags = useTagStore((state) => state.tags);
  const settings = useSettingsStore((state) => state.settings);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  const [pendingImport, setPendingImport] = useState<ExportFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [autostartOn, setAutostartOn] = useState<boolean | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");

  useEffect(() => {
    void isPermissionGranted().then(setPermissionGranted);
  }, []);

  useEffect(() => {
    void isAutostartEnabled()
      .then(setAutostartOn)
      .catch(() => setAutostartOn(null));
  }, []);

  const handleNotificationsToggle = async (enabled: boolean): Promise<void> => {
    if (!enabled) {
      await updateSetting("notificationsEnabled", false);
      return;
    }
    let granted = await isPermissionGranted();
    if (!granted) {
      granted = (await requestPermission()) === "granted";
    }
    setPermissionGranted(granted);
    if (granted) {
      await updateSetting("notificationsEnabled", true);
    } else {
      toast.error("Notification permission was denied by the system.");
      await updateSetting("notificationsEnabled", false);
    }
  };

  const handleAutostartToggle = async (on: boolean): Promise<void> => {
    try {
      const action = autostartAction(on, await isAutostartEnabled());
      if (action === "enable") {
        await enableAutostart();
      } else if (action === "disable") {
        await disableAutostart();
      }
      setAutostartOn(on);
      await updateSetting("launchOnStartup", on);
    } catch {
      toast.error("Couldn't change the launch-on-startup setting.");
    }
  };

  const handleReset = async (): Promise<void> => {
    setBusy(true);
    try {
      await resetAllData();
      useTaskStore.getState().setSelectedTask(null);
      await Promise.all([
        useTaskStore.getState().loadTasks(),
        useCategoryStore.getState().loadCategories(),
        useTagStore.getState().loadTags(),
        useSettingsStore.getState().loadSettings(),
      ]);
      toast.success("All data was reset to defaults.");
    } catch {
      toast.error("Failed to reset data.");
    } finally {
      setBusy(false);
      setResetOpen(false);
      setResetText("");
    }
  };

  const handleExportJson = async (): Promise<void> => {
    try {
      const path = await saveDialog({
        defaultPath: `todo-export-${format(new Date(), "yyyy-MM-dd")}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      const payload: ExportFile = {
        version: 1,
        exportedAt: new Date().toISOString(),
        tasks,
        categories,
        tags,
        settings,
      };
      await writeTextFile(path, JSON.stringify(payload, null, 2));
      toast.success("Exported JSON successfully.");
    } catch {
      toast.error("Failed to export JSON.");
    }
  };

  const handleExportCsv = async (): Promise<void> => {
    try {
      const path = await saveDialog({
        defaultPath: `todo-export-${format(new Date(), "yyyy-MM-dd")}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!path) return;
      const header = "id,title,status,priority,due_date,category,tags,completed_at,created_at";
      const rows = tasks.map((task) =>
        [
          task.id,
          task.title,
          task.status,
          task.priority,
          task.dueDate ?? "",
          categories.find((category) => category.id === task.categoryId)?.name ?? "",
          task.tags.join("|"),
          task.completedAt ?? "",
          task.createdAt,
        ]
          .map(csvField)
          .join(","),
      );
      await writeTextFile(path, [header, ...rows].join("\n"));
      toast.success("Exported CSV successfully.");
    } catch {
      toast.error("Failed to export CSV.");
    }
  };

  const handlePickImport = async (): Promise<void> => {
    try {
      const path = await openDialog({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof path !== "string") return;
      const raw = await readTextFile(path);
      const result = parseImportData(raw, exportFileSchema);
      if (!result.ok) {
        toast.error(
          result.reason === "invalid-json"
            ? "Couldn't read the file — it isn't valid JSON."
            : "This file isn't a valid Todo App export.",
        );
        return;
      }
      setPendingImport(result.data);
    } catch {
      toast.error("Couldn't open the file. Please try again.");
    }
  };

  const handleConfirmImport = async (): Promise<void> => {
    if (!pendingImport) return;
    setBusy(true);
    try {
      const result = await importData(pendingImport);
      await Promise.all([
        useTaskStore.getState().loadTasks(),
        useCategoryStore.getState().loadCategories(),
        useTagStore.getState().loadTags(),
      ]);
      toast.success(`Imported ${result.tasks} tasks and ${result.categories} categories.`);
    } catch {
      toast.error("Import failed. No changes were saved for the failing items.");
    } finally {
      setBusy(false);
      setPendingImport(null);
    }
  };

  return (
    <section
      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      aria-label="Settings"
    >
      <div className="mx-auto max-w-[720px] space-y-8 px-10 py-8">
      <div>
        <h3 className="text-base font-semibold">Appearance</h3>
        <Separator className="my-3" />
        <div className="flex items-center justify-between gap-6">
          <Label>Theme</Label>
          <Select
            value={settings.theme}
            onValueChange={(value) => void updateSetting("theme", value as Theme)}
          >
            <SelectTrigger className="w-[200px]" aria-label="Theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THEMES.map((theme) => (
                <SelectItem key={theme} value={theme}>
                  {theme}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold">Defaults</h3>
        <p className="text-sm text-muted-foreground">Applied to newly created tasks.</p>
        <Separator className="my-3" />
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-6">
            <Label>Default category</Label>
            <Select
              value={settings.defaultCategoryId ?? "none"}
              onValueChange={(value) =>
                void updateSetting("defaultCategoryId", value === "none" ? undefined : value)
              }
            >
              <SelectTrigger className="w-[200px]" aria-label="Default category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-6">
            <Label>Default priority</Label>
            <Select
              value={settings.defaultPriority}
              onValueChange={(value) =>
                void updateSetting("defaultPriority", value as TaskPriority)
              }
            >
              <SelectTrigger className="w-[200px]" aria-label="Default priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {priority}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-6">
            <Label>Default reminder</Label>
            <Select
              value={String(settings.defaultReminderMinutesBefore)}
              onValueChange={(value) =>
                void updateSetting("defaultReminderMinutesBefore", Number(value))
              }
            >
              <SelectTrigger className="w-[200px]" aria-label="Default reminder">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMINDER_DEFAULTS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold">Notifications</h3>
        <Separator className="my-3" />
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Checkbox
              id="notifications-enabled"
              checked={settings.notificationsEnabled}
              onCheckedChange={(checked) => void handleNotificationsToggle(checked === true)}
            />
            <Label htmlFor="notifications-enabled">Enable reminder notifications</Label>
          </div>
          <span className="w-[200px] text-right text-xs text-muted-foreground">
            System permission:{" "}
            {permissionGranted === null
              ? "checking…"
              : permissionGranted
                ? "granted"
                : "not granted"}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Reminders only fire while Todo App is running — closing to the tray keeps them
          going, quitting does not (ADR-0001).
        </p>
        {permissionGranted === false && (
          <p className="mt-2 text-xs text-muted-foreground">
            Notifications are blocked by the system. Allow them for Todo App in Windows
            Settings → System → Notifications, then re-enable here.
          </p>
        )}
      </div>

      <div>
        <h3 className="text-base font-semibold">Window &amp; startup</h3>
        <Separator className="my-3" />
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-6">
            <div>
              <Label>When I close the window</Label>
              <p className="text-xs text-muted-foreground">
                Minimizing to the tray keeps reminders running. Quitting stops them until you
                reopen the app.
              </p>
            </div>
            <Select
              value={settings.closeBehavior}
              onValueChange={(value) => void updateSetting("closeBehavior", value as CloseBehavior)}
            >
              <SelectTrigger className="w-[200px] shrink-0" aria-label="When I close the window">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ask">Ask each time</SelectItem>
                <SelectItem value="tray">Minimize to tray</SelectItem>
                <SelectItem value="quit">Quit the app</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="launch-on-startup"
              checked={settings.launchOnStartup}
              onCheckedChange={(checked) => void handleAutostartToggle(checked === true)}
            />
            <Label htmlFor="launch-on-startup">
              Launch Todo App when Windows starts (minimized to tray)
            </Label>
          </div>
          {autostartOn !== null && autostartOn !== settings.launchOnStartup && (
            <p className="text-xs text-muted-foreground">
              System startup state and this setting differ; toggling will re-sync them.
            </p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold">Data</h3>
        <p className="text-sm text-muted-foreground">
          Back up your tasks or move them between machines.
        </p>
        <Separator className="my-3" />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void handleExportJson()}>
            <Download className="mr-2 h-4 w-4" />
            Export JSON
          </Button>
          <Button variant="outline" onClick={() => void handleExportCsv()}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void handlePickImport()}>
            <Upload className="mr-2 h-4 w-4" />
            Import JSON
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold text-destructive">Danger Zone</h3>
        <Separator className="my-3" />
        <div className="flex items-center justify-between gap-6 rounded-lg border border-destructive/40 p-3">
          <div>
            <p className="text-sm font-medium">Reset all data</p>
            <p className="text-xs text-muted-foreground">
              Deletes every task, category, tag and setting, then restores defaults.
            </p>
          </div>
          <Button variant="destructive" className="shrink-0" onClick={() => setResetOpen(true)}>
            Reset all data
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold">About</h3>
        <Separator className="my-3" />
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="tabular-nums">{packageJson.version}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Source</dt>
            <dd className="flex items-center gap-1 text-muted-foreground">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              github.com/M3hTi/todo-app
            </dd>
          </div>
        </dl>
      </div>
      </div>

      <ConfirmDialog
        open={pendingImport !== null}
        onOpenChange={(open) => {
          if (!open) setPendingImport(null);
        }}
        title="Import data"
        description={`This will merge ${pendingImport?.tasks.length ?? 0} tasks and ${pendingImport?.categories.length ?? 0} categories. Continue?`}
        confirmLabel="Import"
        onConfirm={() => void handleConfirmImport()}
      />

      <Dialog
        open={resetOpen}
        onOpenChange={(open) => {
          setResetOpen(open);
          if (!open) setResetText("");
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset all data</DialogTitle>
            <DialogDescription>
              This permanently deletes all tasks, categories, tags and settings. Type{" "}
              <span className="font-mono font-semibold">RESET</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={resetText}
            onChange={(event) => setResetText(event.target.value)}
            placeholder="RESET"
            aria-label="Type RESET to confirm"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={resetText !== "RESET" || busy}
              onClick={() => void handleReset()}
            >
              Reset everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
