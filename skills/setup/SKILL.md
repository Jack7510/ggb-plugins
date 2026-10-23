---
name: ggb-setup
description: 安装或升级 GeoGebra Construction 后，准备当前 Codex 安装副本的依赖和 GeoGebra 运行时，执行就绪检查。用于插件初始化和安装故障定位，不用于数学作图。
---

# GeoGebra Construction 安装引导

把当前插件安装副本准备到可作图状态。只初始化本副本，不发布插件，不修改用户题目或已有交付文件。

## 定位与前置检查

从本 Skill 所在的 `skills/setup/` 向上两级取得插件根目录。
以 Codex 提供的安装路径为准，不猜用户名、缓存版本或源码目录。
确认根目录存在 `plugin.json`、`scripts/setup-plugin.mjs` 和
`runtime.lock.json`；预编译包还须有 `dist/src/cli.js`。
读取 `plugin.json` 的版本，后续与 doctor 返回的版本核对。

检查 PATH 中的 Node.js 22+、pnpm 11、curl、unzip，以及本机 Chrome 或 Edge。
使用独立的 `node`，不要把 Electron 或 Codex 的可执行文件作为 Node.js。
缺少系统依赖时说明具体缺项和下一步，不擅自更改全局配置或安装系统软件。
需要选择浏览器时，使用当前进程的 `DSH_GGB_BROWSER` 指定浏览器；不复制其他插件的运行时。

## 初始化与就绪判据

在实际安装副本执行，下列路径须替换为已确认的绝对路径并正确引用：

```sh
node "<installed-plugin>/scripts/setup-plugin.mjs"
```

安装器准备依赖，按锁定摘要下载并校验 GeoGebra，并运行 doctor。
首次联网安装可能需要等待。保留进程标识并读取完成结果，不并行启动第二个安装器。
安装需要网络和写入安装副本的权限；权限不足时通过宿主正常授权流程处理。
不得借用开发 checkout、DSH 或旧 Codex 副本的 node_modules、dist 或 .runtime。

只有安装器正常退出，且 doctor 返回 `ok: true`、`smoke: passed`、
`casSmoke: passed`，工具版本与本副本一致，才能报告“设置完成”。
若当前调用只返回部分日志，继续读取结果，不能把“下载开始”当作成功。
若结果没有完整保留，单独执行本副本的 `dist/src/cli.js doctor` 核对。

失败时保留首个错误，区分依赖缺失、网络、浏览器和摘要不符。
报告失败步骤与可执行的修复动作；不跳过摘要、重载或 CAS 检查，不原样反复重装。
已有 runtime 不一致时先报告，不自动删除或替换该目录。

## 完成后

说明实际安装版本、浏览器和就绪结果。提醒用户按客户端提示刷新或重启，
并在新对话中使用 `ggb-construction`；本引导不声称当前旧会话已自动刷新。
提供一道简短的作图体验提示，等待用户开始作图，不把构图额外算作设置成功条件。
