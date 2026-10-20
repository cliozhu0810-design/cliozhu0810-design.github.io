# Tomespot

网站已发布：[打开停车场地图](https://muko-tomespot.pages.dev/)。

Cloudflare Pages 免费托管地图、四语言界面和停车详情页；GitHub 保存源码，Supabase Free 提供评论、私有照片存储和审核接口。

管理员入口：[留言管理](https://muko-tomespot.pages.dev/admin.html)。管理员账号由网站所有者单独创建。

[免费方案使用说明](FREE-SETUP.md) 用于维护和重建。当前数据库已初始化，不要重复执行初始化 SQL。

推送 main 分支会运行测试并重新发布网页；后台接口的修改还需部署到 Supabase。

Cloudflare Pages 项目：`muko-tomespot`；构建命令：`npm run build`；输出目录：`dist`。构建变量：`NODE_VERSION=24`、`TOMESPOT_SITE_URL=https://muko-tomespot.pages.dev`。Supabase 的 `FRONTEND_ORIGIN` 已同步为新网址。GitHub Pages 仍保留地图副本。

本地检查：Node.js 24，运行 `npm test`。免费服务受配额和项目暂停规则限制。
