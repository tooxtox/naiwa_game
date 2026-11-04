# 腾讯云 CloudBase 静态托管

本游戏只部署 `dist/`，不需要数据库、云函数或小程序账号。已复用上海地域的静态托管环境，游戏独立放在 `naiwa-game/`，不覆盖其他目录。

## 目标与更新

- 环境：`cloud1-d2g1g79yaf06b648b`
- 地域：`ap-shanghai`
- 访问地址：[奶蛙：快乐回收站](https://cloud1-d2g1g79yaf06b648b-1462011668.tcloudbaseapp.com/naiwa-game/)
- 默认入口：`naiwa-game/index.html`

使用 Node.js 22，先通过官方设备码流程授权：

```bash
npm exec --yes --package=@cloudbase/cli@3.9.0 -- tcb login --flow device --intl false
```

CLI 会输出腾讯云授权页面和一次性用户码。在浏览器自行完成登录与授权，无需提供密码、API Key 或本地回调。

```bash
npm run deploy:cloudbase
```

该命令先执行包含 TypeScript 检查的生产构建，再上传游戏目录。`--safe` 创建发布前备份，`--verify` 校验远端文件；入口最后上传，避免新页面引用尚未上传的资源。未启用 `--prune`，保留环境中其他资源和已有版本文件。

更换账号或环境时，先检查 `tcb env list --json` 和 `tcb hosting detail -e 环境ID --json`，然后修改 `package.json` 中的目标环境与地域。环境 ID 和网站地址不是访问密钥；登录凭据由官方 CLI 保存在用户配置目录，勿提交凭据文件。

## 朋友首次访问

默认测试域名会先出现 CloudBase 的「页面访问提示」，等待倒计时结束后点击「确定访问」，即可进入游戏。提示由托管平台提供，不在游戏代码内。不要将首次出现该提示页误认为游戏丢失或上传失败。

官方说明默认域名不再因固定有效期而硬性停用，但仅适合开发测试，存在访问频率和风控限制；不能承诺永久免费或永久可用。当前环境查询到的套餐到期时间为 **2027-02-01 23:59:59**，自动续费关闭；此日期是本次部署时的查询快照，后续以控制台为准。持续分享需要保持环境有效并留意流量额度。

默认域名的提示页通过绑定符合要求的自定义域名移除，本次部署不涉及购买域名、开通套餐或修改自动续费。

## 验证

```bash
node scripts/verify-public.mjs 'https://cloud1-d2g1g79yaf06b648b-1462011668.tcloudbaseapp.com/naiwa-game/' mage
```

生产检查会在全新浏览器会话中完成 CloudBase 提示页的正常继续流程，再检查游戏响应、版本、角色图集、28 个音频、手机横屏全屏、浮动摇杆、多指攻击、动作按钮和格挡冷却，并收集脚本错误和失败请求。末尾参数可使用 `warrior`、`mage`、`archer`。

### 2026-11-03 部署结果

- `npm run build`、`npm run typecheck` 通过。
- 37/37 个生产文件上传成功，CloudBase 远端文件校验通过。
- 三职业分别完成真实 CloudBase 地址上的生产检查：继续提示页后 HTTP 200，844×390 手机横屏全屏，角色与 28 个音频加载正常，浮动摇杆和多指攻击、四个动作按钮、格挡冷却正常。
- 三次检查均无页面脚本错误或失败请求；截图保存在本地忽略目录 `artifacts/classes-public-{mage,warrior,archer}.png`。
- 本次未修改战斗逻辑，未重复运行完整游戏回归测试。

参考：[静态托管快速开始](https://docs.cloudbase.net/hosting/quick-start)、[CLI 登录](https://docs.cloudbase.net/cli-v1/login)、[默认域名访问限制](https://docs.cloudbase.net/service/alias)。
