# 发布到 npm

适用：把 DSH bundle 发布为 npm 包 `ggb-plugins-dsh`。Codex ZIP 仍通过 GitHub
Releases 分发。本机 DSH 版本 0.2.1-rc.2，npm 11。

## 前置

- npm 账号已启用 2FA（发布与 approve 都要 6 位 TOTP，不要用恢复码）。
- `npm whoami` 确认登录身份；确认 `npm owner ls ggb-plugins-dsh`（首次发布后才有）。
- 三个版本号一致：`package.json`、`plugin.json`、`dsh/package.json`。

## 1. 构建并生成发布目录

```sh
pnpm build
node scripts/package-plugin.mjs output/npm-stage --target=dsh
```

输出的 JSON 有 `pluginDirectory`。该目录才是发布的包：已含 `dist/src/*.js`、
`skills/`、`viewer/`、`cordis.patch.yml`、`capabilities.json`，`package.json`
的 `name` 来自 `dsh/package.json`。

## 2. 检查内容

```sh
npm pack --dry-run <pluginDirectory>
```

确认有 `dist/src/`、`skills/`、`viewer/`、`cordis.patch.yml`、`engines.dsh`，
且没有 `node_modules`、`.runtime`、`src/`。

## 3. 发布

两条路径：

- 直接发布：`npm publish <pluginDirectory> --access public`，按提示输入 OTP。
- 分阶段发布（npm 11 对新包可能自动进入）：
  ```sh
  npm stage publish <pluginDirectory>
  npm stage list                       # 记下 stage id 与 status
  npm stage approve <stage-id>         # 需要 2FA
  ```

`npm stage approve` 的两个注意点：

1. 非交互终端里 npm 会把授权链接打码；用伪终端取真实链接：
   `script -q /dev/null npm stage approve <stage-id>`，或直接在自己的终端执行。
2. 若返回 `E409 ... automated review hasn't finished`，说明自动审查未完成，
   等几分钟后重试即可；stage 不会丢。

暂存期间 registry 会出现占位版本 `0.0.0-stage`（描述为
`Temporary package placeholder for staged publishing`），approve 成功后正式
版本才出现。

## 4. 发布后核对

```sh
npm view ggb-plugins-dsh version dist.tarball engines.dsh
npm stage list                              # 不应再有待审项
npm dist-tag add ggb-plugins-dsh@0.8.5 latest   # latest 若仍指向占位包
npm unpublish ggb-plugins-dsh@0.0.0-stage       # 清理占位（发布后 72 小时内可撤销）
```

再用隔离的 `DSH_HOME` 验证当前 DSH 真的能安装，而不只看 registry：

```sh
tmp=$(mktemp -d)
DSH_HOME=$tmp dsh plugin --profile web add ggb-plugins-dsh@0.8.5
rm -rf "$tmp"
```

## 5. 用户安装

```sh
profile=desktop   # DSH 插件中心/Web 宿主改为 web
dsh plugin --profile "$profile" add ggb-plugins-dsh@0.8.5
node ~/.dsh/profiles/$profile/node_modules/ggb-plugins-dsh/scripts/setup-plugin.mjs
# 重启 DSH
```

给老师的版本（粘贴到 DSH 对话框）：

```text
请安装 npm 包 ggb-plugins-dsh@0.8.5 到 desktop profile（Web 宿主改用 web），
运行安装副本里的 setup-plugin，然后提醒我重启 DSH。
```

## 6. 升级与回滚

- 升级：改三处版本号 → 构建 → 暂存 → approve；用户执行
  `dsh plugin --profile desktop add ggb-plugins-dsh@<新版本>`。
- 回滚：让用户安装旧版本号。npm 默认保留旧版本，不自动删除。

## 7. 常见错误

| 错误 | 原因 | 处理 |
| --- | --- | --- |
| `EOTP` | 缺 OTP、OTP 错误或过期 | 用当次 6 位 TOTP 重试 |
| `E409 ... automated review` | 自动审查未完成 | 等几分钟重试 approve |
| `E409 ... previously published version` | 该版本已有发布记录 | 提升版本号后重新暂存 |
| `E403` | 名字被占用或权限不足 | 改名或确认账号是 owner |
| latest 指向 `0.0.0-stage` | 暂存未 approve | 完成 approve 或 `npm dist-tag` 修正 |

## 8. 安全

- 不要把 npm token 写进仓库或脚本；CI 用 granular token，只开 publish 权限。
- 2FA 恢复码离线备份；approve 前先确认 `npm whoami` 是本人账号。
- 撤销发布（unpublish）会影响所有已安装用户，只在占位包或严重错误时使用。

## 本次记录（0.8.2）

0.8.1 有一次未完成的发布在 registry 留下了「已发布」记录，导致该版本无法再
暂存；发布 0.8.2 绕过该记录。若以后遇到同类情况，优先提升版本号，不要强行
unpublish 正式版本。

## 本次记录（0.8.5）

0.8.4 把 `engines.dsh` 固定为 `0.2.1-rc.2`，当前 DSH `0.2.1-rc.3` 会拒绝安装；
0.8.5 改为 `>=0.2.1-rc.2 <0.2.2`，并在 rc.3 的隔离 `web` profile 验证安装与
配置加载。受限 SDK Server 入口仍只接受已验证的 `0.2.1-rc.2`，不因本次范围放宽
而改变。发布前不要移动已发布标签；用户可见版本以 npm 和 GitHub Release 为准。
