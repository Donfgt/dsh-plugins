window.__ModuleLoader__.load({
	id: "dsh-sidebar-extras",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const h = React.createElement;

		const API = "/sidebar-extras/api";
		const BALANCE_PANEL = "sidebar-extras-balance";
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

		function money(value, currency) {
			const number = Number(value);
			if (!Number.isFinite(number)) return "—";
			const symbol = currency === "USD" ? "$" : "¥";
			return `${symbol}${number.toFixed(2)}`;
		}

		/* --------------------------------------------------------------- styles */

		const CSS = `
.dshx-pill { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; border-radius: 8px;
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent); background: transparent; color: inherit;
  font: inherit; font-size: 12px; line-height: 1; cursor: pointer; max-width: 100%; }
.dshx-pill:hover { background: color-mix(in srgb, currentColor 7%, transparent); }
.dshx-pill[data-state="error"] { opacity: .65; }
.dshx-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: #35c46a; flex: none; }
.dshx-pill[data-state="error"] .dshx-pill-dot { background: #e05353; }
.dshx-pill[data-state="loading"] .dshx-pill-dot { background: #d0a020; }
.dshx-mono { font-variant-numeric: tabular-nums; }
.dshx-page { display: flex; flex-direction: column; gap: 16px; padding: 20px 24px; height: 100%; overflow: auto; }
.dshx-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.dshx-title { font-size: 16px; font-weight: 600; margin: 0; }
.dshx-sub { font-size: 12px; opacity: .6; margin: 0; }
.dshx-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.dshx-card { border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 10px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 6px; }
.dshx-card-label { font-size: 11px; opacity: .6; letter-spacing: .02em; }
.dshx-card-value { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.dshx-card-value.small { font-size: 14px; font-weight: 500; }
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

		/* --------------------------------------------------------- balance pill */

		function BalancePill(props) {
			const wide = props.wide !== false;
			const [state, setState] = React.useState({ status: "loading" });
			React.useEffect(() => {
				let alive = true;
				const load = () => {
					getJson("/balance").then((payload) => {
						if (alive) setState({ status: "ready", payload });
					}).catch((error) => {
						if (alive) setState({ status: "error", message: error.message });
					});
				};
				load();
				const timer = setInterval(load, 60000);
				return () => {
					alive = false;
					clearInterval(timer);
				};
			}, []);
			const payload = state.payload;
			const failed = state.status === "error" || (payload && payload.ok === false);
			const total = payload && payload.ok ? money(payload.total, payload.currency) : "";
			const label = failed ? "余额读取失败" : state.status === "ready" ? total : "余额加载中";
			return h("button", {
				type: "button",
				className: "dshx-pill",
				"data-state": failed ? "error" : state.status === "ready" ? "ready" : "loading",
				title: failed ? (state.message || (payload && payload.message) || "余额读取失败") : `DeepSeek 余额 ${total}`,
				onClick: () => props.openPanel(BALANCE_PANEL)
			}, h("span", { className: "dshx-pill-dot" }), wide ? h("span", { className: "dshx-mono" }, label) : null);
		}

		/* -------------------------------------------------------- balance panel */

		function BalancePage() {
			const [state, setState] = React.useState({ status: "loading" });
			const [refreshing, setRefreshing] = React.useState(false);

			const load = React.useCallback((force) => {
				setRefreshing(true);
				getJson(force ? "/balance?refresh=1" : "/balance").then((payload) => {
					setState({ status: "ready", payload });
				}).catch((error) => {
					setState({ status: "error", message: error.message });
				}).finally(() => setRefreshing(false));
			}, []);

			React.useEffect(() => {
				load(false);
				const timer = setInterval(() => load(false), 60000);
				return () => clearInterval(timer);
			}, [load]);

			const payload = state.payload;
			const usage = (payload && payload.usage) || {};
			const ok = payload && payload.ok;
			return h("div", { className: "dshx-page" },
				h("div", { className: "dshx-head" },
					h("div", null,
						h("h2", { className: "dshx-title" }, "DeepSeek 余额与用量"),
						h("p", { className: "dshx-sub" }, payload && payload.at ? `更新于 ${new Date(payload.at).toLocaleTimeString()}` : "正在读取…")),
					h("button", { type: "button", className: "dshx-btn", disabled: refreshing, onClick: () => load(true) },
						refreshing ? "刷新中…" : "刷新")),
				!ok && payload && payload.message ? h("p", { className: "dshx-error" }, payload.message) : null,
				state.status === "error" ? h("p", { className: "dshx-error" }, state.message) : null,
				ok ? h("div", { className: "dshx-cards" },
					h("div", { className: "dshx-card" },
						h("span", { className: "dshx-card-label" }, "当前余额"),
						h("span", { className: "dshx-card-value" }, money(payload.total, payload.currency)),
						h("span", { className: "dshx-sub" }, payload.available ? "可用" : "不可用")),
					h("div", { className: "dshx-card" },
						h("span", { className: "dshx-card-label" }, "赠送余额"),
						h("span", { className: "dshx-card-value small" }, money(payload.granted, payload.currency))),
					h("div", { className: "dshx-card" },
						h("span", { className: "dshx-card-label" }, "充值余额"),
						h("span", { className: "dshx-card-value small" }, money(payload.toppedUp, payload.currency)))) : null,
				h("div", { className: "dshx-cards" },
					h("div", { className: "dshx-card" },
						h("span", { className: "dshx-card-label" }, "今日消耗（推算）"),
						h("span", { className: "dshx-card-value" }, money(usage.today || 0, payload && payload.currency))),
					h("div", { className: "dshx-card" },
						h("span", { className: "dshx-card-label" }, "近 7 天（推算）"),
						h("span", { className: "dshx-card-value small" }, money(usage.week || 0, payload && payload.currency))),
					h("div", { className: "dshx-card" },
						h("span", { className: "dshx-card-label" }, "近 30 天（推算）"),
						h("span", { className: "dshx-card-value small" }, money(usage.month || 0, payload && payload.currency)))),
				h("p", { className: "dshx-note" },
					"DeepSeek 没有公开的用量查询接口，所以「消耗」是按余额差额推算的：每次读取余额会存一个样本，余额下降的部分累加即为支出，充值造成的上升会被忽略。",
					usage.samples ? ` 目前有 ${usage.samples} 个样本。` : " 目前还没有积累到足够的样本，先在页面上停留一会儿。"));
		}

		/* ---------------------------------------------------------- skins panel */

		function SkinCard(props) {
			const skin = props.skin;
			const busy = props.busy === skin.name;
			const active = skin.enabled;
			return h("div", { className: "dshx-skin", "data-active": active ? "true" : "false" },
				h("div", { className: "dshx-shot" },
					skin.preview ? h("img", { src: skin.preview, alt: `${skin.short} 预览`, loading: "lazy" }) : null,
					!skin.preview ? h("div", { className: "dshx-empty-shot" }, skin.short.slice(0, 2).toUpperCase()) : null,
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

		const inject = ["slots", "layout"];

		function apply(ctx) {
			ensureStyle();
			ctx.effect(() => () => {
				const style = typeof document === "undefined" ? null : document.getElementById(STYLE_ID);
				if (style) style.remove();
			});
			ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: BALANCE_PANEL }, BalancePage));
			ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: SKINS_PANEL }, SkinsPage));
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "deepseek-balance",
				order: 10,
				label: "DeepSeek 余额",
				inject: () => ({ openPanel: (id) => ctx.layout.selectPanel(id) })
			}, BalancePill));
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
