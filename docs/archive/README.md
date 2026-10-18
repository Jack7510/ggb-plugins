# 阶段归档索引

归档日期：2026-10-18。源码基线为 `4a53529`，另保留本轮之前未提交的设计文档补充；本次不创建版本标签、不声明发布或重新验收。

## 范围与状态

历史里程碑、性能比较及客户端验收记录移入各自文档目录的 `archive/2026-10-18/`。仅调整位置、相对链接并添加历史标记，原有结论、失败记录、版本和验收限制保留。配套结果 JSON 原样迁移。

这些记录是历史证据，不是当前操作指南。现行规则从 [设计文档](../ggb-plugins-design.md)、[能力契约](../../skills/ggb-construction/references/capabilities.md)、客户端安装说明和 [AGENTS](../../AGENTS.md) 进入。后续修复依据见 [统一核验记录](../unified-validation.md)。发布说明继续保留在 [releases](../releases/)。

## 位置对照

| 原位置 | 归档位置 |
| --- | --- |
| `docs/m1-validation.md` | [m1-validation.md](2026-10-18/m1-validation.md) |
| `docs/m2-validation.md` | [m2-validation.md](2026-10-18/m2-validation.md) |
| `docs/m3-validation.md` | [m3-validation.md](2026-10-18/m3-validation.md) |
| `docs/m4-validation.md` | [m4-validation.md](2026-10-18/m4-validation.md) |
| `docs/m5-validation.md` | [m5-validation.md](2026-10-18/m5-validation.md) |
| `docs/m6-validation.md` | [m6-validation.md](2026-10-18/m6-validation.md) |
| `docs/m7-validation.md` | [m7-validation.md](2026-10-18/m7-validation.md) |
| `docs/dual-ecosystem-validation.md` | [dual-ecosystem-validation.md](2026-10-18/dual-ecosystem-validation.md) |
| `docs/geometry-benchmark.md` | [geometry-benchmark.md](2026-10-18/geometry-benchmark.md) |
| `docs/geometry-benchmark-verification.md` | [geometry-benchmark-verification.md](2026-10-18/geometry-benchmark-verification.md) |
| `docs/geometry-benchmark-results.json` | [geometry-benchmark-results.json](2026-10-18/geometry-benchmark-results.json) |
| `docs/performance-validation.md` | [performance-validation.md](2026-10-18/performance-validation.md) |
| `docs/performance-results.json` | [performance-results.json](2026-10-18/performance-results.json) |
| `codex/docs/codex-v2-validation.md` | [codex-v2-validation.md](../../codex/docs/archive/2026-10-18/codex-v2-validation.md) |
| `dsh/docs/dsh-primary-validation.md` | [dsh-primary-validation.md](../../dsh/docs/archive/2026-10-18/dsh-primary-validation.md) |
| `dsh/docs/dsh-solve-stability-pilot.md` | [dsh-solve-stability-pilot.md](../../dsh/docs/archive/2026-10-18/dsh-solve-stability-pilot.md) |

## 仓库范围与检查

清理范围限定为 Git 已跟踪文件及本次归档文件。`.gitignore` 忽略的目录不纳入检查或清理；历史文档中的本机证据路径保留，不作为本轮文件存在性检查对象。`talks/` 保留，不纳入本次修改或提交。

源码、回归测试、示例、Skill、参考契约、命令目录与覆盖数据、许可、发布说明及维护脚本保留。基准脚本仍有复现用途，不按日期删除；历史验收与阶段结果通过本索引查询。

本轮只检查文档补丁、仓库内迁移引用和归档完整性，不重复构建、测试、安装或数学验收。文档归档不使历史门禁结果自动适用于当前版本。
