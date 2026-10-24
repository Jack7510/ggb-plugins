# Directrix 路径起点：上游最小复现材料

状态：本地复现材料，尚未提交上游。此文不声明上游已经接受或修复问题。

## 环境与信任边界

使用固定官方 Math Apps Bundle 5.4.932.1。ZIP 来自
`https://download.geogebra.org/installers/5.4/geogebra-math-apps-bundle-5-4-932-1.zip`，
SHA-256 为 `c139f3edb51c004ec67d83226a1f1215486f8559ad98ee37e9e775aac278e96e`。

[独立 HTML](../examples/upstream/directrix-path-origin.html) 只调用本地 GeoGebra 公共 API，
不加载模型、插件 executor 或远程 CDN。默认相对当前页面加载官方 `deployggb.js` 和 HTML5 codebase。
`runtime` 查询参数只用于本机对照测试，不是宿主开放给模型的能力。

## 复现步骤

在插件仓库根目录执行。先校验手头 ZIP 的 SHA-256 与上文一致：

```sh
shasum -a 256 /absolute/geogebra-5.4.932.1.zip
export GGB_REPRO_ROOT="$(mktemp -d)"
unzip -q /absolute/geogebra-5.4.932.1.zip -d "$GGB_REPRO_ROOT"
cp examples/upstream/directrix-path-origin.html "$GGB_REPRO_ROOT/GeoGebra/"
python3 -m http.server 8093 --bind 127.0.0.1 --directory "$GGB_REPRO_ROOT/GeoGebra"
```

在浏览器打开 `http://127.0.0.1:8093/directrix-path-origin.html`，点击 **Run reproduction**。
保存页面 evidence 文本；每个阶段包含实际版本、坐标、路径参数、标签状态和 XML。

| 阶段 | 公共 API 操作 | 应满足的条件 |
| --- | --- | --- |
| created | 创建 `p:y^2=4x`、`d=Directrix(p)`、`A=Point(d)` | A 已定义，路径参数有限 |
| initial | `setCoords('A', -1, 3)` | A 保持在 d 上，路径参数有限 |
| setter | `setLabelVisible('d', false)` | 仅隐藏标签，A 保持定义 |
| reload | 导出 Base64 并用 `setBase64` 重载 | A 保持定义和路径依赖 |

原始固定引擎产生非有限路径参数；setter 更新或重载后，A 的坐标失去定义。
对照测试保留创建阶段到重载阶段的数据，不把最后一次错误当作第一次失效位置。

## 本地兼容修复及验证

根因位于 `AlgoDirectrix.compute()` 的抛物线分支：直线系数更新后没有初始化内部路径起点。
本地配方补齐该初始化；不修改用户构造脚本，不以固定坐标或辅助直线替代 `Point(d)`。
精确 asset、原始及修复后 SHA-256 由[兼容模块](../src/runtime-compatibility.ts)拥有。

`tests/path-point-browser.test.ts` 对同一 HTML 运行原始和修复后 asset 对照，并保存阶段 JSON 与截图。
同组测试另覆盖 initial、显示/隐藏标签、真实鼠标拖动、参数依赖、缩放、重载和其他圆锥曲线。

## 补丁维护与移除条件

1. 新 runtime 版本必须先固定官方归档摘要，再执行原始引擎对照；没有配方时拒绝加载。
2. 当前兼容配方要求精确 asset 和双摘要，任何不匹配均失败关闭，不自动退回未修复字节。
3. 上游候选修复必须通过路径参数、setter、重载、拖动、缩放和其他圆锥曲线回归。
4. 确认官方字节已修复后，显式调整该版本的准入方式，并删除没有活动消费者的旧补丁。
   不通过未知版本自动放行，也不长期给已修复的官方 asset 继续做字符串替换。
5. 同步插件包、宿主锁、Client runtime 与 CI，形成新的兼容组合。对外提交及发布另行授权。
