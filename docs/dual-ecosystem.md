# 双生态封装契约

本文只维护 Codex 与 DeepSeek Harness 的包结构、发现与路径契约。产品需求及设计取舍见[主设计](ggb-plugins-design.md#8-宿主兼容与依赖取舍)，构建发布见 [AGENTS](../AGENTS.md)，安装分别见[Codex 安装说明](../codex/README.md)和 [DSH 随包说明](../dsh/README.md)，版本与验收见 [CHANGES](CHANGES.md)。

## 包结构

| 项目 | Codex | DeepSeek Harness |
| --- | --- | --- |
| 容器 | ZIP | npm TGZ |
| 根清单 | plugin.json，Agent Plugins schema | package.json 的 dsh.bundle.patch |
| 宿主入口 | .agents/plugins/marketplace.json | cordis.patch.yml 插入 @local/ggb-plugins-dsh |
| Skill 发现 | skills/ggb-construction/SKILL.md，允许隐式调用 | 提供方注入 skills，注册模型和用户可调用的候选技能 |
| 引用定位 | 安装根下的 Skill 目录 | resourceBase 指向本包 Skill 目录 |
| 依赖锁文件 | pnpm-lock.yaml | dependencies.lock，安装时还原为 pnpm-lock.yaml |

两个容器复制同一份 Skill 源文件、引用、八个编译模块、页面、安装器和 runtime 锁。Codex 另含 OpenAI 元数据；DSH 另含 index.js、Cordis 补丁和 locale。排除源码、测试、依赖目录、runtime、浏览器及用户产物。文件清单由 package-plugin 和 DSH files 字段决定，不在本文件重复列举全部路径。

## DSH 提供方与路径

提供方仅执行注册和加载，不新增数学工具或模型循环。候选技能使用稳定名称 ggb-construction；正文从本包读取，加载时在内存中追加 CLI 的绝对路径，不改写共享文件。

默认定位本模块目录；源码开发可定位 dsh/index.js 的父目录。显式 pluginRoot、兼容字段 skillRoot 和环境覆盖必须是绝对路径；两个配置字段同时存在时必须指向同一包。缺少 CLI 时报告安装缺口，不回退到 Codex 缓存或另一 checkout。

DSH 宿主可能运行在 Electron 中，因此调用 PATH 中 Node.js 22+，不能把 process.execPath 无条件当作 Node。CLI 与资源始终来自同一包。

## 安装准备与兼容性

npm 自动排除 pnpm-lock.yaml。TGZ 因此保存相同内容的 dependencies.lock，安装器先还原，再以 --ignore-workspace 限定 pnpm 调用到本包，避免继承上层 profile 的 workspace。安装器不定义 npm 安装生命周期脚本；依赖准备由用户显式执行 setup-plugin。

根 package.json、plugin.json 和 dsh/package.json 版本一致。两包使用相同请求和交付契约；协议明细只在 Skill 能力契约维护。插件格式兼容、本地安装成功与公共市场审核是不同事实，不因生成归档而宣称市场上架。

规范依据：[OpenAI 插件打包](https://developers.openai.com/plugins/build/plugins)、[DSH bundle 与 profile](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish)。具体宿主与平台的已验收范围从 CHANGES 的记录入口查询。


## 受限 SDK Server 入口

DSH 包新增服务端公开入口，与默认桌面 Skill 入口分开：

| 导出 | 契约 |
| --- | --- |
| `./server` | Cordis 插件，注入 tools 和 systemPrompt，注册 inspect/request/check/build 四工具 |
| `./server.patch.yml` | sdk-minimal 的受限覆盖层，关闭通用 shell、文件及目录工具和原始日志扩展 |
| `./installation` | 解析当前完整安装包、校验版本和 Worker Skill 摘要，加载 Worker 正文 |
| `./schemas` | 纯解析函数及 TypeScript 类型：工具协议 3、执行上下文 2、构建回执 2；不加载浏览器 |
| `./drafts` | 有界分段请求、revision、不可变检查句柄；无文件或执行能力 |
| `./cli` | 现有公开 CLI，仍使用 CLI envelope 1；尚未消费新的执行上下文或产生新构建回执 |

服务端入口当前只接受已验证 SDK `0.2.1-rc.2`。宿主必须从实际 SDK 包读取版本，传入
`sdkVersion`；server.patch 通过 `GGB_DSH_SDK_VERSION` 接收。此约束不收紧桌面入口的兼容声明：
桌面 bundle 的 `engines.dsh` 为 `>=0.2.1-rc.2 <0.2.2`，已在 DSH `0.2.1-rc.3` 验证安装；
SDK Server 入口仍只接受 `0.2.1-rc.2`。
Worker Skill 通过 systemPrompt.section 在启动时直接加载，不依赖 skills 服务、模型发现或桌面 CLI 注入。
安装描述只声明 runtime 锁身份，不代表浏览器已经准备或 doctor 已通过；实际发行包摘要由宿主独立计算。

本入口的工具客户端只发送宿主协议 3，拒绝旧工具网关 version 1/2。没有有效宿主上下文时执行必须失败。
公开 `ggb-plugins-dsh/executor` 接收宿主上下文，调用现有 build，并输出执行器协议 3 响应与回执 2。
`ggb-plugins-dsh/delivery-contract` 导出纯报告门禁，与 build/preview 共享实现，不启动浏览器。
桌面 CLI 继续输出 envelope 1。Web 宿主的产物接收、提交、取消和槽位隔离由宿主拥有；默认切换单独实施。
完整宿主设计及字段定义见 ggb-agent 的 `docs/ggb-dsh-installed-plugin-design.md`；本包的可执行契约
以 `src/host-protocol.ts` 为准，不在本文复制字段表。


服务端 check/inspect/build 统一使用公开 executor 的 operation 参数。
`./execution-schemas` 发布执行器协议 3、check/inspect 数据校验及有界 inspect 投影。
构建阶段证明位于执行响应，不改变 receipt 2 的产物证明结构。
宿主只有验证响应绑定和进程安全退出后，才能使用 preflight 拒绝退还 build 次数。

受限服务端的模型参数、分段与局部修复规则见 [DSH 请求契约](../dsh/README.md#单次完整请求)。
领域请求仍为 2，check/build 最终消费组装后的完整请求并保留全部核验门禁。
