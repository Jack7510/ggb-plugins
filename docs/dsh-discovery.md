# DSH 分发与开源声明

本插件同时兼容 Codex 与 DSH。Codex 只认仓库根的 `plugin.json` 锚点，所以源码
仓库根不能同时充当 DSH 可安装包；DSH 的自动收录又按分发仓库根识别可安装包。
下面记录两者的分工与开源声明位置。

## 两个仓库

| 仓库 | 角色 | 内容 |
| --- | --- | --- |
| [Jack7510/ggb-plugins](https://github.com/Jack7510/ggb-plugins) | 唯一源码与发布源 | 源码、测试、Skills、Codex 锚点、`dsh/` 清单、发布记录 |
| `Jack7510/ggb-plugins-dsh` | 生成的分发仓库 | 仓库根即构建好的 bundle，无源码、无开发依赖；每次发版整体覆盖 |

分发仓库由脚本生成，不手工修改：

```sh
node scripts/sync-dsh-repo.mjs ../ggb-plugins-dsh
cd ../ggb-plugins-dsh && git add -A
git commit -m "ggb-plugins-dsh <version>"
git tag v<version> && git push --tags
```

脚本会校验三处版本一致、构建、打包 DSH bundle、覆盖分发仓库，并写入
`SOURCE.md`；它不会自动 push。

## 开源声明位置

| 位置 | 声明内容 | 维护方式 |
| --- | --- | --- |
| `dsh/package.json` | `license`、`repository`（含 `directory`）、`homepage`、`bugs` | 手工，随包发布 |
| 仓库根 `package.json` | 同上，供仓库级工具读取 | 手工 |
| `LICENSE` | MIT 全文 | 随包分发（Codex ZIP、DSH TGZ、npm） |
| `THIRD_PARTY_NOTICES.md` | GeoGebra 等第三方许可 | 随包分发 |
| 包 README | MIT 与源码地址说明 | 手工；`dsh/README.md` 有专节 |
| npm 元数据 | registry 上的 `license` 与 `repository` | 随 `dsh/package.json` 发布 |
| 分发仓库 `SOURCE.md` | 构建产物来源、MIT、问题入口 | 由 `sync-dsh-repo.mjs` 生成 |
| GitHub 仓库 | 公开仓库、根 `LICENSE`、话题 `dsh-plugin` | 仓库设置 |

## 收录

DSH 插件目录按固定周期扫描仓库根。分发仓库根带 `package.json` 的
`dsh.bundle` 与 `SOURCE.md`，可直接被发现；源码仓库不参与该扫描。

## 发版检查

1. 三处版本一致，`capabilities.json` 已重新生成；
2. `pnpm build` 与 `pnpm test` 通过；
3. 打包 Codex ZIP 与 DSH TGZ，按发布说明附上校验文件；
4. `node scripts/sync-dsh-repo.mjs ../ggb-plugins-dsh` 后提交并推送分发仓库；
5. npm 按 [发布到 npm](publish-npm.md) 走 stage/approve。
