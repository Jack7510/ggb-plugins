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

加载测试只需已编译安装包；构图前仍须 setup/doctor。工具依赖宿主协议 3 的认证网关，不能直接连接
旧版 Web 宿主。不得为启动成功而开启通用 shell，也不应把 SDK 初始化通过视为真实构图验收。


宿主执行使用 `ggb-plugins-dsh/executor`，参数为 `--request <json>`、`--context <json>` 和
`--package-integrity <发行包 SHA-256>`。`loadInstallation().executor` 指向此入口，`cli` 指向桌面 CLI。
上下文必须由认证宿主生成。执行器不接受模型指定的输出路径或基线身份，不调用 Provider，不自动重试。
成功与可分类的领域拒绝返回退出码 0、执行器协议 3 响应；意外执行错误以非零退出并写 stderr。
每份回执包含宿主 buildId、安装身份及按 kind 声明的产物相对路径、字节数和摘要。
宿主必须在进程退出确认后校验这些事实，调用公开的 `delivery-contract.validateHostDelivery`，
保留原始报告与 manifest 字节，再进行原子提交。不得把文件存在或 SDK 初始化成功作为交付依据。


### 受限参考与失败反馈

服务端注册四个受限工具。`ggb_inspect({reference: topic})` 通过认证宿主读取当前
安装包的固定主题：`request`、`program`、`verification`、`interactions`、`patterns`、
`naming`。省略 `reference` 时仍检查宿主基线。接口不接受文件路径、URL 或任意章节。
`ggb_inspect({references:[...]})` 可批量读取，去重后保留顺序；两种参数不能混用。
每次返回完整主题，序列化响应上限为 24 KiB。模型不能读取宿主文件或其他 run。

Worker 启动时注入包内 `skills/ggb-construction/references/worker-request.md` 专用请求契约。
`request` 主题返回同一文本，不读取 CLI 信封示例。简单任务不要求预读参考；有字段或数学
能力缺口时，只读取相关的 1–2 个主题，通常累计不超过 3 个。基线检查仍为必需步骤。
派生对象必须声明对定义输入的 `dependsOn` 检查，即使当前值固定；位置、坐标或距离
检查不能代替依赖验收。用户直接给定的自由坐标不需虚构依赖。工具核验已声明条件，
不自动从任意自然语言推导遗漏的要求。

宿主在本次构建目录内提取 CLI 错误、`run.json` 和 `verification.json` 中的失败事实，
脱敏后返回失败阶段、对象及检查证据。诊断信息不构成成功回执，不改变交付与清理门禁。


### 三操作公开执行契约与额度

宿主统一调用 `ggb-plugins-dsh/executor --operation check|inspect|build`，并提供
`--request`、`--context`、`--package-integrity`。三操作均返回执行器协议 3，
由 `ggb-plugins-dsh/execution-schemas` 的 `parseExecutionResult()` 校验。
响应绑定 operation、contextSha256 和 packageIntegrity；宿主必须同时核对进程退出和这些绑定。
桌面 CLI 继续使用 envelope 1；服务端不接受旧 CLI 或执行器 envelope 2 的回退。
当前固定组合为工具协议 3、执行上下文 2、构建回执 2；API 内部通道由宿主固定为 8。

| 操作 | 响应契约 | 浏览器与额度 |
| --- | --- | --- |
| check | 完整 structural 结果；与桌面 CLI 共享 checkRequest | 不启动浏览器，不消耗 build 次数 |
| inspect | 完整 InspectData，绑定宿主基线摘要；投影由插件 projectInspect 提供 | 读取宿主基线，可能启动浏览器，不消耗 build 次数 |
| build | 原构建回执，加明确 phase | 仅安全退出且绑定正确的 preflight 拒绝可退款；进入 execution 后不退款 |

build 的 preflight 在调用 build 和配置浏览器之前完成。只有该分支能生成 preflight 拒绝证明。
执行阶段中的 invalid_input、进程异常、超时、取消、输出超限或缺少清理确认均不能作为退款依据。
check 和 inspect 的响应 schema 与 inspect 投影属于插件；宿主不解析桌面 CLI 私有形状。
manifest 的文件名、runtime 和文件摘要语义由公开 validateHostMaterial 校验，宿主提供实际测量值。


### 报告引用与可选预览

成功回执的 `verification` 只包含 `reportSha256`、`reportBytes` 和有界 `summary`。
完整报告单独作为 verification 产物交付。宿主必须核对原始报告字节摘要、长度及公开摘要投影。
回执 schema 1 不再用于新的完成提交；不得把旧的完整报告字段当成 schema 2。

GGB 上限为 6 MiB，preview 为 3 MiB，报告和 manifest 各为 1 MiB。
`preview.png` 可以缺失；存在时必须是上限内的普通文件。损坏的预览不能按缺失处理。
插件在执行前后检查宿主基线，宿主在接受交付前再次检查。

开发 TGZ 的 `source/` 保存精确源码与构建输入。`source/dependencies.lock` 对应源码仓库
`pnpm-lock.yaml`；npm 不会原样发行该文件名。宿主供应锁固定快照内每个文件的摘要。

### 单次完整请求

服务端模型主要通过一次 `ggb_request` 提交完整 `requestText`：

```json
{"requestText":"{\"plan\":{...}}","locale":"zh-CN"}
```

`requestText` 是完整 request body，只包含 `plan` 和可选 `clarifications`；
原始 prompt、输出路径和 base 由宿主注入，模型不得写入。
locale 在外层参数指定；正文不能包含 locale。每个 requirement 的非空 checks
必须嵌套在 plan.requirements[].checks 中，不接受 plan.checks 或 requirementId。
图片题用独立 `transcription` 数组提交转写文本，宿主把它追加到原始 prompt。

`ggb_check` 只接收当前 `revision`；原有完整 checker 成功后返回
`checkedRequestId` 和完整请求摘要。`ggb_build` 只接收该
`checkedRequestId`，使用不可变已检查请求，保留完整构造、重载及交互核验。

正文最多 128 KiB；转义后的完整工具参数（含元数据）也不得超过 128 KiB，
因此正文的可用字节数取决于转义和元数据开销。组装后的领域请求同样受 128 KiB 限制。
修复时省略 locale、title 或 transcription 会继承已有值；显式 transcription
数组替换旧转写，空数组清除转写。一次成功写入只增加一个 revision，并撤销旧检查句柄。
失败写入不改变已有内容。草稿最多 256 个 revision，仅保存在当前认证
run/turn/epoch 的内存中。关闭 turn 后不恢复、不自动重放；句柄不能跨
run/turn 使用；不接受任意路径或 shell。

为了兼容旧安装，底层 `RequestDraft` 仍接受 create/append/replace/remove/read
section 操作，但同一草稿首次成功写入后固定输入模式，跨模式操作一律返回
`draft_mode_conflict`，不改变版本、检查句柄或内容。模型-facing schema 和
Worker Skill 只发布 `requestText` 主路径。
宿主通过公开 `ggb-plugins-dsh/drafts` 加载组装器，不能复制另一套几何 checker。
构建回执与交付绑定组装后的完整请求摘要，不以 tool 参数摘要替代。

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

加载测试只需已编译安装包；构图前仍须 setup/doctor。工具依赖宿主协议 3 的认证网关，不能直接连接
旧版 Web 宿主。不得为启动成功而开启通用 shell，也不应把 SDK 初始化通过视为真实构图验收。


宿主执行使用 `ggb-plugins-dsh/executor`，参数为 `--request <json>`、`--context <json>` 和
`--package-integrity <发行包 SHA-256>`。`loadInstallation().executor` 指向此入口，`cli` 指向桌面 CLI。
上下文必须由认证宿主生成。执行器不接受模型指定的输出路径或基线身份，不调用 Provider，不自动重试。
成功与可分类的领域拒绝返回退出码 0、执行器协议 3 响应；意外执行错误以非零退出并写 stderr。
每份回执包含宿主 buildId、安装身份及按 kind 声明的产物相对路径、字节数和摘要。
宿主必须在进程退出确认后校验这些事实，调用公开的 `delivery-contract.validateHostDelivery`，
保留原始报告与 manifest 字节，再进行原子提交。不得把文件存在或 SDK 初始化成功作为交付依据。


### 受限参考与失败反馈

服务端注册四个受限工具。`ggb_inspect({reference: topic})` 通过认证宿主读取当前
安装包的固定主题：`request`、`program`、`verification`、`interactions`、`patterns`、
`naming`。省略 `reference` 时仍检查宿主基线。接口不接受文件路径、URL 或任意章节。
`ggb_inspect({references:[...]})` 可批量读取，去重后保留顺序；两种参数不能混用。
每次返回完整主题，序列化响应上限为 24 KiB。模型不能读取宿主文件或其他 run。

Worker 启动时注入包内 `skills/ggb-construction/references/worker-request.md` 专用请求契约。
`request` 主题返回同一文本，不读取 CLI 信封示例。简单任务不要求预读参考；有字段或数学
能力缺口时，只读取相关的 1–2 个主题，通常累计不超过 3 个。基线检查仍为必需步骤。
派生对象必须声明对定义输入的 `dependsOn` 检查，即使当前值固定；位置、坐标或距离
检查不能代替依赖验收。用户直接给定的自由坐标不需虚构依赖。工具核验已声明条件，
不自动从任意自然语言推导遗漏的要求。

宿主在本次构建目录内提取 CLI 错误、`run.json` 和 `verification.json` 中的失败事实，
脱敏后返回失败阶段、对象及检查证据。诊断信息不构成成功回执，不改变交付与清理门禁。


### 三操作公开执行契约与额度

宿主统一调用 `ggb-plugins-dsh/executor --operation check|inspect|build`，并提供
`--request`、`--context`、`--package-integrity`。三操作均返回执行器协议 3，
由 `ggb-plugins-dsh/execution-schemas` 的 `parseExecutionResult()` 校验。
响应绑定 operation、contextSha256 和 packageIntegrity；宿主必须同时核对进程退出和这些绑定。
桌面 CLI 继续使用 envelope 1；服务端不接受旧 CLI 或执行器 envelope 2 的回退。
当前固定组合为工具协议 3、执行上下文 2、构建回执 2；API 内部通道由宿主固定为 8。

| 操作 | 响应契约 | 浏览器与额度 |
| --- | --- | --- |
| check | 完整 structural 结果；与桌面 CLI 共享 checkRequest | 不启动浏览器，不消耗 build 次数 |
| inspect | 完整 InspectData，绑定宿主基线摘要；投影由插件 projectInspect 提供 | 读取宿主基线，可能启动浏览器，不消耗 build 次数 |
| build | 原构建回执，加明确 phase | 仅安全退出且绑定正确的 preflight 拒绝可退款；进入 execution 后不退款 |

build 的 preflight 在调用 build 和配置浏览器之前完成。只有该分支能生成 preflight 拒绝证明。
执行阶段中的 invalid_input、进程异常、超时、取消、输出超限或缺少清理确认均不能作为退款依据。
check 和 inspect 的响应 schema 与 inspect 投影属于插件；宿主不解析桌面 CLI 私有形状。
manifest 的文件名、runtime 和文件摘要语义由公开 validateHostMaterial 校验，宿主提供实际测量值。


### 报告引用与可选预览

成功回执的 `verification` 只包含 `reportSha256`、`reportBytes` 和有界 `summary`。
完整报告单独作为 verification 产物交付。宿主必须核对原始报告字节摘要、长度及公开摘要投影。
回执 schema 1 不再用于新的完成提交；不得把旧的完整报告字段当成 schema 2。

GGB 上限为 6 MiB，preview 为 3 MiB，报告和 manifest 各为 1 MiB。
`preview.png` 可以缺失；存在时必须是上限内的普通文件。损坏的预览不能按缺失处理。
插件在执行前后检查宿主基线，宿主在接受交付前再次检查。

开发 TGZ 的 `source/` 保存精确源码与构建输入。`source/dependencies.lock` 对应源码仓库
`pnpm-lock.yaml`；npm 不会原样发行该文件名。宿主供应锁固定快照内每个文件的摘要。
