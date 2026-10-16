# ggb-plugins 与 ggb_copilot 的架构对照

本文只保留两个项目的比较与取舍依据。原有构建、用法、执行流程、契约和历史介绍已分别归入 [AGENTS](../AGENTS.md)、[README](../README.md)、[需求与设计](ggb-plugins-design.md) 和 [CHANGES](CHANGES.md)。拟议改进统一在设计文档维护，本文不再重复。

## 核心差异和取舍

核心差异是 Agent 的责任归属。ggb_copilot 自己管理构图 Agent、画布事务和任务状态。ggb-plugins 使用宿主的推理与重试能力，把本体集中在数学执行、核验和文件交付。

本节对照 ggb_copilot 提交 `3c374c68` 的 DSH-Native 实现和设计，不使用更早的固定流水线作为比较基线。其 P1–P9 表示责任阶段；模型通过受限工具推进任务，阶段编号不等于服务端固定调用顺序。设计目标、已有实现和验收完成度仍需分别判断。

### 两个项目怎样分配责任

| 比较项 | ggb_copilot：应用管理 Agent | ggb-plugins：宿主管理 Agent |
| --- | --- | --- |
| 推理与调度 | Worker 与 DSH harness 管理模型循环、工具权限、预算和完成门禁 | Codex 或 DSH 等宿主管理对话、模型调用和修复；CLI 执行一次请求 |
| 用户要求 | 冻结 Brief／Requirement，维护要求到验收结果的追溯关系 | Skill 提取题意，模型在请求中提交程序和检查；CLI 核对请求结构与实际证据 |
| 执行输入 | 接受 Plan，经 Manual、Review 和编译形成受控程序，再发送结构化签名事务 | 接受原生 Algebra／CAS 文本，由 GeoGebra 解析数学语法；本体检查信封、对象引用及资源边界 |
| 执行前约束 | 核对方案、文档签名、画布身份及事务基线；包含独立模型审核 | 核对输入结构与可执行条件；本体不调用第二个模型审核题意 |
| 验收组织 | `Requirement → Obligation → Assertion → Predicate → Result`；依据冻结要求派生验收义务 | browser 采集对象、依赖、测量及交互事实，verify 根据请求中的检查给出三种结论 |
| 状态与恢复 | Client、API、Worker 和 RunStore 协作；使用版本、租约、事务日志及回执处理跨端副作用 | 单次本地运行；保存诊断、关闭资源，再提交交付目录；没有跨运行恢复协议 |
| 主要交付对象 | 当前画布及其修改结果；画布提交与任务完成分别判定 | 从空白 applet 生成新的 GGB、验证报告和交互预览 |

ggb_copilot 的 Manual 路径也允许通用原生命令调用，因此不能把差异概括为“固定题型与任意题型”。差异在于命令进入执行器之前，由哪些契约约束方案、来源、对象身份和验收方法。

当前插件已有 [DSH 接入层](../dsh/README.md)。它注册同一份 Skill，并注入 CLI 路径，没有复制构图业务或接管模型循环。因此，这个取舍也不取决于使用 Codex 还是 DeepSeek。

### 两种边界分别换来了什么

ggb_copilot 面向已有画布上的持续协作。模型可能修改对象，客户端可能断线，Worker 可能更换执行者。事务和回执用来判断副作用是否已经发生。副作用未知时进入恢复流程，不能直接重放。这些机制对应实际的跨端状态问题，同时增加了协议、存储及状态迁移的维护成本。

ggb-plugins 面向本地新题交付。每次从空白 applet 开始，可以用临时目录、资源清理和最后提交形成完整边界。宿主已经提供模型、凭据、对话及工具调度，本体无需再建设同样的 Agent 服务。这种边界减少部署和维护成本，但要求宿主持续遵守 Skill，并保留重试前后的题意约束。

原生文本扩大了当前插件的表达范围。新增 GeoGebra 数学命令通常不需要修改 TypeScript 枚举。但是，命令可执行不代表题目条件已全部覆盖。当前同一个 Agent 可以同时生成程序和检查；结构检查不能发现所有遗漏条件，也不能排除所有自证式检查。

ggb_copilot 的冻结要求和独立审核可以降低这类风险，但不能证明模型完整理解了原题。其受限验收程序也有能力边界。两者都需要真实 applet 的结果和反例，不能用模型审核意见代替数学证据。

对于当前插件，应当吸收要求追溯和证据约束，继续保持单包执行与交付边界。已有画布协作、远程多用户和断线恢复成为明确需求时，再评估事务服务。

### 对照依据

ggb_copilot 的下列路径相对于该项目根目录，版本固定为 `3c374c68`。这些路径用于定位比较依据，不是本插件的运行依赖。

| 结论 | ggb_copilot 依据 |
| --- | --- |
| Agent、Client／API／Worker 和存储职责 | `ggb-dsh/README.md`、`docs/ggb-dsh-native-tech.md` |
| 冻结要求、来源覆盖及五层追溯 | `docs/ggb-dsh-native-plan-contract.md` |
| 受控程序、签名事务、回执及恢复 | `docs/ggb-dsh-native-execution.md` |
| 独立模型审核的实现 | `ggb-dsh/apps/worker/src/native/plan-review-model.ts` |
| 尚未完成的实现与验收项 | `docs/ggb-dsh-native-backlog.md` |

本插件的责任依据见[需求与设计](ggb-plugins-design.md#3-架构与责任边界)。输入边界见 [schema.ts](../src/schema.ts) 和 [compile.ts](../src/compile.ts)，重载与提交边界见 [verify.ts](../src/verify.ts) 和 [delivery.ts](../src/delivery.ts)。
