# M6 通用事实与交互验收

日期：2026-10-16。源码版本：0.6.0。固定 GeoGebra 5.4.932.1，macOS arm64。所有自动构造、重载、交互和预览检查均使用真实 headless applet。

## 接口与责任

继续使用协议 2、八个生产模块和同一 build/preview 管线，没有新增运行依赖、题型分支或数学命令包装。旧 M1/M5 请求仍能执行；交付 milestone 为 M6，旧交付目录须重新构造。

| 扩展 | 实际证据与边界 |
| --- | --- |
| 列表／矩阵 | 原生类型、Length 和 Element 读取嵌套数值／布尔 data；不是格式化字符串。逐项核对类型、容差及灰区，最多 256 个节点、深度 8 |
| 符号条件 | CAS 检查显式声明来自原文的 assumptions，原生 Assume 计算后保存假设和结果；不自动证明假设或条件提取完整 |
| 原生输出 | 完整核对异步输入接口返回的标签；允许自动下标名，拒绝遗漏产物和隐式新增独立参数 |
| 参数与路径 | 各样本独立重载原 GGB；滑块通过 native_value 设置，路径点通过 mouse 实际拖动，不混同两类证据 |
| 依赖与呈现 | 从原生函数声明排除形参；复杂局部绑定仍未验证。显式视野包含请求范围，并保持两轴等比例 |

引擎负责异步加载数学模块，适配器限制每次等待时间。临时探针读取后删除，并核对原对象 XML；清理错误不得替换已有错误。数值对象除已定义外，还必须具有有限值。运行状态、资源关闭、原子提交及预览关窗清理沿用 M3。

## 跨域验收

- `examples/functions.json`：参数函数、导函数、定积分、不等式区域、圆上路径点及两个交点；两个滑块目标值和一次真实点拖动复用交付管线。
- `examples/statistics.json`：列表、总体统计量、逆矩阵、单位矩阵、复数和限定 `x>0` 的符号检查；Algebra 视图展示原生结果。
- M1 三角形及 M5 抛物线、纯代数回归保留。
- 实现冻结后仅更换输入，组合 Zip、Median、Polynomial 和 Integral，完成列表统计、多项式插值、符号等价及积分检查。
- 另验自动下标多输出、小数精度、布尔元素及空列表。核验前后及文件重载后均保留真实结构值。

## 失败门禁

真实反例覆盖：省略符号假设、题外假设、错误矩阵、数组灰区、布尔与数值混同、未定义元素、遗漏多输出、滑块越界／未变化／固定、依赖数值冒充滑块、参数采样退化为无穷及条件分支改变。上述情况均不提交正式 delivery。

异步原生调用始终未完成时，单次超时、取消和总时限均关闭浏览器及服务，不提交交付目录。既有导出篡改、CAS 未就绪、探针修改原对象、清理错误优先级、原子提交和关窗退出回归继续保留。

## 验证结果

`pnpm check`、`pnpm build`、`pnpm test`（28 项）及最终 `pnpm test:browser`（55 项构图与 53 项故障测试）全部通过，共 136 项。M6 的 22 项领域检查包含 Algebra 视图参数采样、证据篡改、等比例坐标和完整正反例。

源码 CLI doctor 的 smoke、casSmoke 通过，报告工具版本 0.6.0。`pnpm pack:plugin`、Skill validator、文档相对链接与代码块检查及 `git diff --check` 通过。未新增或单独渲染 Mermaid 图；架构和状态迁移沿用设计文档。

## 交付证据

最终产物位于忽略目录 `output/m6-final-LsQK41/`。每组都保存正式 GGB、请求、核验报告、原始截图及额外 headless 预览截图，摘要和关闭资源证据汇总在 acceptance.json。

| 输入 | 构造／重载检查数 | 交互 |
| --- | --- | --- |
| functions | 33／33 | a=2.5、a=3 两个原生参数样本及 P 的真实鼠标拖动 |
| statistics | 24／24 | 无图形交互要求 |
| parabola | 38／38 | 路径点拖动 |
| algebra | 18／18 | 无图形交互要求 |
| triangle | 20／20 | M1 自由点拖动 |
| combination | 13／13 | 无图形交互要求 |

六组 headless 预览关闭后，浏览器断开、本地服务停止，GGB 摘要不变。截图目视核对了圆的等比例呈现及 Algebra 中的原生列表、矩阵和统计结果。全部自动验证后，源码 CLI 使用本机 Google Chrome 打开 functions 正式交付；没有重新执行程序来代替文件重载。Chrome 就绪及 HTTP 200 证据在 chrome-preview.json，窗口保留供用户交互；本轮没有另做手工关窗验收。

0.6.0 ZIP：`output/plugin/ggb-plugin-j3hfeU/ggb-plugins-0.6.0.zip`，SHA-256 为 `44169dd0a357cbbec49058d6b6460f18882c1c2b4b12099c2b0e1da4a30a588e`。打包检查通过，但未更新本机安装缓存或重新执行 Skill 自动发现验收。

## 发布边界

M6 验收不代表全部二维命令已覆盖，不提供动态 CAS 单元、完整 GGB 作用域解析或全参数域证明。复杂列表中的非数值／布尔元素不能用嵌套 expected 直接核验，应声明原生表达式检查；无法建立所需证据时不得宣称通过。插件安装更新和真实客户端验收留给 M7。

## 0.6.0 发布及本机更新

同日按后续请求完成分发及安装更新，保留以上 M6 开发阶段记录。

- 固定标签 `v0.6.0` 指向 `671f6c4`。本机 marketplace 改用该 GitHub 标签，安装缓存更新为 `~/.codex/plugins/cache/ggb-plugins-local/ggb-plugins/0.6.0`，旧版本缓存和已有 GGB 未删除。
- GitHub [发布流程](https://github.com/Jack7510/ggb-plugins/actions/runs/38870386355) 从固定标签检出，类型检查、构建、28 项基础／打包测试和发布全部通过。首次标签推送未产生运行记录，本次通过手动入口运行同一流程；没有移动标签。
- [Release](https://github.com/Jack7510/ggb-plugins/releases/tag/v0.6.0) 提供编译 ZIP 和 `.sha256`。已匿名下载并校验，公开 ZIP 的 SHA-256 为 `5cb3da1cf123f0743bc19ef7ebdc8a6733a089bf155f536ba046c00f96fc66aa`。它与上面的本地构建 ZIP 是不同归档，八个编译模块与本机安装副本逐字节一致。
- 源码安装副本重新构建，doctor 的 smoke、casSmoke 通过。新的 Codex app-server 在仓库外发现启用的 `ggb-plugins:ggb-construction`，路径属于 0.6.0 缓存；未启动独立模型回合验证自动选 Skill。
- 在仓库外调用安装副本 CLI：functions 构造／重载各 33 项、statistics 各 24 项、M1 triangle 各 20 项通过；滑块和点样本通过。headless 预览关闭后，浏览器及服务退出，GGB 摘要不变。
- 公开 ZIP 解压后没有源码和 TypeScript，安装器只准备生产依赖。其独立 doctor 通过；从另一个 cwd 直接调用 ZIP 中的 CLI 完成 statistics 的 24／24 项检查、正式交付和 headless 预览，无需调用 Codex。退出及文件摘要核对通过。

安装日志、Skill 列表、GGB、报告和截图位于忽略目录 `output/release-060-4IfzIU/`，证据为 acceptance.json、portable-acceptance.json。此次验证了分发、Codex 安装及独立 CLI 入口，不代表其他客户端的插件格式或 Skill 自动发现已全部验收，也不完成 M7 的全命令覆盖记录。
