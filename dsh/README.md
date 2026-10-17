# GeoGebra Construction for DeepSeek Harness

本包是独立的 DSH npm bundle，提供 `ggb-construction` Skill、同一套编译后的 GeoGebra CLI、页面与安装器。无需 Codex、开发仓库或另一个插件的缓存。数学程序、核验与 GGB 交付仍使用统一管线。

源码工程中的 Desktop 验证、日志留存与修复提示词见 [操作流程](../docs/dsh-desktop-validation.md)。该流程用于开发协作，不代替下文的独立安装包验收；随包阅读时请到源码仓库查阅此文档。

## 安装到独立 headless profile

下载同版本的 `ggb-plugins-dsh-<version>.tgz` 和 `.tgz.sha256`，先运行 `shasum -a 256 -c <file>.tgz.sha256`。需要本机 DSH、Node.js 22+、pnpm 11、curl 和 unzip。

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

构造、核验、重载和自动预览均 headless。文件写在工作区，不能写入安装包。交付目录包含 result.ggb、request.json、verification.json、preview.png 和 manifest.json。失败或未验证阻止正式交付，规则见包内 Skill 引用。

成功后，持续运行的调用方可以在系统默认浏览器打开已生成文件：

```sh
node <installed-plugin>/dist/src/cli.js preview --delivery /absolute/delivery
```

自动验收使用 `preview --delivery <dir> --headless --once`，复核完成后退出并释放资源。一次性 headless 宿主退出可能回收子进程，不能依靠它保留最终窗口。通过页面“结束预览”或取消进程释放服务，不回写 GGB；仅关闭默认浏览器标签页不保证结束进程。

升级使用同一 profile 的 `dsh plugin --profile ggb-plugins add <new.tgz>`，然后在实际包目录重新执行安装器并重启该 profile。卸载使用 `dsh plugin --profile ggb-plugins remove @local/ggb-plugins-dsh`，不会删除工作区交付文件。

配置 `pluginRoot`（兼容旧字段 skillRoot）可显式指定完整包的绝对路径；两字段同时提供时必须指向同一包，防止 Skill 与 CLI 混版。默认无需配置。源码开发可以从本模块的父目录取得共享资源，但发布验收必须在仓库外安装完整 TGZ。

本包是本地分发包，不等于已上架 DSH 插件市场。二维命令开放和全部命令验收的区别见包内 references/command-coverage.md。GeoGebra 许可见 THIRD_PARTY_NOTICES.md。

TGZ 中的 `dependencies.lock` 与源码 pnpm-lock.yaml 内容相同。npm 自动排除原名称；安装器先还原锁文件，再用 `--ignore-workspace --frozen-lockfile` 安装本包依赖，避免使用上层 DSH profile 的 workspace。
