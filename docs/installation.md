# GeoGebra Construction 安装与使用

本插件处理文字或图片中的二维数学与代数题。Codex 生成 GeoGebra 原生程序，本地工具执行、核验并交付可交互 GGB。需要支持插件的本地 Codex 客户端、Node.js 22+、pnpm 11、curl 和 unzip。安装依赖时需要网络；不需要额外模型 API Key。

## 安装 ZIP

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
codex plugin marketplace add Jack7510/ggb-plugins --ref main
codex plugin add ggb-plugins@ggb-plugins-local --json
```

Git 版本包含源码。只要存在 src/cli.ts，setup-plugin 就安装构建依赖并重新编译，即使 dist 已存在或不完整。只有无源码的 ZIP 发布包安装生产依赖并使用已有编译产物。已配置同名本地 marketplace 时，先移除该 marketplace 再添加 GitHub 来源，避免来源冲突。运行位置不依赖原仓库。发布新版本时同步更新 plugin.json 和 package.json 的 version。更新后重新获取 marketplace、安装副本及依赖；不要覆盖正在使用的交付目录。

## 使用和交付

例如：“作三角形 ABC，取 AB 的中点 M，连接 CM，将中线标红，并打开可交互预览。”未给坐标时，由 Codex 选择并说明初始构型。能力受当前操作和谓词限制，不能删除无法核验的必需要求后宣称成功。

M5 / 0.5.0 使用请求及交付协议 2；旧请求和交付目录须按新契约重新生成。doctor 的 smoke、casSmoke 均应通过。纯代数结果保存在原生对象中，使用 Algebra 视图；CAS 物化结果不自动保留动态 CAS 依赖。

请求和产物写在用户工作区，使用绝对路径，不能写进安装缓存。正式目录包含 result.ggb、request.json、verification.json、preview.png 和 manifest.json。构图、doctor 和自动验证使用 headless，截图保存为 preview.png。验证完成后，预览使用本机 Google Chrome 加载原文件，支持自由点拖动和缩放；关闭预览标签页或窗口后自动退出本次专用浏览器并释放服务，Ctrl+C 也会清理，不回写文件。最终预览需要安装 Google Chrome；自动化预览检查可以添加 --headless。宿主必须保留前台进程：使用交互客户端或保持连接的 app-server；一次性 codex exec 退出会回收预览会话，不能据此承诺答复后预览继续存在。

```sh
node <installed-plugin>/dist/src/cli.js doctor
node <installed-plugin>/dist/src/cli.js preview --delivery <absolute-delivery>
```

失败保留已有诊断，不自动恢复。提交后仅外层清单写入失败时，成功结果附带 warnings，完整交付仍有效。强制杀进程可能留下浏览器，可确认对应进程后手动关闭。

## 更新与卸载

```sh
codex plugin marketplace upgrade ggb-plugins-local
codex plugin add ggb-plugins@ggb-plugins-local --json
codex plugin remove ggb-plugins@ggb-plugins-local
codex plugin marketplace remove ggb-plugins-local
```

GeoGebra 的独立许可和归属见插件根目录 `THIRD_PARTY_NOTICES.md`。有限交互样本不能证明一般数学命题；图片由宿主读取并提取题干；外部 GGB 续题、三维、完整命令覆盖及通用证明不在已验收范围。
