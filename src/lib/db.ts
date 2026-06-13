import Database from "@tauri-apps/plugin-sql";

/** Typed error thrown by every DB-touching function in src/lib. */
export class DbError extends Error {
  readonly code:
    | "DB_NOT_INITIALIZED"
    | "DB_INIT_FAILED"
    | "QUERY_FAILED";

  constructor(code: DbError["code"], message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "DbError";
    this.code = code;
  }
}

/** Wraps a DB call so callers always receive a DbError on failure. */
export async function withDb<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DbError) throw err;
    throw new DbError("QUERY_FAILED", `${label} failed`, err);
  }
}

const DB_PATH = "sqlite:todo-app.db";

interface Migration {
  version: number;
  statements: string[];
}

// plugin-sql executes one statement per call, so each migration lists its
// statements individually instead of one multi-statement script.
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL DEFAULT '#6366f1',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'Not Started',
        priority TEXT NOT NULL DEFAULT 'Medium',
        due_date TEXT,
        due_time TEXT,
        category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        reminder_at TEXT,
        reminder_shown_at TEXT,
        recurring_rule_json TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        notes TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS subtasks (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS task_tags (
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, tag_id)
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category_id)`,
      `CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id)`,
      `CREATE INDEX IF NOT EXISTS idx_task_tags_task ON task_tags(task_id)`,
    ],
  },
];

const DEFAULT_CATEGORIES: ReadonlyArray<{ name: string; color: string }> = [
  { name: "Personal", color: "#10b981" },
  { name: "Work", color: "#3b82f6" },
  { name: "Study", color: "#8b5cf6" },
  { name: "Shopping", color: "#f59e0b" },
];

const DEFAULT_SETTINGS: Readonly<Record<string, unknown>> = {
  theme: "System",
  defaultPriority: "Medium",
  defaultReminderMinutesBefore: 15,
  notificationsEnabled: true,
  closeBehavior: "ask",
  launchOnStartup: false,
};

let instance: Database | null = null;
let initPromise: Promise<void> | null = null;

/** Returns the singleton Database. Throws if initDb() has not completed. */
export function getDb(): Database {
  if (!instance) {
    throw new DbError("DB_NOT_INITIALIZED", "Database accessed before initDb() completed");
  }
  return instance;
}

/**
 * Opens the database, applies pending migrations and seeds defaults.
 * Idempotent and safe to call concurrently (React StrictMode mounts twice).
 */
export function initDb(): Promise<void> {
  initPromise ??= doInit().catch((err: unknown) => {
    initPromise = null; // allow retry after failure
    throw err;
  });
  return initPromise;
}

async function doInit(): Promise<void> {
  if (instance) return;
  try {
    const db = await Database.load(DB_PATH);

    await db.execute("PRAGMA foreign_keys = ON");
    await db.execute("PRAGMA journal_mode = WAL");

    await db.execute(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`,
    );

    const applied = await db.select<Array<{ version: number }>>(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    const appliedVersions = new Set(applied.map((row) => row.version));

    for (const migration of MIGRATIONS) {
      if (appliedVersions.has(migration.version)) continue;
      for (const statement of migration.statements) {
        await db.execute(statement);
      }
      await db.execute(
        "INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)",
        [migration.version, new Date().toISOString()],
      );
    }

    await seedDefaults(db);
    instance = db;
  } catch (err) {
    if (err instanceof DbError) throw err;
    throw new DbError("DB_INIT_FAILED", "Failed to initialize the database", err);
  }
}

/** Danger zone: deletes every row from every table and re-seeds defaults. */
export async function resetAllData(): Promise<void> {
  return withDb("resetAllData", async () => {
    const db = getDb();
    // Children first so FK constraints never block the wipe.
    for (const table of ["task_tags", "subtasks", "tasks", "tags", "categories", "settings"]) {
      await db.execute(`DELETE FROM ${table}`);
    }
    await seedDefaults(db);
  });
}

async function seedDefaults(db: Database): Promise<void> {
  const [{ count: categoryCount }] = await db.select<Array<{ count: number }>>(
    "SELECT COUNT(*) AS count FROM categories",
  );
  if (categoryCount === 0) {
    const now = new Date().toISOString();
    for (const category of DEFAULT_CATEGORIES) {
      await db.execute(
        "INSERT INTO categories (id, name, color, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
        [crypto.randomUUID(), category.name, category.color, now, now],
      );
    }
  }

  const [{ count: settingsCount }] = await db.select<Array<{ count: number }>>(
    "SELECT COUNT(*) AS count FROM settings",
  );
  if (settingsCount === 0) {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await db.execute("INSERT INTO settings (key, value) VALUES ($1, $2)", [
        key,
        JSON.stringify(value),
      ]);
    }
  }
}
