# ggb-plugins

Codex 本地 GeoGebra 构图插件原型。当前完成设计中的 **M1**：固定构造三角形 ABC、AB 的中点 M 和中线 CM，导出 `.ggb`，在新 applet 中重载核验，再由独立进程打开可交互预览。

当前不接受任意题目、图片或外部 GGB，也没有通用 `build`、`doctor` 或插件安装包。这些功能按 [设计文档](docs/ggb-plugins-design.md) 后续实施。

后续采用“用户提出问题 → Codex 生成构图程序 → 统一工具执行、观察、核验和交付”的方式。新题通过组合 GeoGebra 操作解决，不增加按题型匹配的模板或分支。M1 三角形保留为回归样例，执行基础继续使用 TypeScript。

## 安装

需要 Node.js 22+、pnpm 11，以及系统 `curl`、`unzip`。已在 macOS arm64 验证，其他平台尚未验收。

```sh
pnpm install --frozen-lockfile
pnpm setup:runtime
pnpm exec playwright install chromium
pnpm build
```

`setup:runtime` 从 GeoGebra 官方版本化地址下载资源包，核对 `runtime.lock.json` 中的 SHA-256，解压到 `.runtime/`。安装阶段需要网络；浏览器执行阶段只允许访问本机资源。runtime 不提交到 Git，也不包含在本项目 MIT 许可中。详情见 [第三方说明](THIRD_PARTY_NOTICES.md)。

如果已下载同一官方压缩包，可以执行 `pnpm setup:runtime /absolute/path/to/bundle.zip`。摘要不匹配时安装失败。已有 `.runtime/` 不会被覆盖；重新安装前先移走旧目录。

## 运行样例

```sh
pnpm demo
# 可选：pnpm demo --output /absolute/path/to/output
```

命令生成新的 `output/m1/m1-*/delivery/`，标准输出返回结果 JSON。构图浏览器在完成后关闭。产物包括：

- `result.ggb`：真实 GeoGebra 导出的文件。
- `verification.json`：构造、文件重载及鼠标拖动和缩放的检查结果。
- `preview.png`：交互检查前的画面。
- `manifest.json`：runtime 版本、文件摘要和对象事实。

用返回的 `delivery` 路径打开预览：

```sh
pnpm preview --delivery /absolute/path/to/delivery
```

预览使用独立的可见 Chromium 窗口。拖动 A、B、C 可以观察中点和中线联动。右下角按钮和 Ctrl + 滚轮可以缩放。预览不会覆盖 GGB 文件。

命令在文件加载和对象检查完成后输出就绪 JSON，并保持前台运行。关闭展示浏览器或按 Ctrl+C 会释放浏览器及本地服务；仅关闭一个标签页可能不会结束整个浏览器。强制杀进程时不能保证清理，需手动关闭残留 Chromium。

预览要求清单、GGB、非空报告及截图齐全。报告中的构造、重载和交互检查必须通过，且包含对应证据。快照包含标签和线宽；较早的 M1 产物请重新运行 `pnpm demo` 生成。

## 验证与代码组织

```sh
pnpm check             # TypeScript 类型检查
pnpm build             # 编译 src/ 和 tests/
pnpm test              # 本地资源服务边界及清理
pnpm test:browser      # 真实 applet 导出、重载、交互和反例
# 可选：在可见 Chromium 中执行同一组预览交互检查
GGB_HEADED=1 pnpm test:browser
```

浏览器测试需要已安装 runtime 和 Chromium。测试检查独立文件加载、构造依赖、呈现反例、交付缺项及错误报告拒绝、文件摘要和预览不写回。还检查浏览器 API 不修改进程信号处理器或退出码，以及 CLI 收到 SIGTERM 后关闭预览并释放端口。检查只覆盖固定样例和有限拖动样本，不证明一般数学命题。

`src/server.ts` 管理资源映射，`browser.ts` 管理 applet 生命周期与事实读取，`triangle.ts` 管理固定样例及核验，`delivery.ts` 管理文件交付。`cli.ts` 管理参数、输出、进程信号和退出码，通过 `AbortSignal` 请求资源清理。构造与预览共用 `viewer/index.html`，无常驻服务和额外模型调用。
