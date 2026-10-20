# dsh-sidebar-extras

A **skin switcher** for the DeepSeek Harness Web sidebar: one **皮肤** entry that
opens a gallery of every installed skin with its preview image, plus one-click
switch and remove.

Built and verified against DSH `0.2.1-rc.2` on Windows.

Category: [`plugins/ui/`](../../ui/) · part of [dsh-plugins](../../../../README.md).

> The DeepSeek balance panel that used to live here was removed in 0.2.0 — the
> floating [dsh-whale-widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)
> owns that surface (per-turn cost with peak/off-peak pricing beats a sampled
> balance delta).

## Install

From the published release (no clone needed):

```powershell
dsh plugin --profile web add "https://github.com/Donfgt/dsh-plugins/releases/download/v0.2.0/dsh-sidebar-extras-0.2.0.tgz"
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

### Which bundles count as skins

A non-official bundle is listed when any of these holds:

- it has art in this package's `previews/` (a curated set — most npm packages drop
  their screenshots, so this covers the popular skins), or
- its package name contains `skin`, `theme`, or `ui` as a segment, or
- it is on the small allowlist for skins that restyle the page under another name
  (`dsh-ads`).

Everything else — `dsh-im`, `dsh-openpencil`, `dsh-whale-widget`, `dsh-find-plugin` —
stays out of the gallery.

### Swapping

Clicking **换成这个** enables that bundle and disables every other gallery skin,
because skins all rewrite the same CSS token ladder: two at once fight. The action
goes through this profile's plugin manager, so the change is persisted in
`package.json` and applied by recomposition. **删除** removes the package.

## API routes

Everything sits under `/sidebar-extras/api`, loopback clients only.

| Route | Purpose |
|---|---|
| `GET /skins` | gallery rows: name, version, enabled, preview URL |
| `GET /skins/preview?name=<pkg>&bundled=1` | bundled 900px WebP art |
| `GET /skins/preview?name=<pkg>&file=<rel>` | art shipped inside the package |
| `POST /skins/apply` `{name}` | enable one skin, disable the others |
| `POST /skins/remove` `{name}` | remove the package from the profile |

## Layout

```
package.json          bundle patch + dsh.client declaration
cordis.patch.yml      inserts the host entry
lib/index.js          host: skin inventory, preview lookup, routes
lib/client.js         browser: slot registrations (no build step)
previews/             curated preview art (900px WebP, ~480 KB total)
```

The browser half is a hand-written lazy-CJS factory in the
`window.__ModuleLoader__.load({ id, factory })` format, so the package needs no
bundler: edit `lib/client.js` and reload. It requires only `react` from the
platform module table.

## Notes

- One host entry serves the gallery; the browser half registers
  `sidebar.panellist` (**皮肤**) and two `main` panel keys — the skins page and the
  panel it opens.
- Switching a skin recomposes the profile, which disposes this plugin's own
  context mid-request, so the host half captures service instances at `apply()`
  time instead of resolving them per call.
- Preview URLs are served from the plugin, not from the skin packages, so a skin
  that ships no screenshots still shows real art when it is in the curated map.

MIT — see [LICENSE](LICENSE).
