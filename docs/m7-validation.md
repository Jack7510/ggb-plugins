# M7 验收记录

日期：2026-10-16。版本：0.7.0。环境：macOS arm64、Node 26.5.1、pnpm 11.7.0、Codex CLI 0.162.1、Chromium 156.0.8078.4、GeoGebra 5.4.932.1。

## 实现与覆盖

八个生产模块保持不变，没有新增运行依赖、题型分支或数学命令包装。M7 增加开发工具 `scripts/command-coverage.mjs`、目录快照、覆盖记录、Skill 边界说明和客户端生成的输入回归。请求仍为协议 2，交付仍标记 M6；发布阶段不改变数学交付格式。

[官方目录](https://geogebra.github.io/docs/manual/en/commands/All_Commands/)快照包含 502 个名称，保存获取日期及 HTML SHA-256。它包含三维和脚本等范围，不是二维支持清单。与实际固定 runtime 关联的[覆盖记录](command-coverage.json)中，28 个名称出现在六个成功交付的程序或检查中，474 个未实测。不推断未实测项是否可用，也不宣称已覆盖这些命令的全部重载。

运行 `pnpm coverage:commands` 重建证据。名称检索不是数学解析器；记录保留通道、程序／检查角色、原语句、请求和 GGB 摘要、交付路径。构造、独立检查、真实重载、适用的交互样本及 headless preview 均走既有统一管线。检查调用不等于交付了该命令对象；数学正确性的范围仍以 requirement 和报告为准。

本次六个输入：M1 三角形、抛物线、纯代数、函数与参数、统计矩阵、客户端生成的椭圆与统计组合。完整本机证据：`output/command-coverage/coverage-6wBljn/coverage.json`；每个 delivery 保留 `preview.png` 和 `coverage-preview.png`。浏览器及本地服务关闭后，GGB 摘要不变。

## 安装与真实客户端

从独立编译 ZIP 安装到 `~/.codex/plugins/cache/ggb-plugins-local/ggb-plugins/0.7.0`，无源码，安装器使用生产依赖分支；使用摘要校验的官方 runtime ZIP，doctor 的 smoke、casSmoke 均通过。安装日志：`/private/tmp/ggb-m7-install.log`。

从 `output/m7-client` 启动全新的 `codex exec`，没有指定 Skill 名称、路径、请求 JSON 或开发 fixture。仅提供文字题与自动验收限制：椭圆 `x²/9+y²/4=1`，路径点 P 初始 (0,2)，作联动切线、显示点名；保存列表 {2,4,8,10} 的均值与中位数。客户端自行选择 ggb-construction，读取安装副本 Skill 和契约，调用安装副本 doctor／build。全过程 headless，没有访问开发源码、tests 或 examples。

结果：构造、重载各 29 项检查通过，1 个真实鼠标拖动样本通过，均值和中位数均为 6。切线和路径点保留真实依赖。独立 headless preview 复核通过；关闭页面后浏览器和服务退出，文件 SHA-256 保持 `2cd37e00989d3a4bbda8434aad35a0d69726d7d717ec21d3529ac757d7926854`。

证据：`output/m7-client/events.jsonl`、`final.md`、`ellipse-acceptance/delivery/ggb-BHtVcm/delivery/`，以及运行目录的 `preview-acceptance.json`。请求保留为 [client-ellipse.json](../examples/client-ellipse.json)，可通过相同管线重复构造。最终可见 Chrome 由持续运行的调用方打开；一次性 exec 不承担答复后保留窗口。

## 失败与剩余缺口

真实客户端三次构造尝试中，第一次 requirement 来源拼接不匹配题干，被输入门禁拒绝；第二次 `t=Tangent(P,c)` 返回 `t,undefined`，被完整产物门禁拒绝。第三次改用原生切线方程 `x(P)*x/9+y(P)*y/4=1`，以 `Polar(P,c)` 独立核验并成功。保留事件及失败 run.json；不把这次 Tangent 构造视为通过，也不据此拒绝其他 Tangent 调用或重载。生产代码没有针对该命令增加例外。

最初受沙箱限制的 doctor 无法监听本地端口，自动审批后重跑成功；没有重复安装或放宽数学门禁。构造修复限于三次，未删除数学要求。拖动样本不是任意参数域的证明。

未验收：其余命令和重载、复杂局部绑定、动态 CAS 单元、完整定义域与一般证明、外部 GGB、其他操作系统及其他宿主的自动技能发现。CLI 真实回合不等于重新验收桌面 UI。

## 回归

`pnpm check`、`pnpm build`、`pnpm test` 31 项、`pnpm test:browser` 55 项构图与 53 项故障／启动回归全部通过，共 139 项。Skill quick_validate 和 `git diff --check` 通过。额外六个覆盖交付及真实客户端交付也通过；自动化全部 headless 并保存截图。

打包加入 Skill 覆盖说明，继续排除源码、测试、目录记录、runtime、依赖和用户产物。源码安装始终重建、部分 dist 和纯编译包的三个安装回归继续保留。

## 公开发布与最终安装

固定标签 `v0.7.0` 指向 `e9412f1`。[发布工作流 38872243247](https://github.com/Jack7510/ggb-plugins/actions/runs/38872243247) 实际通过版本、类型、构建和 31 项基础测试，生成并发布 [0.7.0 Release](https://github.com/Jack7510/ggb-plugins/releases/tag/v0.7.0)。公开 ZIP SHA-256：`cf938e874508bcf7566ea482eac997bfaf87c5755e06ea3e71b62fc6eec822a9`。匿名下载和校验通过；CI 不替代上述本机真实浏览器验收。

本机 marketplace 最终切换到 `Jack7510/ggb-plugins --ref v0.7.0`，重新安装并执行源码安装分支，doctor 两项均通过。全新 app-server 的 skills/list 仍发现启用的 `ggb-plugins:ggb-construction`，路径为 0.7.0 安装缓存；记录在 `output/m7-client/skill-discovery-final.json`。这次列表检查用于最终安装确认，自动选用及构图证据来自前述真实 exec 回合。

公开 ZIP 在 `output/m7-public/ggb-plugins` 独立完成生产依赖安装、doctor、客户端题目的新构造和 headless preview。八个编译模块与安装副本及开发构建逐字节一致，Skill 覆盖说明也一致。关闭后浏览器、服务退出，文件摘要不变。完整独立验收见 `output/m7-public/acceptance.json`，交付位于 `standalone/ggb-hiNp3a/delivery`，保存两张截图。

全部自动验证通过后，调用方用最终安装副本的 CLI 在本机 Google Chrome 展示客户端原始交付文件。此次展示不修改 GGB；持续前台会话负责关窗清理。未将物理点击关闭窗口计为本次新的自动验收。
