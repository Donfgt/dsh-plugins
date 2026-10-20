# dsh-plugins

DeepSeek Harness（DSH）插件合集。**一个插件一个目录，按类型分类**，每个插件自带完整的安装指令与说明。

全部插件都在 Windows + DSH `0.2.1-rc.2` 上实测安装、启动并验证过行为。

## 分类

| 分类 | 目录 | 放什么 |
|---|---|---|
| 界面 | `plugins/ui/` | 侧边栏条目、主面板、常驻小组件这类客户端 UI 扩展 |
| 皮肤 | `plugins/themes/` | 整套换肤 / 主题包（按需新增） |
| 工具 | `plugins/tools/` | 给模型新增工具、命令或工作流 |
| 集成 | `plugins/integrations/` | 对接外部服务：MCP、webhook、第三方 API |

> 目录只随插件增加而创建；目前只有「界面」下有一个插件。

## 插件清单

### 界面

#### [dsh-sidebar-extras](plugins/ui/dsh-sidebar-extras/)

侧边栏左下角常驻一枚 **DeepSeek 余额**胶囊（60 秒刷新），点开是余额 / 今日·7 天·30 天消耗面板；侧边栏另加一个「皮肤」入口，点进去是已安装皮肤的**预览图画廊**，支持一键切换、删除。

发布包（v0.1.0）安装：

```powershell
dsh plugin --profile web add "https://github.com/Donfgt/dsh-plugins/releases/download/v0.1.0/dsh-sidebar-extras-0.1.0.tgz"
```

本地 clone 后安装（推荐用于改动源码）：

```powershell
dsh plugin --profile web add "link:C:\path\to\dsh-plugins\plugins\ui\dsh-sidebar-extras"
```

原理、接口与限制见 [插件 README](plugins/ui/dsh-sidebar-extras/README.md)。

## 安装方式

**1. 发布包（tarball，推荐）**

每个插件发布时打一个 `.tgz` 到 Releases，安装时直接指向该文件，规格固定、不会随仓库结构变化：

```powershell
dsh plugin --profile web add "https://github.com/Donfgt/dsh-plugins/releases/download/<tag>/<插件>-<版本>.tgz"
```

**2. 本地 link（开发用）**

```powershell
dsh plugin --profile web add "link:C:\path\to\dsh-plugins\plugins\<分类>\<插件目录>"
```

改完源码触发一次 profile 重组即可加载新代码 —— 本仓库所有插件都不需要构建步骤。

**3. GitHub 子目录（免 clone，但见下方已知问题）**

```powershell
dsh plugin --profile web add "github:Donfgt/dsh-plugins#path:/plugins/ui/dsh-sidebar-extras"
```

## 卸载

```powershell
dsh plugin --profile web remove <包名>
```

## 已知问题

**pnpm 会丢掉 git 子目录规格里的 `#path:`。** 用方式 3 安装后，`profile/package.json` 里只留下 `git+https://github.com/Donfgt/dsh-plugins.git`（路径只存在于 lockfile）。该 profile 之后再 `add` 别的插件时，pnpm 会按不带路径的规格重新解析，导致这个包被换掉、`dsh` 报 `cannot resolve profile bundle`。实测复现过。规避：优先用方式 1 或 2；一旦踩到，重新执行一次安装命令即可恢复。

**TLS 被中间人时 tarball 装不上。** 若机器上有代理/加速器用自签根证书解密 HTTPS，pnpm 会报 `unable to verify the first certificate`。正确做法是把该根证书装进系统信任链（Node 24 加 `--use-system-ca` 即可识别），不要用 `--config.strict-ssl=false` 关掉校验。git 规格走 `git` 自己的 TLS 栈，通常不受影响。

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

新增插件时：在对应分类下建目录、补齐上面几个文件、在「插件清单」里加一节并附安装命令；发版时在该目录 `npm pack`，把产物传到 Releases。

## License

MIT，见 [LICENSE](LICENSE)。
