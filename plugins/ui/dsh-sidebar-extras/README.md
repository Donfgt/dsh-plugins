# dsh-sidebar-extras

Two additions to the DeepSeek Harness Web sidebar, in one small plugin:

| Feature | Where it appears |
|---|---|
| DeepSeek API balance + estimated spend | a live pill at the sidebar foot, and a panel with today / 7-day / 30-day spend |
| Skin switcher | a **皮肤** entry in the sidebar, opening a gallery of installed skins with previews, plus apply and remove |

Built and verified against DSH `0.2.1-rc.2` on Windows.

Category: [`plugins/ui/`](../../ui/) · part of [dsh-plugins](../../../../README.md).

## Install

From the published release (no clone needed):

```powershell
dsh plugin --profile web add "https://github.com/Donfgt/dsh-plugins/releases/download/v0.1.0/dsh-sidebar-extras-0.1.0.tgz"
```

From a local checkout, while developing:

```powershell
dsh plugin --profile web add "link:C:\path\to\dsh-plugins\plugins\ui\dsh-sidebar-extras"
```

`github:...#path:` works for a first install too, but pnpm drops the path fragment
from the profile manifest — a later `add` in the same profile then re-resolves the
repo root and the package disappears. Use the tarball or `link:` instead; see the
[repository README](../../../../README.md#已知问题).

With HMR enabled in the profile (the shipped `web` template enables it) the plugin
mounts live; otherwise restart `dsh web`.

Remove:

```powershell
dsh plugin --profile web remove dsh-sidebar-extras
```

## What it does

### Balance and usage

- Reads `DEEPSEEK_API_KEY` through the harness credential service (falling back to
  the environment variable) and calls `GET https://api.deepseek.com/user/balance`.
- The pill shows the total balance with a status dot; clicking it opens the panel.
- Usage is **estimated**, because DeepSeek publishes no usage endpoint: every
  balance read stores a sample under `<profile>/.sidebar-extras/balance-history.json`,
  and decreases between consecutive samples are summed into today / 7-day /
  30-day buckets. Top-ups (balance increases) are ignored. The estimate gets
  better the longer the plugin runs.

### Skin gallery

- Lists non-official bundles installed in the profile that look like skins
  (`skin`, `theme`, `ui` in the name) or ship preview art.
- Preview images come from the bundle itself when it ships screenshots, and
  otherwise from `previews/` in this package (a curated set, because most npm
  packages drop their screenshots).
- **换成这个** enables one skin and disables the others — skins all rewrite the
  same CSS tokens, so only one should be active.
- **删除** removes the package from the profile through the plugin manager.

## API routes

All routes sit under `/sidebar-extras/api`, accept loopback clients only, and
serve the browser half; nothing is exposed beyond this machine.

| Route | Purpose |
|---|---|
| `GET /balance[?refresh=1]` | current balance plus estimated usage |
| `GET /skins` | installed skins, preview URLs, enabled state |
| `GET /skins/preview?name=<pkg>&bundled=1` | bundled preview art |
| `GET /skins/preview?name=<pkg>&file=<rel>` | preview art from the package |
| `POST /skins/apply` `{name}` | enable one skin, disable the others |
| `POST /skins/remove` `{name}` | remove the package from the profile |

## Layout

```
package.json          bundle patch + dsh.client declaration
cordis.patch.yml      inserts the host entry
lib/index.js          host: balance fetch, skin inventory, routes
lib/client.js         browser: slot registrations (no build step)
previews/             curated preview art
```

The browser half is a hand-written lazy-CJS factory in the
`window.__ModuleLoader__.load({ id, factory })` format, so the package needs no
bundler: edit `lib/client.js` and reload. It requires only `react` from the
platform module table.

## Notes and limits

- One host entry serves both features; the two panels share the sidebar slots
  `sidebar.footer.action` (balance pill) and `sidebar.panellist` (skins).
- Switching a skin recomposes the profile, which disposes the plugin's own
  context mid-request — the host half therefore captures service instances at
  `apply()` time instead of resolving them per call.
- `X-MCP-Toolsets`-style gating does not exist for skins; a bundle is shown or it
  is not.
- No automated tests yet; every path in this README was exercised against a live
  profile (`/balance`, `/skins`, apply, remove) before publishing.

MIT — see [LICENSE](LICENSE).
