# Codex 安装引导与隔离端到端验收

日期：2026-10-20。版本：0.8.3，未公开发布。源码基线为本轮开始时的工作树，
加安装引导、封装回归和文档改动。未创建 Git 标签，未推送，未发布 GitHub Release、
npm 包或官方插件目录。历史本机部署记录见 [2026-10-19 验收](v0.8.3-validation.md)。

## 结论与范围

隔离 Codex 安装、首次联网初始化和全新会话首题交付通过。
本次使用两个独立的新 Codex 会话：第一个自主选择 `ggb-setup` 并执行设置；
第二个从自然语言题目自主选择 `ggb-construction`，完成构造及交付复核。

“隔离环境”指新建的 Codex 配置、插件缓存、工作目录、npm 缓存和 pnpm store。
开始时，安装包和安装副本均无 node_modules 或 .runtime。只复用现有 Codex 登录，
不复用个人 Codex 配置、旧会话、已有插件依赖或 GeoGebra 缓存。
测试继续使用本机已安装的 Node.js、pnpm 和 Chrome，不代表全新操作系统或新账号验收。
临时登录文件在验收完成后删除，不进入证据目录。

| 环节 | 可观察结果 |
| --- | --- |
| 源码构建 | pnpm build 成功，包含类型检查与能力清单生成 |
| 安装、封装、适配与契约回归 | 23 项覆盖通过；首轮 20/23，3 项被 npm 缓存写权限阻止，改用临时缓存后打包组 7/7 |
| Skill 校验 | Skill Creator quick_validate 通过 |
| 双封装隔离 | Codex ZIP 包含声明的 setup Skill，DSH TGZ 不含此 Codex 安装入口 |
| 实际安装 | ggb-plugins@ggb-plugins-local 为 0.8.3，installed、enabled 均为 true |
| 文件一致性 | 解压包与安装副本的 38 个分发文件逐字节一致 |
| 自动选择安装引导 | 首个全新会话选择 ggb-setup，并读取安装副本中的 Skill |
| 首次安装依赖 | 新 store 中 reused 0，下载 Playwright 依赖；没有借用其他安装 |
| 首次下载 runtime | 从 download.geogebra.org 下载锁定归档，安装器 SHA-256 校验成功 |
| 安装器与 doctor | 安装器退出 0；工具版本 0.8.3，smoke、casSmoke 均 passed |
| 自动选择构图 | 第二个全新会话读取当前安装副本的 ggb-construction |
| 首题交付 | 三角形、中点、红色中线通过构造与独立 GGB 重载检查 |
| 交互 | 真实鼠标拖动 A；中点关系、中线端点关系与样式复验通过 |
| 交付复核 | preview --headless --once 返回成功并退出；无可见浏览器 |
| 图像检查 | 交付截图中三角形、M 和红色 CM 可见，已查看截图 |

环境为 macOS arm64、Codex CLI 0.163.0、Node.js 26.5.1、pnpm 11.7.0、
Google Chrome 155.0.8059.85。GeoGebra 为 5.4.932.1，固定归档摘要为：

```text
c139f3edb51c004ec67d83226a1f1215486f8559ad98ee37e9e775aac278e96e
```

## 权限失败与修复

源测试中的三项失败均来自沙箱禁止写入用户 npm 缓存。未修改用户缓存权限，
未执行错误提示中的全局 chown；设置临时 npm 缓存后，仅复跑受影响的打包测试文件。
另外 16 项在首轮已通过，没有重复执行。新增回归检查的是实际生成的归档和 manifest 引用。

隔离安装首次执行时，沙箱中的 registry.npmjs.org DNS 解析返回 ENOTFOUND。
pnpm 内置重试持续等待；核对 PID 的工作目录后，停止该验收专用进程并保留退出错误。
官方 npm 与 GeoGebra 地址在正常联网权限下均返回 HTTP 200。
随后通过宿主正常授权，在同一隔离安装副本中运行安装器，另存成功日志。
依赖首次下载与 runtime 下载均在此权限条件下完成，没有跳过摘要、重载或 CAS 检查。

第二个会话的 doctor 也先受到沙箱执行限制，再通过正常授权执行成功。
没有放宽生产核验容差或修改工具失败条件；没有关闭 Codex 的审批机制。
因此，本记录证明的是**取得所需网络与本地浏览器执行权限后可完成安装和使用**，
不声称受限沙箱中无需授权即可联网或启动 Chrome。

## 首题与交付证据

任务为：作三角形 ABC，取 AB 中点 M，连接 CM，将中线标红，拖动 A 检查联动。
Agent 自选初态 A=(-3,-1)、B=(3,-1)、C=(1,3)，并在最终回复中明确它们不是题设坐标。
报告的 construction、reload、interaction 均为 passed，采样方法为 mouse。
有限拖动样本不构成一般数学证明。

完整证据位于 [output/codex-onboarding-20261020](../../output/codex-onboarding-20261020/)，
不进入 Git。主要文件如下：

| 文件 | 内容 |
| --- | --- |
| environment.json | 独立目录、初始状态和登录复用范围；不含凭据 |
| codex-package.json、provenance.json | ZIP 摘要、安装路径与 38 个文件的摘要 |
| marketplace-add.json、plugin-add.json、plugin-list.json | Codex 插件注册、安装及启用状态 |
| setup-events.jsonl、setup-final.txt | 第一个新会话选择安装引导、执行及完成结果 |
| setup-first.log、setup-network.log、doctor.json | 首错、获准联网后安装与就绪结果 |
| first-problem-events.jsonl、first-problem-final.txt | 第二个新会话自主构图与预览复核 |
| first-request.json、first-run.json | 首题输入与运行状态 |
| first-delivery/ | 原生 GGB、报告、截图、输入和清单 |
| source-tests-first.log、package-tests.log | 首轮测试与受影响组复跑结果 |

本次实际验收 ZIP 的 SHA-256 为：

```text
cd9f0667ff91261bbd886d0831d98227411f7c4842ec6b9cb5e3cf5471aaaa4b
```

该摘要对应本次执行的本地归档，不表示公开发布版本。最终同步文档后的 ZIP
与该包仅有 INSTALL.md、README.md、README.zh-CN.md 三份入口文档不同；
全部可执行文件、manifest 与 Skill 逐字节一致。最终包摘要为：

```text
29037bd68108ed416efb6e4cedf5562fa0a0956f72369c3d1424bbb752f95e30
```

最终两种包的路径与摘要见证据目录 final-codex-package.json、final-dsh-package.json；
差异核对见 final-package-comparison.json。不得用新摘要覆盖本次实际执行归档的摘要。

## 未验收项

- 桌面端“运行设置”按钮的展示、点击与回调。manifest 已声明 onboardingSkill，
  包内路径已检查；本轮验证的是新 CLI 会话调用该 Skill，不能代替界面验收。
- Windows、Linux、其他浏览器及没有系统前置依赖的机器。
- GitHub 标签下载、官方公共目录审核或安装、DSH Desktop 与 npm 新版本发布。
- 全量浏览器回归。数学执行和交付代码未改动；首题已走实际 headless applet 全流程。

用户安装步骤只维护在 [Codex 安装说明](../README.md)。本记录保存验收事实，不另建安装契约。
