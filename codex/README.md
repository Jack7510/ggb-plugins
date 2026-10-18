# GeoGebra Construction 安装与使用

本插件处理文字或图片中的二维数学与代数题。Codex 生成 GeoGebra 原生程序，本地工具执行、核验并交付可交互 GGB。需要支持插件的本地 Codex 客户端、Node.js 22+、pnpm 11、curl 和 unzip，以及一个 Chromium 内核浏览器（Google Chrome 或 Microsoft Edge）；工具直接使用已安装的浏览器，不再下载 Chromium。安装依赖时需要网络；不需要额外模型 API Key。

## 安装 ZIP

从 [0.8.0 Release](https://github.com/Jack7510/ggb-plugins/releases/tag/v0.8.0) 下载 `ggb-plugins-0.8.0.zip` 和 `.zip.sha256`。不要将 GitHub 自动生成的 Source code ZIP 当作编译插件包。

```sh
shasum -a 256 -c ggb-plugins-0.8.0.zip.sha256
unzip ggb-plugins-0.8.0.zip
```

1. 校验下载 ZIP 的 SHA-256，并解压。下文 `<plugin>` 指解压后的 `ggb-plugins` 绝对路径。
2. 注册随包附带的本地 marketplace，再安装：

```sh
codex plugin marketplace add <plugin>
codex plugin add ggb-plugins@ggb-plugins-local --json
codex plugin list --marketplace ggb-plugins-local --json
```

3. 从安装结果获取实际缓存路径 `<installed-plugin>`。在已安装副本准备依赖，不要只初始化原解压目录：

```sh
node <installed-plugin>/scripts/setup-plugin.mjs
```

ZIP 包含编译后的 CLI。安装器通过 frozen lockfile 安装生产依赖，下载匹配的 Chromium 和校验后的 GeoGebra，再运行 doctor。已有 runtime 不覆盖；版本不匹配时先移走旧目录。可将官方 runtime ZIP 的绝对路径作为安装器参数，以避免重复下载。GeoGebra 和 Chromium 不随插件再分发。

4. 在新的 Codex 会话中提出文字题。无需手动提供 SKILL.md 路径；已启用插件的 `ggb-construction` Skill 应自动进入候选列表。可在 Skill 列表核对，或显式使用客户端显示的技能名称。

桌面客户端也可从本地 marketplace 的插件目录安装；目录更新后按客户端提示刷新或重启，并在新会话验证。CLI 与桌面界面的支持情况以验收记录为准。

## 从 GitHub 安装

```sh
codex plugin marketplace add Jack7510/ggb-plugins --ref v0.8.0
codex plugin add ggb-plugins@ggb-plugins-local --json
```

Git 版本包含源码。只要存在 src/cli.ts，setup-plugin 就安装构建依赖并重新编译，即使 dist 已存在或不完整。只有无源码的 ZIP 发布包安装生产依赖并使用已有编译产物。已配置同名本地 marketplace 时，先移除该 marketplace 再添加 GitHub 来源，避免来源冲突。运行位置不依赖原仓库。发布新版本时同步更新 plugin.json 和 package.json 的 version。更新后重新获取 marketplace、安装副本及依赖；不要覆盖正在使用的交付目录。

固定标签用于安装已发布版本。需要跟随开发分支时，可将 `--ref v0.8.0` 改为 `--ref main`。固定标签不会通过 marketplace upgrade 自动切换版本；升级时重新注册目标标签。

## 其他本地工具

ZIP 中的 CLI 可独立使用。解压后执行 `node <plugin>/scripts/setup-plugin.mjs`，再让工具读取包内 Skill；调用用法见下节 README 链接。

Skill 自动发现规则由各客户端决定。不能只复制 SKILL.md，运行还需要整个包的 CLI、页面及依赖。此入口不代表已验证所有客户端的原生插件安装。

## 安装后使用

安装并启用后，在新宿主会话中提出题目。题目示例、CLI 用法、交付文件及预览操作统一见 [项目 README](https://github.com/Jack7510/ggb-plugins/blob/main/README.zh-CN.md#提交一道题)。Agent 读取包内 Skill 和引用契约，不依赖开发 checkout。

发布版本与仓库未发布行为的区别见 [CHANGES](https://github.com/Jack7510/ggb-plugins/blob/main/docs/CHANGES.md)。本文只说明安装、依赖准备、更新与卸载，不复制数学契约或预览生命周期。

## 更新与卸载

```sh
codex plugin marketplace upgrade ggb-plugins-local
codex plugin add ggb-plugins@ggb-plugins-local --json
codex plugin remove ggb-plugins@ggb-plugins-local
codex plugin marketplace remove ggb-plugins-local
```

GeoGebra 的独立许可和归属见插件根目录 `THIRD_PARTY_NOTICES.md`。有限交互样本不能证明一般数学命题；图片由宿主读取并提取题干；外部 GGB 续题、三维、完整命令覆盖及通用证明不在已验收范围。

## DeepSeek Harness

Codex 使用上述 ZIP；DSH 使用同版本 `ggb-plugins-dsh-0.8.0.tgz`。两包共用 Skill、编译 CLI 和核验管线，分别注册宿主插件。DSH 包独立携带资源，不依赖 Codex 安装缓存。安装到独立 headless profile 的步骤见 [DSH 安装说明](https://github.com/Jack7510/ggb-plugins/blob/v0.8.0/dsh/README.md)，职责与验收边界见 [双生态兼容设计](https://github.com/Jack7510/ggb-plugins/blob/v0.8.0/docs/dual-ecosystem.md)。
