# ggb-plugins

面向本地 Codex 的 GeoGebra 构图工具。**M3 已实现**：Codex 根据文字题生成结构化程序，经统一 CLI 构造、逐条件核验、导出、重载和交互检查，再打开独立预览。题意分析由宿主 Codex 完成，本地工具不额外调用模型 API。

新题通过组合原语解决。生产执行器和验证器不按题型分支；M1 三角形现在是 `examples/triangle.json` 回归输入。支持范围及完整请求格式见 [Skill 能力契约](skills/ggb-construction/references/capabilities.md)，阶段划分见 [设计文档](docs/ggb-plugins-design.md)。M3 已补齐 doctor、错误清理和产物提交故障验收；正式插件打包及目标客户端安装验收留待 M4。

## 安装

需要 Node.js 22+、pnpm 11，以及系统 `curl`、`unzip`。已在 macOS arm64 验证；其他平台尚未验收。

```sh
pnpm install --frozen-lockfile
pnpm setup:runtime
pnpm exec playwright install chromium
pnpm build
pnpm ggb doctor
```

安装器从官方版本化地址下载 GeoGebra，核对 `runtime.lock.json` 中的 SHA-256 后解压到 `.runtime/`。也可以执行 `pnpm setup:runtime /absolute/path/to/bundle.zip`。已有目录不会被覆盖，重新安装前先移走旧目录。

安装阶段需要网络；浏览器执行只允许访问本机资源。GeoGebra 不提交到 Git，其许可独立于本项目 MIT 许可，见 [第三方说明](THIRD_PARTY_NOTICES.md)。

## 环境检查与失败处理

`pnpm ggb doctor` 使用与 build 相同的本地服务和浏览器，检查 runtime 元数据及真实版本，执行临时构造、GGB 导出和重载。成功输出 JSON，包含工具、Node.js、Chromium、runtime 版本、限制和能力表。结束后关闭浏览器和服务，不创建交付目录。失败返回非零退出码，不要继续作图；按错误信息安装依赖或修正版本。

构图总时限 120 秒，doctor 总时限 45 秒，单次浏览器等待及导出/加载回调上限 30 秒。可处理取消关闭资源，CLI 返回 130。失败保留诊断和临时产物，不自动重试或恢复。

工具先关闭构图资源，再原子提交 `delivery/`。提交前失败没有正式交付；提交后更新外层 `run.json` 失败会返回成功路径及 warnings。此时以完整交付目录为准，不要仅凭外层 running 状态重复构造。预览失败不删除或修改交付文件。

强制结束进程或系统崩溃可能留下浏览器。可关闭对应 Chromium 窗口，或在活动监视器中按 PID 确认并结束本次运行的残留进程；不要批量结束其他浏览器。没有正式交付的旧运行只保留作诊断，重新调用会创建新目录。

## 在 Codex 中作图

让 Codex 读取 [ggb-construction Skill](skills/ggb-construction/SKILL.md)，提交文字题。Skill 指导 Codex 保留条件来源、生成可组合程序和检查条件、处理执行反馈并交付结果。当前 Skill 在仓库内，尚未完成插件安装后的自动发现验收。

CLI 消费 Codex 生成的 JSON 请求。请求包含用户原文、locale、outputDir，以及 program、requirements、styles 和交互样本；使用绝对产物路径可避免工作目录歧义。

```sh
pnpm ggb build --request /absolute/path/to/request.json
```

可直接运行不同示例，所有示例共用同一管线：

```sh
pnpm ggb build --request examples/triangle.json
pnpm ggb build --request examples/bisector.json
pnpm ggb build --request examples/circle.json
pnpm ggb build --request examples/transfer.json
# M1 开发快捷入口，同样调用统一 build：
pnpm demo
```

示例将文件写到 `output/` 下新的 `ggb-*/delivery/`，命令返回结果 JSON。运行一次只接受一个候选程序；失败尽可能保留 `run.json`、已写入的 `request.json` 和已有证据，修正后重新构造，不恢复半完成画布。

## 交付与预览

正式交付目录包含 `result.ggb`、`request.json`、`verification.json`、`preview.png` 和 `manifest.json`。构造、重载或必需检查失败及数值灰区均阻止正式交付。报告记录逐要求结果和有限交互样本；采样通过不代表一般数学命题已证明。

```sh
pnpm preview --delivery /absolute/path/to/delivery
```

预览核对文件完整性、摘要、报告覆盖和实际重载事实，再输出就绪 JSON 并保持前台运行。拖动自由点观察联动，使用右下角按钮缩放。预览修改不覆盖交付文件。关闭展示浏览器或按 Ctrl+C 会释放本地服务；仅关闭标签页可能不会结束浏览器。

M2 使用新的交付契约，旧 M1 产物需重新生成。M2 Review 修复更新了呈现检查的结果集合；修复前的 M2 报告也需用原请求重新 build。当前不接受图片、外部 GGB 续题、三维、任意脚本或通用证明。复杂布局和视野边界暂无验收谓词；无法核验的必需要求不得作为成功结果交付。

## 验证与实现边界

```sh
pnpm check
pnpm build
pnpm test
pnpm test:browser
GGB_HEADED=1 pnpm test:browser
```

离线测试覆盖严格输入、依赖图、拒绝路径、容差及资源边界。真实浏览器测试覆盖四种构造、对象改名和坐标旋转、M1 呈现反例、伪造依赖、错误关系、数值灰区、文件缺项和 CLI 取消。M3 故障测试另覆盖依赖缺失、回调超时、写盘及提交失败、清理异常、资源释放和提交前后真实 SIGKILL。故障注入仅使用 Node 测试模块 mock，需支持 `--experimental-test-module-mocks` 的 Node.js；未增加运行依赖。记录见 [M3 验收记录](docs/m3-validation.md) 及 [M2 验收记录](docs/m2-validation.md)。

`schema.ts` 定义能力和契约，`compile.ts` 检查类型及依赖并编译，`browser.ts` 执行并采集事实，`verify.ts` 只消费数据判定，`delivery.ts` 编排文件交付，`cli.ts` 拥有进程信号和退出码，`doctor.ts` 编排依赖冒烟检查。所有构图共用一个页面、一个 TypeScript 包，不引入常驻构图服务或第二套几何引擎。
