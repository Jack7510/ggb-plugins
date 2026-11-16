# DSH 市场安装验证：2026-11-14

## 范围与结论

在本机 macOS、Node 26.5.1、pnpm 11.7.0、DSH 0.2.2-rc.1 上，使用独立临时 `DSH_HOME` 与 Web profile，验证 npm 已发布的 `ggb-plugins-dsh@0.8.5`。使用 headless 浏览器，不操作已有浏览器会话。

**市场安装包通过；从安装到可作图的完整流程未通过。**官方 GeoGebra runtime 下载超时，未完成安装器、doctor 和首题。未验证 Desktop、其他操作系统或 awesome/dsh-market 安装路径。

## 观察结果

1. npm registry 返回 0.8.5；其发布元数据的 `engines.dsh` 为 `>=0.2.1-rc.2 <0.2.2`。这与工作区中准备的后续范围不同，不能把未发布范围当成 0.8.5 的声明。
2. DSH CLI 在隔离 Web profile 安装 0.8.5 成功；pnpm 输出显示复用了其包缓存，因此不将其记为完全冷缓存安装。`--dump-config` 显示注册的 `ggb-plugins-dsh`。
3. 启动隔离 DSH Web，在插件页启用实验性“自定义插件索引”，添加项目发布的 jsDelivr 索引。Discover 显示“GeoGebra 数学作图”、版本 0.8.5 与教育分类。
4. 在隔离 profile 移除测试包后，从 Discover 点击安装并确认；界面返回“已安装”，随后点击“立即启用”。此前在同一实例中，插件页曾显示该包启用。该操作只验证包安装和界面状态，不能证明运行环境已就绪。
5. 在 CLI 首次安装后运行发布包的 `setup-plugin.mjs`。脚本检测到 Google Chrome；下载官方 GeoGebra ZIP 时，180 秒收到 31,424,512 / 33,454,039 字节后 curl 超时。脚本自动开始重试；为避免重复同一超时，人工中止。未借用其他 checkout 或客户端缓存的 GeoGebra runtime。未运行 doctor、构图或交付核验。
6. 读取 awesome 市场公开 `plugins.json` 时，未发现字符串 `ggb-plugins-dsh`；上游目标条目路径返回 404。收录状态会变化，提交前应复核。当前没有验证其他名称或所有潜在重复条目。

## 证据与后续

本次临时证据位于 `/private/tmp/ggb-market-validation-20261114/`，包括 `market-installed.png`、`installed.png`、Playwright 页面快照和隔离 DSH profile；临时目录可能被系统清理，不应作为永久验收归档。不要公开 profile、浏览器日志或本地访问令牌。

下次应在网络可完成官方 ZIP 下载的环境中重新运行安装器，保留 checksum、doctor、重启后 Skill 加载和首题 GGB/截图/逐条件核验，再判断完整路径。可按 [DSH 安装说明](../README.md) 使用经校验的官方 ZIP；不能跳过摘要或数学核验。市场条目可见和“已安装”均不等于运行环境就绪。
