# 腾讯云 EdgeOne 部署

本游戏是纯静态 Vite 项目，部署 `dist/` 即可；不需要数据库、云函数或运行服务器。

## 构建配置

项目根目录的 `edgeone.json` 已配置：

| 配置 | 值 |
| --- | --- |
| 项目名称 | `naiwa-game` |
| Node.js | `22.17.1` |
| 依赖安装 | `npm ci` |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |

Vite 使用相对资源路径，角色图集和 28 个音频均随产物一起上传。

## CLI 发布

先在自己的浏览器完成腾讯云登录及官方 CLI 授权：

```bash
npx --yes edgeone@1.6.47 login --site china
```

登录完成后，从项目根目录运行：

```bash
npm run deploy:edgeone
```

该命令重新构建后，将 `dist` 上传至 `naiwa-game` 的生产环境。CLI 必须登录到目标账号；如果已有同名项目，发布前先确认它属于本游戏。命令使用 `--skip-ai-gateway-sync`，本游戏不需要 AI Gateway。

登录凭据由官方 CLI 管理，项目内 `.edgeone/` 已加入 `.gitignore`。密码和 Token 无须写入源码。

## 控制台发布

也可在腾讯云控制台的 EdgeOne Pages/Makers 中创建项目，导入 `tooxtox/naiwa_game` 的 `main` 分支，并使用上述构建配置。

直接上传时，上传构建后的 `dist` 或 `artifacts/naiwa-edgeone.zip`。ZIP 根目录必须直接包含 `index.html` 和 `assets/`，不能额外包一层 `dist/`。构建产物与 ZIP 不提交到 Git。

## 域名与验收

发布后检查首页、三职业、横屏全屏、多指移动和攻击、音效与资源响应。现有生产检查脚本可接受新地址：

```bash
node scripts/verify-public.mjs 'https://你的实际域名/' mage
```

EdgeOne 平台域名在中国大陆访问存在预览链接有效期限制；长期对外分享应绑定自己的域名。中国大陆加速节点需要已备案域名；不含中国大陆的全球区域可绑定未备案域名。加速区域和 DNS 在确认实际域名后配置，不自动购买域名或修改现有 DNS。

参考官方文档：[CLI](https://edgeone.cloud.tencent.com/pages/document/162936923278893056)、[项目构建配置](https://edgeone.cloud.tencent.com/pages/document/162936771610066944)、[域名与预览访问规则](https://pages.edgeone.ai/document/domain-overview)。


## 本次部署验收

- 已在授权腾讯云账号中创建并发布 `naiwa-game`，区域为全球可用区。
- 项目 ID：`makers-lk74y1erchjw`；生产部署 ID：`dpx6im811jhw`。
- [打开本次生产部署](https://console.cloud.tencent.com/edgeone/pages/project/makers-lk74y1erchjw/deployment/dpx6im811jhw)。
- `npm run build` 通过；部署包包含 37 个文件，28 个音频，根目录存在 `index.html`。
- 使用实际 EdgeOne 预览地址执行 `scripts/verify-public.mjs` 通过：HTTP 200、1.0.0、28 个音频成功加载、844×390 画布、全屏、浮动摇杆和四个动作按钮正常，无脚本错误及网络失败。
- 时效预览签名不写入仓库。需要分享新链接时，在腾讯云项目概览中点击「预览」；长期分享请绑定自定义域名。
