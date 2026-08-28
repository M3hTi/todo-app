// Smoke suite: drives the built desktop app through tauri-driver.
// Run with `npm run e2e:build && npm run test:e2e`. See e2e/README.md.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { remote } from "webdriverio";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "src-tauri", "target", "debug", "todo-app.exe");
const NATIVE_DRIVER = path.join(here, "drivers", "msedgedriver.exe");
// Matches the identifier override in e2e/tauri.e2e.conf.json, so the suite owns
// its own database and can never touch real tasks.
const APP_DATA = path.join(process.env.APPDATA, "com.asus.todo-app-e2e");
const PORT = 4445;
// tauri-driver's own default for the native WebDriver is 4445, so both ports are
// pinned explicitly — otherwise msedgedriver fights the intermediary for one port.
const NATIVE_PORT = 4446;
const DRIVER_LOG = path.join(here, "tauri-driver.log");

const TASK = "Smoke test task";
const NOTE_WORD = "sluicegate"; // deliberately not in the title, to prove search reads notes

let driver;
let app;

const startApp = async () => {
  app = await remote({
    hostname: "127.0.0.1",
    port: PORT,
    logLevel: "error",
    capabilities: { "tauri:options": { application: APP } },
  });
  // The window renders a blank shell until initDb() resolves.
  await app.$('aside*=Todo App').waitForExist({ timeout: 20_000 });
  return app;
};

const stopApp = async () => {
  if (app) await app.deleteSession().catch(() => {});
  app = undefined;
};

/** Polls tauri-driver until it answers, so the suite never races the spawn. */
const waitForDriver = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/status`);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`tauri-driver never came up on port ${PORT} — see ${DRIVER_LOG}`);
};

before(async () => {
  assert.ok(existsSync(APP), `missing ${APP} — run \`npm run e2e:build\` first`);
  assert.ok(existsSync(NATIVE_DRIVER), `missing ${NATIVE_DRIVER} — see e2e/README.md`);

  await rm(APP_DATA, { recursive: true, force: true }); // fresh database every run

  const log = openSync(DRIVER_LOG, "w");
  // `.exe` because spawn() without a shell does no PATHEXT lookup on Windows,
  // and a shell wrapper would hide the pid we need to kill the whole tree.
  driver = spawn(
    "tauri-driver.exe",
    [
      "--port", String(PORT),
      "--native-port", String(NATIVE_PORT),
      "--native-driver", NATIVE_DRIVER,
    ],
    { stdio: ["ignore", log, log] },
  );
  await waitForDriver();
  await startApp();
});

after(async () => {
  await stopApp();
  // tauri-driver owns a child msedgedriver, so kill the tree, not just the parent.
  if (driver?.pid) spawn("taskkill", ["/pid", String(driver.pid), "/T", "/F"], { stdio: "ignore" });
});

test("launches into a usable window", async () => {
  assert.match(await app.getTitle(), /Todo App/);
  assert.ok(await app.$('nav[aria-label="Main navigation"]').isExisting());
});

test("adds a task and shows it in the list", async () => {
  await app.$("button*=New Task").click();
  await app.$("#task-title").setValue(TASK);
  await app.$("#task-description").setValue(`notes mentioning ${NOTE_WORD}`);
  await app.$("button=Create task").click();

  await app.$("a=All Tasks").click();
  await app.$(`span=${TASK}`).waitForDisplayed({ timeout: 5000 });
});

test("search matches on the description, not just the title", async () => {
  const search = await app.$("#task-search");
  await search.setValue(NOTE_WORD);
  await app.$(`span=${TASK}`).waitForDisplayed({ timeout: 5000 });

  await search.setValue("definitely-no-such-task");
  await app.$(`span=${TASK}`).waitForDisplayed({ reverse: true, timeout: 5000 });

  // The search box clears its filter when it unmounts, so a round trip through
  // another view is how the app itself resets it — `clearValue` bypasses React's
  // change handling and would leave the list filtered for the next test.
  await app.$("a=Today").click();
  await app.$("a=All Tasks").click();
  await app.$(`span=${TASK}`).waitForDisplayed({ timeout: 5000 });
});

test("completing a task flips its checkbox", async () => {
  await app.$(`button[aria-label="Mark ${TASK} complete"]`).click();
  await app
    .$(`button[aria-label="Mark ${TASK} incomplete"]`)
    .waitForExist({ timeout: 5000 });
});

test("the task survives a relaunch", async () => {
  await stopApp();
  await new Promise((resolve) => setTimeout(resolve, 1500)); // let single-instance release
  await startApp();

  await app.$("a=All Tasks").click();
  await app.$(`span=${TASK}`).waitForDisplayed({ timeout: 10_000 });
  assert.ok(
    await app.$(`button[aria-label="Mark ${TASK} incomplete"]`).isExisting(),
    "completion should have been persisted, not just held in memory",
  );
});

// Hover-revealed controls: they are `opacity-0 group-hover:opacity-100`, so a
// build that drops Tailwind's group variants leaves them permanently invisible
// while still passing every query-by-selector test. Hover, then click.
test("a category can be deleted from the sidebar on hover", async () => {
  await app.$('button[aria-label="New category"]').click();
  await app.$("#category-name").setValue("Doomed");
  await app.$("button=Create").click();

  const link = await app.$("a*=Doomed");
  await link.waitForDisplayed({ timeout: 5000 });
  await link.moveTo();

  const remove = await app.$('button[aria-label="Delete Doomed"]');
  await remove.waitForDisplayed({ timeout: 5000 });
  await remove.click();
  await app.$("button=Delete").click();
  await app.$("a*=Doomed").waitForExist({ reverse: true, timeout: 5000 });
});

test("a subtask can be deleted from the detail panel on hover", async () => {
  await app.$("a=All Tasks").click();
  await app.$(`span=${TASK}`).click();

  const add = await app.$('input[aria-label="New subtask title"]');
  await add.waitForDisplayed({ timeout: 5000 });
  await add.setValue("Doomed subtask");
  await app.keys(["Enter"]);

  const row = await app.$('input[aria-label="Subtask title: Doomed subtask"]');
  await row.waitForDisplayed({ timeout: 5000 });
  await row.moveTo();

  const remove = await app.$('button[aria-label="Delete subtask Doomed subtask"]');
  await remove.waitForDisplayed({ timeout: 5000 });
  await remove.click();
  await row.waitForExist({ reverse: true, timeout: 5000 });
});
