# awesome-dsh-plugin 投稿草稿

目标仓库：[awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。在其 fork 的新分支新增 `data/plugins/jack7510__ggb-plugins-dsh.yml`，内容使用同目录 [awesome-entry.yml](awesome-entry.yml)。提交前再检查主索引和已有 PR，避免重复投稿。不要修改自动生成的目录文件。

建议 PR 标题：

```text
Add GeoGebra Construction plugin
```

建议 PR 正文：

```markdown
Adds ggb-plugins-dsh, a GeoGebra construction plugin for DeepSeek Harness.
It turns 2D math problems into interactive GGB files and verifies stated
conditions before delivery.

- Distribution repository: https://github.com/Jack7510/ggb-plugins-dsh
- Source and issues: https://github.com/Jack7510/ggb-plugins
- npm package: https://www.npmjs.com/package/ggb-plugins-dsh
- The published 0.9.0 package requires setup-plugin after installation to
  prepare dependencies and the GeoGebra runtime; a package install alone
  does not complete setup. Its DSH engine range is >=0.2.1-rc.2.
```

已提交 PR：[#15911](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/15911)。CI 已通过；等待维护者审核；合并后再验证上游目录、dsh-market 和实际客户端中的搜索与安装。投稿或合并不代表安装及运行验收通过。
