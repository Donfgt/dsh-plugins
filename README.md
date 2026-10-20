# dsh-plugins

DeepSeek Harness（DSH）插件合集。**一个插件一个目录，按类型分类**，每个插件自带完整的安装指令与说明。

全部插件都在 Windows + DSH `0.2.1-rc.2` 上实测安装、启动并验证过行为。

## 目录

| 分类 | 目录 | 放什么 |
|---|---|---|
| 界面 | [`plugins/ui/`](plugins/ui/) | 侧边栏条目、主面板、常驻小组件这类客户端 UI 扩展 |
| 皮肤 | `plugins/themes/` | 整套换肤 / 主题包（按需新增） |
| 工具 | `plugins/tools/` | 给模型新增工具、命令或工作流 |
| 集成 | `plugins/integrations/` | 对接外部服务：MCP、webhook、第三方 API |

> 目录只随插件增加而创建；目前只有「界面」下有一个插件。

## 插件清单

### 界面 · `plugins/ui/`

#### [dsh-sidebar-extras](plugins/ui/dsh-sidebar-extras/)

侧边栏左下角常驻一枚 **DeepSeek 余额**胶囊（实时刷新），点开是余额 / 今日·7 天·30 天消耗面板；侧边栏另加一个「皮肤」入口，点进去是已安装皮肤的**预览图画廊**，支持一键切换、删除。

```powershell
dsh plugin --profile web add "github:Donfgt/dsh-plugins#path:/plugins/ui/dsh-sidebar-extras"
```

细节、原理与限制见 [插件 README](plugins/ui/dsh-sidebar-extras/README.md)。

## 三种安装方式

**1. 直接从本仓库装（推荐，无需 clone）**

```powershell
dsh plugin --profile web add "github:Donfgt/dsh-plugins#path:/plugins/<分类>/<插件目录>"
```

`#path:` 指向仓库内的子目录，pnpm 会浅克隆后按该目录的 `package.json` 安装。

**2. 本地开发用 link**

```powershell
dsh plugin --profile web add "link:C:\path\to\dsh-plugins\plugins\ui\dsh-sidebar-extras"
```

改了源码后触发一次 profile 重组（保存 `cordis.patch.yml` 或重装一次）即可加载新代码 —— 本项目所有插件都不需要构建步骤。

**3. 发布到 npm 后**

```powershell
dsh plugin --profile web add <包名>
```

## 卸载

```powershell
dsh plugin --profile web remove <包名>
```

## 目录约定

```
.
├── README.md                       ← 你正在看的清单
├── LICENSE
└── plugins/
    └── <分类>/
        └── <插件目录>/
            ├── README.md           ← 该插件的安装指令 + 说明
            ├── package.json        ← name 即安装后的包名
            ├── cordis.patch.yml    ← bundle patch，把插件挂进 profile
            ├── lib/index.js        ← 宿主侧（Node ESM）
            ├── lib/client.js       ← 浏览器侧（lazy-CJS，无需构建）
            └── ...                 ← 静态资源（预览图等）
```

新增插件时：在对应分类下建目录、补齐上面几个文件、在根 README 的「插件清单」里加一行安装命令。

## License

MIT，见 [LICENSE](LICENSE)。
