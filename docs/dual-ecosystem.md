# 双生态封装契约

本文只维护 Codex 与 DeepSeek Harness 的包结构、发现与路径契约。产品需求及设计取舍见[主设计](ggb-plugins-design.md#8-宿主兼容与依赖取舍)，构建发布见 [AGENTS](../AGENTS.md)，安装分别见[Codex 安装说明](installation.md)和 [DSH 随包说明](../dsh/README.md)，版本与验收见 [CHANGES](CHANGES.md)。

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
