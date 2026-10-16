# Repository Guidelines

## 构建与验证

使用 Node.js 22+、package.json 指定的 pnpm，以及系统 curl、unzip、zip、tar 和 npm。故障测试需要支持 `--experimental-test-module-mocks` 的 Node；已验收环境见对应验证记录。

首次准备源码工程：

```sh
pnpm install --frozen-lockfile
pnpm setup:runtime
pnpm exec playwright install chromium
pnpm build
```

runtime 已存在时不覆盖；需要重装时先确认目录用途。可向 setup:runtime 传入已下载的官方 ZIP，仍须通过摘要检查。

常用维护命令：

| 命令 | 用途 |
| --- | --- |
| `pnpm check` | TypeScript 类型检查 |
| `pnpm build` | 编译到 dist |
| `pnpm test` | 输入、资源、安装、打包及适配层测试 |
| `pnpm test:browser` | 真实 applet、交付、故障和启动回归；先 build |
| `pnpm coverage:commands` | 重建固定 runtime 的命令调用证据 |
| `pnpm pack:plugin` / `pnpm pack:dsh` | 分别构建 Codex ZIP / DSH TGZ |
| `git diff --check` | 检查补丁空白错误 |

按改动运行必要检查。数学执行、核验或交付改动需要真实浏览器回归；只改文档时检查命令、链接、锚点和 diff，不为此启动浏览器。

## 修改工程时的约束

- 使用 TypeScript ES modules、两空格缩进、单引号和 `.js` 本地导入扩展名；没有独立 formatter 或 lint 配置。
- 按[设计中的模块职责](docs/ggb-plugins-design.md#3-架构与责任边界)定位修改。保持单包，不机械拆分文件或引入服务层。
- 新题先更换原生程序与检查；不增加题型路由、关键词模板或逐数学命令包装。M1 三角形保留为回归输入。
- 新测试放在 tests；安装、打包及 DSH 接入的 JavaScript 测试沿用现有位置。使用 Node 内置测试框架，故障注入只存在于测试，不添加生产故障开关。
- 自动验证使用 headless 并保存截图；只在最终交付成功后展示浏览器。不要操作用户已有浏览器会话。
- 修改交付流程时核对设计中的清理与提交不变量。不得放宽容差、删除必需条件或借用另一 checkout／客户端缓存来让测试通过。
- 不提交 node_modules、dist、.runtime、output 或用户产物。保留 GeoGebra 许可与第三方归属。
- 保留已有未提交改动；提交时只包含本任务文件。使用简短祈使句提交标题，说明验证范围及未验收项。

## 打包与发布

package.json、plugin.json 和 dsh/package.json 的版本必须一致。先验证两种封装，再提供 `docs/releases/v<version>.md`。发布工作流从固定标签构建；不要移动已发布标签。包的安装步骤只维护在安装说明和 DSH 随包 README，不在这里复制。

## 文档维护

每个问题指定一个解释位置；其他文档用链接引用：

| 文档 | 负责内容 |
| --- | --- |
| AGENTS.md | Agent 的构建、检查、修改和发布注意事项 |
| README.md | 项目用途、用户用法和仓库入口 |
| docs/CHANGES.md | 已发布与未发布的重要修改记录 |
| docs/ggb-plugins-design.md | 需求、设计思路、责任边界和取舍 |

字段与调用细节以 Skill 能力契约为准；安装细节放在安装文档；具体测试数量和证据保留在验收记录。不要把这些明细重复贴到四份入口文档中。
