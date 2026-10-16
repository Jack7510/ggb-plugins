# M5 原生二维程序与 Algebra/CAS 验收

日期：2026-10-16。版本：0.5.0。固定 GeoGebra 5.4.932.1，macOS arm64。验证使用真实 applet 和 headless 浏览器；最终 Chrome 展示另行记录。

## 实现与接口

协议 2 增加 native 步骤和 expression 检查。Algebra 原生语句由 GeoGebra 解析；CAS 等待就绪后执行，把当次结果物化为命名原生对象。compile 只检查原生程序封装及引用，不复制命令类型系统。M1 原语保留为协议 2 的回归编写形式，编译后复用同一 execute、observe、verify、build 和 preview。

数学检查保存临时探针的类型、定义有效性和实际结果，删除探针后审计原对象不变。verify 只消费事实，不调用浏览器。构图、重载、交互、提交和关窗清理继续走现有管线。原八个 src 模块、单包结构及运行依赖保持不变。

## 跨题与反例

- 抛物线：原生 Parabola、Point、切线等表达式，核验焦点、准线约束、中点、垂直、切点、相切、呈现和真实路径点拖动。
- 纯代数：CAS 因式分解、展开、实根及矩阵行列式，原生对象随 GGB 重载；完整 Algebra 视图显示结果，无自由点、拖动和图形缩放要求。
- M1 三角形：原回归、隐藏对象、标签、线宽、依赖造假及灰区检查继续保留。
- 额外组合：导数、数列及求和只更换请求，未增加命令包装或题型路由。

新增反例覆盖错误答案、未定义及缺失输入的探针、数值 0 冒充布尔 false、未知数学命令、CAS 语法错误、三维对象、遗漏声明输出、固定坐标冒充依赖和局部变量及函数形参冒充全局依赖。故障注入覆盖 CAS 一直未就绪、初始化取消，以及探针修改原对象；失败不得提交 delivery，浏览器和本地服务必须释放。

## 实际边界

原生程序没有数学命令白名单，不代表全部 GeoGebra 命令已经验收。M5 CAS 保存当次结果，不提供动态 CAS 单元。复杂命令参数及局部绑定无法确定依赖时返回 unverified；M6 完善事实与交互覆盖，M7 建立覆盖记录。三维、宿主 JavaScript、外部资源和脚本触发器不在开放范围。

Algebra 视图在创建对象前初始化。原生数值、列表和布尔对象的默认图形标签会被 GeoGebra 在重载时规范化，一致性比较排除这些默认标志；显式呈现要求仍重新核验。所有完整原始快照保留在报告中。

## 最终验证与安装

- `pnpm check`、`pnpm build`、`pnpm test`（27 项）通过。
- `pnpm test:browser` 全程 headless：33 项构图及原生程序检查、45 项故障与启动检查通过，共 105 项测试。
- Skill validator、文档相对链接及代码块静态检查、`git diff --check` 通过。Mermaid 未单独渲染。
- 最终 ZIP 为 `output/plugin/ggb-plugin-GkSgHQ/ggb-plugins-0.5.0.zip`，SHA-256 为 `2a01aff991a5e43de03668b1a871d0ad75bed0bd85788dd3c8c814c994cddd6b`。
- 通过正式 marketplace/add 安装到本机 0.5.0 缓存；22 个发布文件与最终包逐字节一致，生产依赖及 headless doctor 的 smoke、casSmoke 通过。

在仓库外的独立 cwd 调用安装副本 CLI，抛物线构造与重载各 38 项通过，路径点拖动通过；纯代数各 18 项通过；M1 各 20 项及拖动通过。三份正式文件均经安装副本 headless preview 复核，关闭后 SHA-256 保持不变。交付、截图及精简证据位于忽略目录 `output/m5-final-acceptance/`。

真实 Codex CLI 0.162.1 app-server 的 skills/list 已发现已启用的 0.5.0 Skill，路径为安装缓存。此次没有再启动独立模型回合做自然语言自动选 Skill 的验收；M5 构图程序由本次 Codex 任务生成并通过安装后统一 CLI 执行。桌面插件目录 UI 和其他平台仍未验收。

全部 headless 检查完成后，最终安装副本 CLI 分别用 Chrome 加载抛物线和纯代数正式文件；两者均完成实际重载核验并返回就绪 JSON，前台进程保留。用户关闭预览页后按既有清理路径退出专用浏览器和本地服务。就绪证据保存于 `output/m5-final-acceptance/chrome-previews.json`；没有把临时旁路作图脚本用于正式交付。
