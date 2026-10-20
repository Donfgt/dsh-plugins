window.__ModuleLoader__.load({
	id: "dsh-sidebar-extras",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const h = React.createElement;

		const API = "/sidebar-extras/api";
		const SKINS_PANEL = "sidebar-extras-skins";
		const STYLE_ID = "dsh-sidebar-extras-style";

		/* ---------------------------------------------------------------- data */

		async function getJson(path, options) {
			const response = await fetch(`${API}${path}`, Object.assign({ headers: { accept: "application/json" } }, options));
			let payload;
			try {
				payload = await response.json();
			} catch (error) {
				throw new Error(`响应不是 JSON（HTTP ${response.status}）`);
			}
			if (!response.ok) throw new Error(payload && payload.message ? payload.message : `HTTP ${response.status}`);
			return payload;
		}

		function postJson(path, body) {
			return getJson(path, {
				method: "POST",
				headers: { accept: "application/json", "content-type": "application/json" },
				body: JSON.stringify(body || {})
			});
		}

		/* --------------------------------------------------------------- styles */

		const CSS = `
/* compat: full-bleed skins (fixed iframes/canvas overlays) paint over the
   bottom-right corner that dsh-whale-widget docks to. The widget's own root
   sits at z-index 9999; lift it above any skin layer. Its root is
   pointer-events:none, so this never blocks the UI underneath. */
html body .dshwv-root, html body > .dshwv-root { z-index: 100000 !important; }
.dshx-page { display: flex; flex-direction: column; gap: 16px; padding: 20px 24px; height: 100%; overflow: auto; }
.dshx-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.dshx-title { font-size: 16px; font-weight: 600; margin: 0; }
.dshx-sub { font-size: 12px; opacity: .6; margin: 0; }
.dshx-btn { height: 28px; padding: 0 12px; border-radius: 8px; font: inherit; font-size: 12px; cursor: pointer;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent); background: transparent; color: inherit; }
.dshx-btn:hover:not(:disabled) { background: color-mix(in srgb, currentColor 8%, transparent); }
.dshx-btn:disabled { opacity: .45; cursor: default; }
.dshx-btn.primary { background: color-mix(in srgb, currentColor 12%, transparent); }
.dshx-note { font-size: 12px; opacity: .62; line-height: 1.6; margin: 0; }
.dshx-error { font-size: 12px; color: #e05353; margin: 0; }
.dshx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.dshx-skin { border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 12px; overflow: hidden;
  display: flex; flex-direction: column; background: color-mix(in srgb, currentColor 2%, transparent); }
.dshx-skin[data-active="true"] { border-color: color-mix(in srgb, currentColor 45%, transparent); }
.dshx-shot { position: relative; width: 100%; aspect-ratio: 16 / 10; background: color-mix(in srgb, currentColor 6%, transparent);
  overflow: hidden; display: block; }
.dshx-shot img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dshx-empty-shot { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 26px; font-weight: 700; opacity: .25; letter-spacing: .08em; }
.dshx-badge { position: absolute; top: 8px; left: 8px; padding: 2px 7px; border-radius: 999px; font-size: 10px;
  background: rgba(20, 20, 20, .72); color: #fff; letter-spacing: .04em; }
.dshx-skin-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
.dshx-skin-name { font-size: 13px; font-weight: 600; margin: 0; word-break: break-word; }
.dshx-skin-meta { font-size: 11px; opacity: .6; margin: 0; }
.dshx-skin-actions { display: flex; gap: 8px; margin-top: auto; }
.dshx-skin-actions .dshx-btn { flex: 1; }
`;

		function ensureStyle() {
			if (typeof document === "undefined") return;
			if (document.getElementById(STYLE_ID)) return;
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = CSS;
			document.head.appendChild(style);
		}

		/* ---------------------------------------------------------- skins panel */

		function SkinCard(props) {
			const skin = props.skin;
			const busy = props.busy === skin.name;
			const active = skin.enabled;
			const [broken, setBroken] = React.useState(false);
			const showImage = Boolean(skin.preview) && !broken;
			return h("div", { className: "dshx-skin", "data-active": active ? "true" : "false" },
				h("div", { className: "dshx-shot" },
					showImage ? h("img", {
						src: skin.preview,
						alt: `${skin.short} 预览`,
						onError: () => setBroken(true)
					}) : null,
					!showImage ? h("div", { className: "dshx-empty-shot" }, skin.short.slice(0, 2).toUpperCase()) : null,
					active ? h("span", { className: "dshx-badge" }, "使用中") : null),
				h("div", { className: "dshx-skin-body" },
					h("p", { className: "dshx-skin-name" }, skin.short),
					h("p", { className: "dshx-skin-meta" }, skin.version ? `v${skin.version}` : skin.name),
					h("div", { className: "dshx-skin-actions" },
						h("button", {
							type: "button",
							className: "dshx-btn primary",
							disabled: active || busy || !skin.installed,
							onClick: () => props.onApply(skin)
						}, active ? "当前皮肤" : busy ? "切换中…" : "换成这个"),
						h("button", {
							type: "button",
							className: "dshx-btn",
							disabled: busy || !skin.removable,
							title: skin.removable ? "从当前 profile 移除这个皮肤包" : "这个包不可移除",
							onClick: () => props.onRemove(skin)
						}, busy ? "…" : "删除"))));
		}

		function SkinsPage() {
			const [state, setState] = React.useState({ status: "loading", skins: [] });
			const [busy, setBusy] = React.useState(null);
			const [message, setMessage] = React.useState(null);

			const load = React.useCallback(() => {
				getJson("/skins").then((payload) => {
					setState({ status: "ready", skins: payload.skins || [] });
				}).catch((error) => {
					setState({ status: "error", skins: [], message: error.message });
				});
			}, []);

			React.useEffect(() => {
				load();
			}, [load]);

			const act = (skin, kind) => {
				if (kind === "remove" && !window.confirm(`从当前 profile 移除「${skin.short}」？`)) return;
				setBusy(skin.name);
				setMessage(null);
				const request = kind === "apply" ? postJson("/skins/apply", { name: skin.name }) : postJson("/skins/remove", { name: skin.name });
				request.then((payload) => {
					if (payload && payload.ok === false && payload.message) setMessage(payload.message);
					else setMessage(kind === "apply" ? `已切换到 ${skin.short}` : `已移除 ${skin.short}`);
				}).catch((error) => {
					setMessage(error.message);
				}).finally(() => {
					setBusy(null);
					load();
				});
			};

			const skins = state.skins || [];
			return h("div", { className: "dshx-page" },
				h("div", { className: "dshx-head" },
					h("div", null,
						h("h2", { className: "dshx-title" }, "皮肤"),
						h("p", { className: "dshx-sub" }, "点击「换成这个」立即切换；同一时间只保留一套皮肤生效。")),
					h("button", { type: "button", className: "dshx-btn", onClick: load }, "刷新")),
				message ? h("p", { className: "dshx-note" }, message) : null,
				state.status === "error" ? h("p", { className: "dshx-error" }, state.message) : null,
				skins.length === 0 && state.status === "ready" ? h("p", { className: "dshx-note" }, "还没有安装任何皮肤。让 agent 帮你装一个，装完会出现在这里。") : null,
				h("div", { className: "dshx-grid" }, skins.map((skin) =>
					h(SkinCard, {
						key: skin.name,
						skin,
						busy,
						onApply: (target) => act(target, "apply"),
						onRemove: (target) => act(target, "remove")
					}))));
		}

		/* ----------------------------------------------------------------- icons */

		function SkinsIcon(props) {
			const size = (props && props.size) || 16;
			return h("svg", { width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
				h("circle", { cx: "8", cy: "8", r: "6.2", stroke: "currentColor", "stroke-width": "1.2", opacity: "0.75" }),
				h("circle", { cx: "8", cy: "8", r: "2.6", fill: "currentColor", opacity: "0.55" }),
				h("path", { d: "M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2", stroke: "currentColor", "stroke-width": "1.2", "stroke-linecap": "round", opacity: "0.55" }));
		}

		/* ------------------------------------------------------------------ apply */

		const inject = ["slots"];

		function apply(ctx) {
			ensureStyle();
			ctx.effect(() => () => {
				const style = typeof document === "undefined" ? null : document.getElementById(STYLE_ID);
				if (style) style.remove();
			});
			ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: SKINS_PANEL }, SkinsPage));
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: SKINS_PANEL,
				order: 20,
				label: "皮肤"
			}, SkinsIcon));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
