# GeoGebra Construction for DeepSeek Harness

本包是独立的 DSH npm bundle，提供 `ggb-construction` Skill、同一套编译后的 GeoGebra CLI、页面与安装器。无需 Codex、开发仓库或另一个插件的缓存。数学程序、核验与 GGB 交付仍使用统一管线。

## 演示

![拖动 C 时圆周角保持为圆心角的一半](https://raw.githubusercontent.com/Jack7510/ggb-plugins/main/docs/assets/ggb-construction-demo.gif)

拖动 C 时，圆周角保持为圆心角的一半；交付的 GGB 可继续拖动、查看并核验。

源码工程中的 Desktop 验证、日志留存与修复提示词见 [操作流程](docs/dsh-desktop-validation.md)。该流程用于开发协作，不代替下文的独立安装包验收；随包阅读时请到源码仓库查阅此文档。

## 从 npm 安装（推荐）

DSH bundle 已发布为 npm 包 `ggb-plugins-dsh`。桌面应用使用 `desktop` profile；
DSH 插件中心或 Web 宿主使用 `web` profile：

```sh
profile=desktop   # DSH 插件中心/Web 宿主改为 web
dsh plugin --profile "$profile" add ggb-plugins-dsh@0.8.5
node ~/.dsh/profiles/$profile/node_modules/ggb-plugins-dsh/scripts/setup-plugin.mjs
```

然后重启 DSH。升级时把 `@0.8.5` 换成新版本；版本列表见
`npm view ggb-plugins-dsh versions`。发布流程见
[发布到 npm](https://github.com/Jack7510/ggb-plugins/blob/main/docs/publish-npm.md)。

不需要构建权限，也不需要校验压缩包；npm 分发的是预编译产物。

也可以在 DSH 中启用 **Experimental plugins → Custom plugin markets**，在
**Discover → Add index source** 添加本仓库的索引查看并安装：

```text
https://cdn.jsdelivr.net/gh/Jack7510/ggb-plugins@main/docs/market/index.json
```

上架与社区曝光文案见
[DSH 社区分发](https://github.com/Jack7510/ggb-plugins/blob/main/docs/community-submission.md)。

## 用一句对话安装（桌面应用）

给桌面用户发这一句，让他粘贴到 DSH 对话框；DSH 会自己下载、校验并安装：

```text
请安装 npm 包 ggb-plugins-dsh@0.8.5 到 desktop profile（Web 宿主改用 web），
运行安装副本里的 setup-plugin，然后提醒我重启 DSH。
```

英文版：

```text
Install the npm package ggb-plugins-dsh@0.8.5 into the desktop profile (use web
for the Web host), run setup-plugin in the installed copy, then remind me to
restart DSH.
```

升级时把命令和提示里的版本号换成新版本即可；不要混用不同版本的包与安装说明。

### DSH 需要执行的动作

1. 检查前置：Node.js 22+、pnpm 11、`curl`、`unzip`，以及 Google Chrome 或
   Microsoft Edge。
2. 安装 npm 包：`dsh plugin --profile desktop add ggb-plugins-dsh@0.8.5`。
   DSH 插件中心或 Web 宿主把 `desktop` 换成 `web`。维护者提供本地 TGZ 时
   改用其绝对路径，并先校验随附的 `.sha256`；校验不通过就停止，不安装。
3. 确认 profile：桌面应用使用 `desktop`（目录
   `~/.dsh/profiles/desktop`）；若设置了 `DSH_PROFILE`，以它为准。
4. 解析实际安装目录：

   ```sh
   node -p "require.resolve('@local/ggb-plugins-dsh/package.json', {paths: ['$HOME/.dsh/profiles/desktop']})"
   ```

   取该路径所在目录作为 `<installed-plugin>`。
5. 在安装副本里准备依赖与 runtime：
   `node <installed-plugin>/scripts/setup-plugin.mjs`。
6. 就绪检查：`node <installed-plugin>/dist/src/cli.js doctor`，必须返回
   `ok: true`。
7. 告诉用户**重启 DSH 桌面应用**；bundle 在启动时加载，重启前仍是旧版本。

### 给 DSH 的约束

- 只从 npm 官方 registry 或本仓库 Release 安装，不装第三方镜像；本地 TGZ 必须校验随附摘要。
- 不改动用户已有的交付文件和工作区；安装失败时保留原始错误，不重复试错。
- 桌面 profile 的插件由桌面应用管理；不要用
  `--from-default-profile` 初始化它。
- 校验和只证明文件完整，不代表公共目录审核通过。

## 许可证与源码

本包采用 MIT 许可，源码与问题反馈位于
[Jack7510/ggb-plugins](https://github.com/Jack7510/ggb-plugins)（目录 `dsh/`）。
npm 包 `ggb-plugins-dsh` 与分发仓库都由该源码构建；分发仓库只含构建产物，
不单独接受修改。GeoGebra 运行时有独立许可，见包内 `THIRD_PARTY_NOTICES.md`。

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
当前服务端入口只验证了 SDK `0.2.1-rc.2`；详细边界见 [宿主封装契约](https://github.com/Jack7510/ggb-plugins/blob/main/docs/dual-ecosystem.md#受限-sdk-server-入口)。

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

Worker 的常用步骤、检查、命名、样式和采样字段在首次模型调用前注入。
只有具体知识缺口才调用 inspect；不把链接或章节目录当作必读清单。
`reference` / `references` 同时接受整章与固定小节标识，例如：

```json
{"references":["program.outputs","verification.engine"]}
```

小节标识由安装包 schemas 的 `REFERENCE_IDS` 发布，不接受路径、任意标题或搜索式。
整章覆盖其已声明小节；读一个小节不代表整章或相邻小节已读。
宿主只在完整身份、正文与序列化大小检查通过后记录覆盖关系。
失败读取不更新记录；每个 turn 独立，refresh:true 仍可用于上下文丢失后的显式重读。
批次仍最多 6 个标识、24 KiB；整章组合可能超限，应按具体缺口读取小节。
准备好原文来源、一种充分构法、独立期望、完整依赖和有效样本后提交 check/build，
不在工具反馈前模拟全部校验或反复比较已知构法。所有核验与回执门禁保持不变。

Worker 启动时注入包内 `skills/ggb-construction/references/worker-request.md` 专用请求契约。
`request` 主题返回同一文本，不读取 CLI 信封示例。简单任务不要求预读参考；有字段或数学
能力缺口时，只读取相关的 1–2 个主题，通常累计不超过 3 个。基线检查仍为必需步骤。
派生对象必须声明对定义输入的 `dependsOn` 检查，即使当前值固定；位置、坐标或距离
检查不能代替依赖验收。用户直接给定的自由坐标不需虚构依赖。工具核验已声明条件，
不自动从任意自然语言推导遗漏的要求。依赖检查必须覆盖每条关系的全部定义输入，
不能只检查滑块。`type` 使用 `objectType`；`source` 逐字保留原文；显示美化用 `caption`。
精确同名 caption 在固定引擎中读回为空默认值，核验按等价处理但仍检查标签模式；
自定义 caption 不允许用空值、别名或大小写变化替代。

插件公开 `PRELOADED_REFERENCE_TOPICS`，与启动注入共用同一声明。宿主按认证 turn
记录已读主题，重复读取返回 `alreadyAvailable`，混合批次只返回缺失主题。所有调用
仍经鉴权、证据和进度链路；失败或超限不更新记录，关闭 turn 后不复用记录。
确因上下文压缩丢失正文时，使用 `ggb_inspect({reference:"program",refresh:true})`。
refresh 必须附带固定主题，仍受原有大小和路径边界约束。

图片任务在首次 `ggb_request` 中必须提供非空 `transcription`，先把图片转为完整数学
问题文本，包括已知条件、方程、标签、约束和提问；不能只写图片摘要，不能加入答案或
推断条件。不清楚的部分保留歧义并澄清。`source` 从这些文本逐字引用。
图片存在性由宿主传入。缺少转写时，宿主在保存前返回 `image_transcription_required`，
不改变版本、旧句柄、交付或构建额度。保存成功后的修复可省略转写并沿用；显式空数组
不能清除图片转写。文字任务不受此要求。宿主校验非空和状态，不认证视觉识别准确性。
使用已注入契约确定一种充分构法后提交；只为具体未知字段或引擎行为读取参考，
不为确认已知契约或比较已知构法增加检索。推理强度与完整核验门禁不变。

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

### 失败观测与原文引用

`draft_request_json` 返回安全的格式说明。解析器提供位置时，错误 details 包含
`offset`（从 0 开始的 UTF-16 索引）、`line` 和 `column`（从 1 开始）。
定位信息不包含请求原文、路径或解析器原始报错；无法定位时省略 details。
格式错误不改变草稿或已有检查句柄。模型只修正 JSON 或元数据位置。
省略 outputs 时，执行器核验并接纳同命令的合法附属输出；显式 outputs 仍要求完整匹配。
附属输出不能覆盖已有对象或占用其他步骤的声明名称，也不能引入未声明的独立输入。
执行器将 XML 输出归属写入快照 nativeOutputs，核验重载、交互与续构新增对象。
原请求和摘要不变；后续步骤引用附属对象时必须显式声明名称。
输出声明错误优先根据实际标签修正该步 outputs，保留原构造、依赖、检查和交互采样。
修正版仍须重新 check 后才能 build。工具不自动改写命令或重放构建。

失败的 `type`、`style`、`presentation` 结果附带有界的 `expected`、`actual` 和
`message`，保留完整报告供交付核验。缺少观测时为未知，不生成虚假 actual=false。
宿主把必要事实投影到工具修复反馈和最终失败；不转发原始对象、XML、路径或凭据。
成功判据不变，失败摘要不代替完整核验。

Worker 的 `requestText` requirement 可使用 `sourceRef:"input"` 替代 `source`。
插件在原子保存前解析为本轮原始输入（含同次或已保存转写）；不能同时指定两个字段，
不能指定路径或其他 run。修复保留转写；新 turn 不复用旧输入。展开后仍受请求字节上限
约束；过大时应使用逐字摘录。CLI 仍只接收 `source`；非法摘录不自动改写。
check/build 的版本、摘要和回执均绑定解析后的完整请求。

派生对象须检查对题设定义对象的依赖，同时保留实现中间量的依赖检查。
例如 `F=(-cval,0)`、`cval=sqrt(16-9)` 即使满足 `dependsOn(F,cval)`，也不能替代
题设“F 是 C 的焦点”所需的 `dependsOn(F,C)`。原文条件的完整提取仍由 Worker 负责。

隐藏数值对象的已有证据显示：构造时 labelVisible=false，重载后为 true，defined、值和
visible 不变。离线回放定位到导出/重载边界，不宣称已确认引擎内部的序列化或加载函数。
快照归一化不放宽显式样式检查；只有隐藏需求时可用 visible:false，明确要求标签状态时
仍须通过重载核验。当前没有新增引擎补丁。

原生执行错误提示同时覆盖普通标签、下标、方括号和嵌套参数；提示只建议修复，
不改写 source、不重放构建。位置参数 Polygon 可声明全部输出；固定顶点只需面时可用列表形式。
残差与面积和使用未取整原值核验；round 仅用于它们的显示副本。整数边数 round(n) 的构造
和合法性检查保留。此规则随常用 Worker 契约注入，不增加强制参考读取或改变推理强度。

### 文本、内点与构建配额

固定小节 `program.text` 提供真实 5.4.932.1 的 Text 和 point/vector 对照。
引号内分号允许通过结构检查；字符串外多语句、控制字符和未闭合引号仍拒绝。
不自动转义或改写 GeoGebra source。Text 位置参数必须为 point；命名本身不保证类型。

内点的初始坐标不构成区域约束。PointIn 包含边界；严格内点可用始终为正的权重构造，
并核验定义依赖、严格面积条件、面积和及向量残差。示例为
`examples/v2-cases/interior-triangle.json`；真实回归还覆盖 Text、重载和参数样本。

宿主在工具结果返回 `buildBudget:{used,limit,remaining}`，按真实 run 配额和已确认退款计算。
插件不拥有或修改配额；remaining 为零时，Worker Skill 要求停止修复和 check/build，报告现有证据。
预算信息不替代宿主硬上限，不把执行失败退款，也不代表模型已实际遵循停止提示。
