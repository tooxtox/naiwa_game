# 1.0.0 游戏性与界面优化交付记录

保留 Phaser 4.0.0、TypeScript、Vite、Arcade Physics、原角色图集和全部 28 个本地音频，不引入 UI 框架或后端。

## 已实现

- 普通格挡以 80% 减伤和小额平伤反击为主；完美格挡有独立反击收益、终结充能与削韧。Boss 6% 百分比部分不被核心倍率放大。
- Boss 韧性 110～150，破防 1.8 秒、承伤增加 35%、恢复后 7 秒削韧保护。阶段切换、扇形攻击预警、冻结抗性与死亡演出完整。
- 索敌优先射程内无遮挡目标，合理保持锁定，失效后选择候选；短促且有上限的命中停顿与震动，可降低动态效果。
- 六种真实职业构筑：反击/旋风、冰冻/连锁、穿透/弹射；核心各 3 级，协同需前置；20 次普通奖励后开放精炼。
- 战役第 3 波、快局第 2 波提供入门核心，每个 Boss 胜利后继续手选核心；普通奖励前 10 次在波末选择，后续自动偏向已选路线。
- 五章敌人组合与攻击节奏，三种种子布局，第三章实际掩体增减及导航刷新，后两章最多两个提前 1450ms 预警的环境危险；Boss 场禁用环境危险。安全点不足时减少生成数量。
- 移动 HUD 分层、暂停构筑详情、简化菜单、核心卡片、单条固定升级通知、两套右侧触控布局；保留左三分之一浮动摇杆、多指与全屏回退。
- 独立 10 波快速挑战，随机且调整过的 Boss；按模式和职业保存最高已清波、最快胜利时间、连击与击杀，支持损坏/旧部分数据、读写拒绝与容量写满的会话回退。

## 实际验证

- `npm run typecheck`：通过。
- `npm run build`：通过，Vite 构建约 8.3 秒；Phaser 引擎单独包仍有大于 500kB 的提示，不影响构建。
- `npm test -- --reporter=line`：**111 passed，5.0 分钟**，退出码 0；原 74 项保留，新增 37 项。
- 完整流程测试逐波执行 50 波与 10 波清场、核心及普通奖励、奖励房、记录、领奖幂等、暂停、死亡、同模式重开。只固定测试敌人的 HP/站位，输入、伤害、回收奖励与场景转移仍走真实游戏链路。
- Chromium 移动模拟覆盖 568×320、667×375、844×390、932×430，多点触控、旋转与全屏。已检查菜单、暂停、升级与战斗截图；图片保存在本地 `artifacts/`。

## 修改文件

- [README.md](../README.md)
- [scripts/verify-public.mjs](../scripts/verify-public.mjs)
- [src/game/config.ts](../src/game/config.ts)
- [src/game/entities/Boss.ts](../src/game/entities/Boss.ts)
- [src/game/entities/Enemy.ts](../src/game/entities/Enemy.ts)
- [src/game/scenes/GameScene.ts](../src/game/scenes/GameScene.ts)
- [src/game/scenes/MenuScene.ts](../src/game/scenes/MenuScene.ts)
- [src/game/systems/CombatSystem.ts](../src/game/systems/CombatSystem.ts)
- [src/game/systems/Effects.ts](../src/game/systems/Effects.ts)
- [src/game/systems/MapGenerator.ts](../src/game/systems/MapGenerator.ts)
- [src/game/systems/UpgradeSystem.ts](../src/game/systems/UpgradeSystem.ts)
- [src/game/systems/WaveSystem.ts](../src/game/systems/WaveSystem.ts)
- [src/game/ui/HUD.ts](../src/game/ui/HUD.ts)
- [src/game/ui/TouchControls.ts](../src/game/ui/TouchControls.ts)
- [src/game/ui/controls.css](../src/game/ui/controls.css)
- [src/game/ui/hud.css](../src/game/ui/hud.css)
- [tests/audio.spec.js](../tests/audio.spec.js)
- [tests/campaign.spec.js](../tests/campaign.spec.js)
- [tests/combat-presentation.spec.js](../tests/combat-presentation.spec.js)
- [tests/combo.spec.js](../tests/combo.spec.js)
- [tests/floating-joystick.spec.js](../tests/floating-joystick.spec.js)
- [tests/guard-counter.spec.js](../tests/guard-counter.spec.js)
- [tests/progression.spec.js](../tests/progression.spec.js)
- [tests/theme.spec.js](../tests/theme.spec.js)

## 新增文件

- [src/game/systems/BuildSystem.ts](../src/game/systems/BuildSystem.ts)
- [src/game/systems/ChapterSystem.ts](../src/game/systems/ChapterSystem.ts)
- [src/game/systems/CombatFeedback.ts](../src/game/systems/CombatFeedback.ts)
- [src/game/systems/Preferences.ts](../src/game/systems/Preferences.ts)
- [src/game/systems/ResilienceSystem.ts](../src/game/systems/ResilienceSystem.ts)
- [src/game/systems/RunRecords.ts](../src/game/systems/RunRecords.ts)
- [src/game/systems/TargetingSystem.ts](../src/game/systems/TargetingSystem.ts)
- [tests/build-combat.spec.js](../tests/build-combat.spec.js)
- [tests/builds.spec.js](../tests/builds.spec.js)
- [tests/campaign-depth.spec.js](../tests/campaign-depth.spec.js)
- [tests/records.spec.js](../tests/records.spec.js)
- [tests/run-flow.spec.js](../tests/run-flow.spec.js)
- [tests/targeting-feedback.spec.js](../tests/targeting-feedback.spec.js)
- [tests/ui-depth.spec.js](../tests/ui-depth.spec.js)
- 本交付记录 `docs/optimization-1.0.0.md`。

## 边界

尚未在实体 Android/iOS 手机上验收；未提供局内断点恢复或离线缓存。长局职业强度、终结充能与最终首领时长仍需实际玩家反馈，浏览器模拟测试不能代替真机帧率或完整人工通关体验。
