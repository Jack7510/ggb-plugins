# M1 验证记录

日期：2026-10-16。范围：固定三角形与中线原型，不代表第一版产品验收完成。

## 环境与资源

- macOS 15.7.3，arm64。
- Node.js 26.5.1，pnpm 11.7.0，TypeScript 7.0.2。
- Playwright 1.64.1，Chromium 156.0.8078.4（revision 1248）。
- GeoGebra Math Apps Bundle 5.4.932.1；官方版本化地址及 SHA-256 见根目录 `runtime.lock.json`。

安装器使用已从官方分发源下载的压缩包执行，校验摘要后解压。浏览器只允许访问当前本地服务，未使用其他工程代码或 runtime 路径。

## 检查结果

| 检查 | 结果 |
| --- | --- |
| `pnpm check` 和 `pnpm build` | 通过 |
| `pnpm test` | 通过；验证资源映射、Host/Origin、方法限制、路径及符号链接边界、服务关闭 |
| `pnpm test:browser` | 通过；真实 GeoGebra，无 fake applet |
| `GGB_HEADED=1 pnpm test:browser` | 通过；同一组回归在可见预览窗口执行 |
| `pnpm demo` | 通过；构图进程退出，生成 GGB、检查报告、截图和清单 |
| 实际 GGB 文件 | ZIP 包含构造 XML 及 GeoGebra 默认内容；新 applet 从磁盘文件字节加载 |
| 对象及依赖 | A、B、C 可移动；M 使用 `Midpoint[A, B]`；CM 使用 `Segment[C, M]` |
| 文件重载 | 对象事实、依赖、坐标、长度及声明颜色保持一致 |
| 可见浏览器交互 | 真实鼠标拖动 A 后中点和中线联动；Ctrl + 滚轮改变视野缩放 |
| 反例 | 固定坐标替代中点依赖时拒绝；文件摘要不匹配时拒绝预览 |
| 预览隔离 | 独立进程加载已交付文件；交互后 GGB 摘要不变 |
| 退出清理 | `preview` 就绪后接收 SIGTERM，进程退出且本地端口不可访问；程序关闭浏览器后同样释放资源 |

可重现命令和安装要求见 [README](../README.md)。最近一次样例产物位于本地忽略目录 `output/m1/m1-WMAa5i/delivery/`，不提交到 GitHub。

可见窗口检查等待实际绘制帧，并在按下鼠标后等待 applet 建立拖动目标。检查观察到几何更新后才松开鼠标，未用固定延时或 API 改坐标代替真实拖动。

## 验收边界

检查只覆盖固定三角形和有限交互样本，不证明一般数学命题。当前没有通用题目输入、方案 schema、Skill 或插件安装包；设计中的 M2–M4 和完整 A1–A10 尚未完成。其他操作系统、系统崩溃及强制杀进程后的资源回收尚未验收。
