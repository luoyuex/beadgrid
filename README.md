# 豆格 · BeadGrid

**把创意，变成拼豆图纸。**

Image-to-pattern bead studio with editing, exports, and duration-based membership.

豆格是一款开源拼豆创作工作台：上传图片、匹配品牌色板、精细编辑像素，导出图纸与采购清单。界面采用黑白灰配色，适配桌面和手机；拼豆作品与真实色板保留原色。

## 功能

- 图片像素化、多品牌色号映射、杂色合并与背景移除。
- 自定义色板、颜色替换、像素手动编辑、撤回及专心拼豆模式。
- PNG 图纸、采购清单和可选 CSV 导出。
- 邮箱注册、验证、登录与密码找回。
- 兑换码开通按天会员、到期时间、续期记录及历史成品下载。
- 管理后台生成兑换码、封禁、调整会员有效期、审计和超时导出恢复。

预览和编辑免费；正式导出需要有效会员，有效期内不限导出，不按次数扣费。兑换码配置会员天数（如 7、30、90 天）；未到期时顺延，到期后从兑换时间重新起算。每一天按连续 24 小时计算，不接在线支付。

## 开发与部署

GitHub 仓库建议命名为 `beadgrid`。上传到自己的账号后，使用实际仓库地址克隆：

```sh
git clone https://github.com/luoyuex/beadgrid.git
cd beadgrid
npm install --ignore-scripts
```

参考 [会员功能与部署说明](docs/MEMBERSHIP.md)，复制 `.env.example` 并配置 PostgreSQL、邮件服务、认证密钥以及兼容 S3 的私有对象存储。

数据库准备与启动开发服务需要部署者明确执行：

```sh
npm run db:generate
npm run db:deploy
npm run dev
```

默认开发地址为 `http://localhost:3000`。已有服务应继续复用，避免重复启动。

上线前，设置 `NEXT_PUBLIC_SOURCE_URL` 为当前部署版本的完整对应源码地址。

## 技术栈

| 部分 | 技术 |
| --- | --- |
| 网站 | Next.js、React、TypeScript |
| 样式 | Tailwind CSS、统一黑白灰主题 |
| 预览与编辑 | 浏览器 Canvas |
| 服务端成品生成 | @napi-rs/canvas |
| 账号 | Better Auth |
| 数据库 | PostgreSQL、Prisma |
| 文件存储 | 私有 S3 兼容对象存储、短期签名下载 |

## 验证

```sh
npm run test:membership
```

该命令直接执行 JavaScript 测试，覆盖会员有效期、兑换与续期、并发兑换、到期权限、导出幂等、失败恢复及 PNG/CSV 渲染。真实数据库并发测试与页面验收步骤见部署说明。构建、编译和类型检查不作为默认验证步骤。

## 上游项目与许可证

豆格基于 [Zippland / perler-beads](https://github.com/Zippland/perler-beads) 二次开发，感谢原作者及贡献者提供图像处理算法、色板数据和编辑器基础。

原项目由 Zippland 维护，并提供 [免费在线工具](https://perlerbeadsold.zippland.com)。豆格是独立命名的衍生项目，源码位于 [luoyuex / beadgrid](https://github.com/luoyuex/beadgrid)。

本项目沿用 [AGPL-3.0](LICENSE)，保留上游版权声明：© [Zippland](https://github.com/Zippland)。修改及部署须遵守许可证，向在线服务用户提供本版本的完整对应源码。
