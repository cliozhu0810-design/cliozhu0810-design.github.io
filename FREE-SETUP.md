# Tomespot 免费方案：GitHub Pages + Supabase Free

这是当前推荐的迁移方案。**不需要开通 Cloudflare R2，也不使用 Cloudflare Access、Workers 或 D1。**
已准备的代码和本地测试不代表网站已经上线；还需要你自己的 Supabase 项目和 GitHub 仓库。

## 保留哪些功能

- 原地图、筛选、收藏、四语言，以及当前停车数据和 1,433 个详情页。
- 匿名文字留言和照片上传；最多三张照片，客户端压缩后每张不超过 2 MB。
- 管理员审核，审核通过才公开；驳回后文字和照片重新隐藏。
- 管理员内部备注、提交频率限制。

GitHub Pages 托管静态网页和管理页，Supabase 托管数据库、私有照片和一个 Edge Function。
后台代码中的服务密钥只存在于 Supabase，不得填进 GitHub 网页变量。

## 1. 创建免费账户和项目

1. 打开 https://supabase.com/dashboard/sign-up 。可以用邮箱注册，或使用个人 GitHub 登录。
2. 创建组织时选择 **Free**。
3. 创建项目，名称建议 `tomespot`，区域选择接近日本访问者的区域。
4. 数据库密码自行生成并保存在密码管理器中，不要发送到聊天或提交到 GitHub。
5. 等待项目创建完成。不要升级 Pro，也不要选付费附加功能。

免费额度有上限，当前官方价格页列出数据库 500 MB、文件存储 1 GB。项目一周不活跃后可能暂停，需要恢复后才能继续使用后台。
https://supabase.com/pricing

## 2. 初始化数据库和私有照片桶

在新项目的 **SQL Editor** 中执行 `supabase/schema.sql`。
它创建评论表、限流表、原子限流函数和私有 `tomespot-photos` 存储桶。
这个 SQL 仅用于新项目，不要在已经初始化的项目里反复执行。

浏览器的匿名角色和已登录角色都不能直接读写评论表，也不能直接读取私有照片。
访问必须经过 Edge Function 的审核和权限检查。不要给照片桶开启 Public，也不要给评论表新增公开读写策略。

## 3. 设置网站管理员

在 **Authentication → Users** 中添加网站管理员用户。管理员邮箱应为你自己的邮箱。
邮箱和密码是网站管理页使用的账号，**不是 Supabase 控制台的登录凭据**。
按控制台流程完成邮件确认或设置密码。密码由你自己输入和保管。
如果不需要访客注册，可在 Auth 设置中关闭新用户注册；访客评论仍是匿名投稿。

## 4. 配置并部署 Edge Function

项目 → **Edge Functions → Secrets**，设置：

| 名称 | 内容 |
|---|---|
| `ADMIN_EMAIL` | 上一步创建并确认的管理员邮箱 |
| `FRONTEND_ORIGIN` | `https://cliozhu0810-design.github.io` |
| `COMMENT_HASH_SALT` | 密码管理器生成的长随机字符串，不公开 |

Supabase 通常已提供 `SUPABASE_URL`、`SUPABASE_ANON_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY` 这三个保留环境变量。服务密钥不能复制进网页。

部署方式：

1. **Edge Functions → Deploy a new function → Via Editor**。
2. 函数名使用 **tomespot**。
3. 将 `supabase/functions/tomespot/index.ts` 的完整内容放入编辑器，部署。
4. 关闭该函数网关层的 **Verify JWT / Enforce JWT verification**，因为访客投稿无需登录。`supabase/config.toml` 已声明 `verify_jwt = false`。
5. 管理接口仍在函数内部调用 Supabase Auth 校验登录令牌和管理员邮箱；不要删除这层校验。

如果使用 CLI，也可执行：

```powershell
npx supabase login
npx supabase link --project-ref 你的项目ID
npx supabase functions deploy tomespot --no-verify-jwt
```

函数地址格式：`https://你的项目ID.supabase.co/functions/v1/tomespot`。
匿名测试可请求该地址后接 `/api/comments?facility=一个有效停车场ID`，应返回空评论列表。
不带管理员令牌请求 `/api/admin/session` 应返回 403。

## 5. 创建 GitHub 仓库并开启 Pages

用个人账户 **cliozhu0810-design** 创建公开仓库：
**cliozhu0810-design.github.io**。

把本文件夹源码上传到仓库根目录，保留 `.github/workflows/pages.yml`。
源码包含很多详情页，建议通过 Git 提交，不要依赖网页一次拖入数千个文件。

在这个目录中执行（需要 Git）：

```powershell
git init -b main
git add .
git commit -m "Prepare Tomespot with free Supabase backend"
git remote add origin https://github.com/cliozhu0810-design/cliozhu0810-design.github.io.git
git push -u origin main
```

Git 提示登录时选择个人 GitHub 账户；如果需要配置提交姓名和邮箱，仅为当前仓库设置，不修改公司项目的全局配置。

仓库 → **Settings → Secrets and variables → Actions → Variables**，创建两个公开变量：

| 名称 | 内容 |
|---|---|
| `TOMESPOT_API_URL` | 完整函数地址，含 `/functions/v1/tomespot` |
| `TOMESPOT_SUPABASE_KEY` | 项目 API Keys 页的 **publishable key**，或旧版 **anon key** |

**禁止填入 `service_role` 或 `sb_secret_` 服务密钥。** 构建脚本会拒绝已识别的服务密钥。

仓库 → **Settings → Pages → Source** 选择 **GitHub Actions**。
在 **Actions → Publish Tomespot** 手动运行一次，之后每次推送 main 都会重新测试和发布网页。

最终网站：`https://cliozhu0810-design.github.io/`。
管理页：`https://cliozhu0810-design.github.io/admin.html`。

## 6. 验收

本地使用 Node.js 24，不需要安装原 Vinext 项目的依赖：

```powershell
node --test scripts/migration.test.mjs scripts/supabase.test.mjs
node scripts/build.mjs --backend-only
```

设置了两个公开变量后，可运行完整静态构建 `node scripts/build.mjs`。

上线后仍需真实验证：

1. 地图、语言、车型筛选及一个停车场详情链接正常。
2. 匿名提交留言和照片，未审核时访客看不到。
3. 管理员登录后能够查看待审照片、填写内部备注并审核通过。
4. 未登录浏览器能看到已审核内容，看不到内部备注。
5. 取消公开后，访客无法再读取留言和照片。

管理员登录令牌只保存在当前标签页会话中；到期后重新登录，退出会清除令牌。
原站没有留言和用户照片，所以新数据库为空。旧域名浏览器内的收藏不会自动转移。

## 维护和免费限制

- 不自动升级套餐；达到免费额度可能受限或需要自行处理。
- 照片每张上限 2 MB，整个私有存储桶受账户免费额度约束。
- 每个来源每小时最多五次投稿，另有全站每小时 1,000 次投稿上限。来源判断依赖平台转发的地址，不能作为强身份验证；全站上限仍有效。
- 长期无人使用时 Supabase 可能暂停，恢复项目后需再检查网站后台。
- 免费方案不含正式生产服务的可用性保证和完整自动备份，应按需自行导出数据。
- 网页推送到 GitHub 会更新 Pages；接口代码修改后还需重新部署 Supabase 函数。
- 原 Cloudflare 适配文件保留为参考，默认构建已改为 Supabase；不需要按旧方案开通任何服务。
- 详情页是当前数据快照；未来更新停车数据时应同时更新对应目录和详情页。

官方参考：
- https://supabase.com/pricing
- https://supabase.com/docs/guides/functions/quickstart-dashboard
- https://supabase.com/docs/guides/storage/security/access-control
- https://docs.github.com/zh/pages/quickstart
