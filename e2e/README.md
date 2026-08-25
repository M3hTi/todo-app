# End-to-end smoke suite

Drives the real desktop app through WebDriver, so the native shell + SQLite path
is exercised without a human clicking through it.

## One-time setup

```sh
cargo install tauri-driver --locked
```

and drop a `msedgedriver.exe` matching your installed Edge version into
`e2e/drivers/` (download from
<https://developer.microsoft.com/microsoft-edge/tools/webdriver/>; check the
version with `(Get-Item 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe').VersionInfo.ProductVersion`).

## Running

```sh
npm run e2e:build   # debug build, ~minutes the first time
npm run test:e2e
```

`e2e:build` overrides the bundle identifier to `com.asus.todo-app-e2e`, so the
suite gets its own SQLite database in `%APPDATA%\com.asus.todo-app-e2e` and can
never touch your real tasks. The suite wipes that directory before it starts.

Not run in CI: it needs a Windows runner with Edge plus a full Rust build. Run it
locally before releasing anything that touches the native shell or persistence.
