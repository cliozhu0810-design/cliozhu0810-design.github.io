# Tomespot 免费方案维护说明

- 源码仓库：https://github.com/cliozhu0810-design/muko-tomespot
- 网站：https://muko-tomespot.pages.dev/
- 管理入口：https://muko-tomespot.pages.dev/admin.html
- JuMel Accessory 为独立首饰网站：https://github.com/cliozhu0810-design/jumel-accessory

## 发布网页

修改本仓库 main 分支。GitHub Actions 运行 npm test 和 npm run build；Cloudflare Pages 自动部署网页。

Cloudflare 项目名为 muko-tomespot，构建命令 npm run build，输出目录 dist。构建变量为 NODE_VERSION=24 和 TOMESPOT_SITE_URL=https://muko-tomespot.pages.dev。不需要开通 R2 或付费套餐。

网站介绍和分类入口在 /about。都道府县标签在浏览器内与本地边界数据匹配，边界和海岸附近可能存在误差。边界来源与许可证列在介绍页。

## 评论、照片与审核

Supabase 项目为 ddwiczqwxvsqskmbfeyi。数据库已经初始化，私有图片桶 tomespot-photos 已创建。不要重复执行初始化 SQL，也不要把图片桶改成公开。

接口地址：https://ddwiczqwxvsqskmbfeyi.supabase.co/functions/v1/tomespot

函数环境变量 FRONTEND_ORIGIN 为 https://muko-tomespot.pages.dev，ADMIN_EMAIL 为管理员邮箱，COMMENT_HASH_SALT 为服务器端随机值。Supabase 服务密钥只保存在服务器，不得放入网页或仓库。

访客可匿名投稿，未审核内容不公开。函数网关关闭旧式 JWT 校验，管理员接口仍在函数内部验证 Supabase Auth 身份。管理员密码由网站所有者自行创建和保管，不能发送到聊天或提交到 GitHub。

后台修改需重新部署 supabase/functions/tomespot/index.ts。网页自动发布不会更新后台函数。

## 本地检查

使用 Node.js 24，运行：

    node --test scripts/migration.test.mjs scripts/supabase.test.mjs
    node scripts/build.mjs

deploy-config.json 中的 publishable key 是网页使用的公开配置，不能替换为 secret key 或 service_role key。

## 搜索引擎

网站地图为 https://muko-tomespot.pages.dev/sitemap.xml。首页和详情页使用同一主站网址作为 canonical。Google Search Console 应由个人 Google 账号管理。首页验证标记需要在验证成功后继续保留；网站发布、验证及提交地图并不等于搜索引擎立即收录。

当前服务使用免费方案，适用各服务的免费额度和暂停规则；详情以各服务控制台为准。
