# GeoGebra Construction for DeepSeek Harness

本包是独立的 DSH npm bundle，提供 `ggb-construction` Skill、同一套编译后的 GeoGebra CLI、页面与安装器。无需 Codex、开发仓库或另一个插件的缓存。数学程序、核验与 GGB 交付仍使用统一管线。

源码工程中的 Desktop 验证、日志留存与修复提示词见 [操作流程](docs/dsh-desktop-validation.md)。该流程用于开发协作，不代替下文的独立安装包验收；随包阅读时请到源码仓库查阅此文档。

## 从 npm 安装（推荐）

DSH bundle 已发布为 npm 包 `ggb-plugins-dsh`。桌面应用安装：

```sh
dsh plugin --profile desktop add ggb-plugins-dsh@0.8.2
node ~/.dsh/profiles/desktop/node_modules/ggb-plugins-dsh/scripts/setup-plugin.mjs
```

然后重启 DSH。升级时把 `@0.8.2` 换成新版本；版本列表见
`npm view ggb-plugins-dsh versions`。发布流程见
[发布到 npm](https://github.com/Jack7510/ggb-plugins/blob/main/docs/publish-npm.md)。

不需要构建权限，也不需要校验压缩包；npm 分发的是预编译产物。

## 用一句对话安装（桌面应用）

给桌面用户发这一句，让他粘贴到 DSH 对话框；DSH 会自己下载、校验并安装：

```text
请安装 npm 包 ggb-plugins-dsh@0.8.2 到 desktop profile，运行安装副本里的
setup-plugin，然后提醒我重启 DSH。
```

英文版：

```text
Install the npm package ggb-plugins-dsh@0.8.2 into the desktop profile, run
setup-plugin in the installed copy, then remind me to restart DSH.
```

升级时把两处 `0.8.1` 换成新版本号即可；不要混用不同版本的包和校验文件。

### DSH 需要执行的动作

1. 检查前置：Node.js 22+、pnpm 11、`curl`、`unzip`，以及 Google Chrome 或
   Microsoft Edge。
2. 下载两个文件到临时目录，运行 `shasum -a 256 -c
   ggb-plugins-dsh-0.8.1.tgz.sha256`；校验不通过就停止，不安装。
3. 确认 profile：桌面应用使用 `desktop`（目录
   `~/.dsh/profiles/desktop`）；若设置了 `DSH_PROFILE`，以它为准。
4. 安装：`dsh plugin --profile desktop add <tgz 绝对路径>`。
5. 解析实际安装目录：

   ```sh
   node -p "require.resolve('@local/ggb-plugins-dsh/package.json', {paths: ['$HOME/.dsh/profiles/desktop']})"
   ```

   取该路径所在目录作为 `<installed-plugin>`。
6. 在安装副本里准备依赖与 runtime：
   `node <installed-plugin>/scripts/setup-plugin.mjs`。
7. 就绪检查：`node <installed-plugin>/dist/src/cli.js doctor`，必须返回
   `ok: true`。
8. 告诉用户**重启 DSH 桌面应用**；bundle 在启动时加载，重启前仍是旧版本。

### 给 DSH 的约束

- 只从本仓库的 Release 下载，不装第三方镜像；不跳过校验和。
- 不改动用户已有的交付文件和工作区；安装失败时保留原始错误，不重复试错。
- 桌面 profile 的插件由桌面应用管理；不要用
  `--from-default-profile` 初始化它。
- 校验和只证明文件完整，不代表公共目录审核通过。

## 安装到独立 headless profile

下载同版本的 `ggb-plugins-dsh-<version>.tgz` 和 `.tgz.sha256`，先运行 `shasum -a 256 -c <file>.tgz.sha256`。需要本机 DSH、Node.js 22+、pnpm 11、curl 和 unzip，以及一个 Chromium 内核浏览器（Google Chrome 或 Microsoft Edge）；安装器直接使用该浏览器，不再下载 Chromium。

```sh
dsh --profile ggb-plugins --from-default-profile headless --dump-config
dsh plugin --profile ggb-plugins add /absolute/path/ggb-plugins-dsh-<version>.tgz
```

只在首次创建独立 profile 时使用 `--from-default-profile`；它会重置同名 profile，升级时不要重复使用。不要对现有 desktop profile 执行此初始化。桌面 profile 由桌面应用的插件管理器维护，需要另行验收。

从 profile 的包解析结果取得实际 `<installed-plugin>`，然后准备该包自己的 runtime：

```sh
node <installed-plugin>/scripts/setup-plugin.mjs
```

例如，使用本机 Node 从 profile 解析包路径：

```sh
node -p "require.resolve('@local/ggb-plugins-dsh/package.json', {paths: ['/absolute/path/to/profile']})"
```

取结果所在目录作为 `<installed-plugin>`。可向安装器传入官方 GeoGebra ZIP 绝对路径；安装器会验证固定摘要。GeoGebra、Chromium 和 node_modules 不随包再分发。DSH 包依赖中的 Playwright 与运行时锁定版本相同；无需额外模型 API Key，模型认证沿用宿主配置。

```sh
dsh --profile ggb-plugins '用 GeoGebra 作三角形 ABC，取 AB 中点 M，连接 CM。全程 headless，保存 GGB、截图和核验报告，不打开可见窗口。'
```

新会话的技能目录应出现 `ggb-construction`。`dsh.bundle.patch` 插入提供方，提供方通过 `skills` 服务注册候选技能。`resourceBase` 指向包内共享 Skill 的目录，引用文件随包保存。加载正文时注入当前包的 CLI 绝对路径，不写入 Skill 文件，也不寻找 Codex 缓存。可用 `dsh --profile ggb-plugins --dump-config` 检查配置层；不要将包含个人配置的完整输出公开。

## 运行与升级

构造、核验、重载和自动预览均 headless。文件写在工作区，不能写入安装包。交付目录包含按题目命名的 GGB、request.json、verification.json、preview.png 和 manifest.json。失败或未验证阻止正式交付，规则见包内 Skill 引用。

成功后，持续运行的调用方可以在系统默认浏览器打开已生成文件：

```sh
node <installed-plugin>/dist/src/cli.js preview --delivery /absolute/delivery
```

自动验收使用 `preview --delivery <dir> --headless --once`，复核完成后退出并释放资源。一次性 headless 宿主退出可能回收子进程，不能依靠它保留最终窗口。通过页面“结束预览”或取消进程释放服务，不回写 GGB；页面加载后预览进程自动退出，窗口继续可用；关闭窗口结束预览。

升级使用同一 profile 的 `dsh plugin --profile ggb-plugins add <new.tgz>`，然后在实际包目录重新执行安装器并重启该 profile。卸载使用 `dsh plugin --profile ggb-plugins remove @local/ggb-plugins-dsh`，不会删除工作区交付文件。

配置 `pluginRoot`（兼容旧字段 skillRoot）可显式指定完整包的绝对路径；两字段同时提供时必须指向同一包，防止 Skill 与 CLI 混版。默认无需配置。源码开发可以从本模块的父目录取得共享资源，但发布验收必须在仓库外安装完整 TGZ。

本包是本地分发包，不等于已上架 DSH 插件市场。二维命令开放和全部命令验收的区别见包内 references/command-coverage.md。GeoGebra 许可见 THIRD_PARTY_NOTICES.md。

TGZ 中的 `dependencies.lock` 与源码 pnpm-lock.yaml 内容相同。npm 自动排除原名称；安装器先还原锁文件，再用 `--ignore-workspace --frozen-lockfile` 安装本包依赖，避免使用上层 DSH profile 的 workspace。


## 受限 SDK Server 加载

Web 宿主使用公开子路径，不安装到用户 desktop profile，也不使用默认 Skill + shell 入口。
先在独立安装根安装精确 TGZ；无需修改本包文件。宿主通过包解析 `ggb-plugins-dsh/installation`，
调用 `loadInstallation()` 得到 serverPatch，再传给 `DeepSeekHarness` 的 patches。
使用独立 dshHome，并把实际 SDK 包版本通过 `GGB_DSH_SDK_VERSION` 注入子进程。
当前服务端入口只验证了 SDK `0.2.1-rc.2`；详细边界见 [双生态契约](https://github.com/Jack7510/ggb-plugins/blob/main/docs/dual-ecosystem.md#受限-sdk-server-入口)。

加载测试只需已编译安装包；构图前仍须 setup/doctor。工具依赖宿主协议 2 的认证网关，不能直接连接
旧版 Web 宿主。不得为启动成功而开启通用 shell，也不应把 SDK 初始化通过视为真实构图验收。


宿主执行使用 `ggb-plugins-dsh/executor`，参数为 `--request <json>`、`--context <json>` 和
`--package-integrity <发行包 SHA-256>`。`loadInstallation().executor` 指向此入口，`cli` 指向桌面 CLI。
上下文必须由认证宿主生成。执行器不接受模型指定的输出路径或基线身份，不调用 Provider，不自动重试。
成功与可分类的领域拒绝返回退出码 0、协议 2 envelope 和回执；意外执行错误以非零退出并写 stderr。
每份回执包含宿主 buildId、安装身份及按 kind 声明的产物相对路径、字节数和摘要。
宿主必须在进程退出确认后校验这些事实，调用公开的 `delivery-contract.validateHostDelivery`，
保留原始报告与 manifest 字节，再进行原子提交。不得把文件存在或 SDK 初始化成功作为交付依据。
