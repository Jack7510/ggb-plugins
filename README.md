# ggb-plugins

面向本地 Codex 的 GeoGebra 构图工具。**M2 已实现**：Codex 根据文字题生成结构化程序，经统一 CLI 构造、逐条件核验、导出、重载和交互检查，再打开独立预览。题意分析由宿主 Codex 完成，本地工具不额外调用模型 API。

新题通过组合原语解决。生产执行器和验证器不按题型分支；M1 三角形现在是 `examples/triangle.json` 回归输入。支持范围及完整请求格式见 [Skill 能力契约](skills/ggb-construction/references/capabilities.md)，阶段划分见 [设计文档](docs/ggb-plugins-design.md)。`doctor`、故障验收和正式插件打包仍属于 M3–M4。

## 安装

需要 Node.js 22+、pnpm 11，以及系统 `curl`、`unzip`。已在 macOS arm64 验证；其他平台尚未验收。

```sh
pnpm install --frozen-lockfile
pnpm setup:runtime
pnpm exec playwright install chromium
pnpm build
```

安装器从官方版本化地址下载 GeoGebra，核对 `runtime.lock.json` 中的 SHA-256 后解压到 `.runtime/`。也可以执行 `pnpm setup:runtime /absolute/path/to/bundle.zip`。已有目录不会被覆盖，重新安装前先移走旧目录。

安装阶段需要网络；浏览器执行只允许访问本机资源。GeoGebra 不提交到 Git，其许可独立于本项目 MIT 许可，见 [第三方说明](THIRD_PARTY_NOTICES.md)。

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

示例将文件写到 `output/` 下新的 `ggb-*/delivery/`，命令返回结果 JSON。运行一次只接受一个候选程序；失败保留 `run.json`、`request.json` 和已有证据，修正后重新构造，不恢复半完成画布。

## 交付与预览

正式交付目录包含 `result.ggb`、`request.json`、`verification.json`、`preview.png` 和 `manifest.json`。构造、重载或必需检查失败及数值灰区均阻止正式交付。报告记录逐要求结果和有限交互样本；采样通过不代表一般数学命题已证明。

```sh
pnpm preview --delivery /absolute/path/to/delivery
```

预览核对文件完整性、摘要、报告覆盖和实际重载事实，再输出就绪 JSON 并保持前台运行。拖动自由点观察联动，使用右下角按钮缩放。预览修改不覆盖交付文件。关闭展示浏览器或按 Ctrl+C 会释放本地服务；仅关闭标签页可能不会结束浏览器。

M2 使用新的交付契约，旧 M1 产物需重新生成。当前不接受图片、外部 GGB 续题、三维、任意脚本或通用证明。复杂布局和视野边界暂无验收谓词；无法核验的必需要求不得作为成功结果交付。

## 验证与实现边界

```sh
pnpm check
pnpm build
pnpm test
pnpm test:browser
GGB_HEADED=1 pnpm test:browser
```

离线测试覆盖严格输入、依赖图、拒绝路径、容差及资源边界。真实浏览器测试覆盖四种构造、对象改名和坐标旋转、M1 呈现反例、伪造依赖、错误关系、数值灰区、文件缺项和 CLI 取消。验证记录见 [M2 验收记录](docs/m2-validation.md)。

`schema.ts` 定义能力和契约，`compile.ts` 检查类型及依赖并编译，`browser.ts` 执行并采集事实，`verify.ts` 只消费数据判定，`delivery.ts` 编排文件交付，`cli.ts` 拥有进程信号和退出码。所有构图共用一个页面、一个 TypeScript 包，不引入常驻构图服务或第二套几何引擎。
