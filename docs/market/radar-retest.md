# Radar 复测请求草稿

目标仓库为 [AdamPlatin123/dsh-plugin-radar](https://github.com/AdamPlatin123/dsh-plugin-radar/issues/new)。

**标题** `请复测 Jack7510/ggb-plugins-dsh v0.9.0 的 incompatible 判定`

**正文**

2026-11-18 的[公开目录](https://raw.githubusercontent.com/AdamPlatin123/dsh-plugin-radar/main/data/plugins-all.json)
将分发仓库 `Jack7510/ggb-plugins-dsh` 标为 `incompatible`，源码仓库
`Jack7510/ggb-plugins` 标为 `ok`。请提供分发仓库对应的测试 commit、DSH 版本、安装方式和失败阶段，
并用 [v0.9.0 分发 tag](https://github.com/Jack7510/ggb-plugins-dsh/tree/v0.9.0) 复测。

我们在 macOS、Node 26.5.1、pnpm 11.7.0、DSH 0.2.2-rc.1 和 Chrome 157 的隔离 Web profile 中
验证过 v0.9.0。registry 安装通过，使用同版本 TGZ 完成了 `setup-plugin`、官方 runtime 的 SHA-256 校验、
doctor、自动加载 Skill 和真实会话交付。完整步骤和截图见
[v0.9.0 验收记录](https://github.com/Jack7510/ggb-plugins/blob/main/dsh/docs/v0.9.0-validation.md)。

最小复测步骤（请使用一次性 `DSH_HOME`，预装 Chrome 或 Edge）：

```sh
dsh plugin --profile web add ggb-plugins-dsh@0.9.0
node "$DSH_HOME/profiles/web/node_modules/ggb-plugins-dsh/scripts/setup-plugin.mjs"
```

如 runner 测的是 GitHub 安装，请记录实际使用的 ref。若失败发生在环境准备阶段，请附上首个错误，
以便判断问题发生在 bundle 加载、运行时下载还是浏览器启动。
