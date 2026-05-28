# Open Mail

Open Mail 是一个基于 IMAP 的轻量级网页邮箱服务，当前主要支持 QQ 邮箱和 163 邮箱。它会把“收件箱”和“垃圾箱”合并到一个统一收件列表里，界面风格偏 Gmail / OpenAI，适合在本地电脑或自己的 Ubuntu 服务器上私有部署使用。

## 项目情况

- 当前服务端口：`4399`。
- 默认访问地址：`http://127.0.0.1:4399`。
- 技术栈：Node.js、Express、ImapFlow、MailParser、原生 HTML/CSS/JavaScript。
- 当前是单机版服务，登录会话存放在 Node.js 进程内存里。
- 邮箱登录使用 QQ/163 的 IMAP 授权码，不使用网页登录密码。
- 适合个人或小范围私有使用；如果多人公开使用，建议后续把会话迁移到 Redis，并补充更完整的账号隔离、审计和反滥用策略。

## 已有功能

- QQ 邮箱和 163 邮箱 IMAP 登录。
- 收件箱和垃圾箱合并展示，普通邮件显示绿色圆点，垃圾邮件显示红色圆点。
- 登录后刷新页面保持当前登录状态，支持 `/mail` 和邮件阅读页直接刷新。
- 邮件列表分页、跳转页码、每页数量选择。
- 首页自动刷新新邮件：默认 10 秒倒计时，只在浏览器标签页可见、当前为第一页、没有搜索条件时执行。
- 邮件详情页保留原邮件 HTML 布局，并支持返回列表。
- 支持单封删除、多选批量删除、失败反馈和删除后分页修正。
- 支持快捷键多选：范围选择、上下移动焦点、空格勾选、回车打开、Delete 删除。
- 集成微软翻译接口，可把邮件内容按段落翻译成简体中文，并尽量保留原邮件排版。
- 使用 HttpOnly Cookie 保存会话标识，前端不保存邮箱授权码。
- 内置基础安全响应头和登录限速。

## 快捷键

- `Shift + 点击`：范围选择邮件。
- `j` / `k`：上下移动焦点。
- `ArrowDown` / `ArrowUp`：上下移动焦点。
- `Shift + ArrowDown` / `Shift + ArrowUp`：扩大选择范围。
- `Space`：勾选或取消勾选当前焦点邮件。
- `Enter`：打开当前焦点邮件。
- `Delete` / `Backspace`：删除已选择邮件。

## 本地运行

先安装 Node.js，建议使用 Node.js 20 或更高版本。

```bash
npm install
npm start
```

浏览器打开：

```text
http://127.0.0.1:4399
```

开发模式可以使用：

```bash
npm run dev
```

## 邮箱准备

使用前需要在邮箱官方后台开启 IMAP，并生成授权码。

- QQ 邮箱：设置里开启 IMAP/SMTP 服务，生成授权码。
- 163 邮箱：设置里开启 IMAP/SMTP 服务，生成客户端授权码。
- 登录本项目时填写的是“邮箱地址 + 授权码”，不是网页邮箱密码。

## 配置项

可以通过环境变量修改监听地址和端口。

```bash
HOST=127.0.0.1 PORT=4399 npm start
```

本地运行建议保持 `HOST=127.0.0.1`。如果部署到服务器，也建议 Node.js 仍然只监听 `127.0.0.1:4399`，再由 Nginx 或 Caddy 对外提供 HTTPS。

## Ubuntu 部署

推荐部署方式：Ubuntu + Node.js + PM2 + Nginx + HTTPS。

简化流程：

```bash
git clone https://github.com/Aries-by/open-mail.git
cd open-mail
npm install --omit=dev
npm install -g pm2
HOST=127.0.0.1 PORT=4399 pm2 start server.js --name open-mail
pm2 save
pm2 startup
```

然后使用 Nginx 反向代理到：

```text
http://127.0.0.1:4399
```

更完整的服务器部署、Nginx 配置、HTTPS 和防火墙说明见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 注意事项

- 不要在公网裸奔 HTTP 登录邮箱授权码，正式部署必须使用 HTTPS。
- 当前会话保存在进程内存里，重启服务后用户需要重新登录。
- 当前更适合单机单实例部署；多实例部署需要 Redis 等共享会话存储。
- 翻译功能会把需要翻译的邮件文本发送到微软翻译接口。
- 邮件原文里的远程图片可能会访问发件方服务器，隐私敏感场景建议后续增加图片代理或默认禁用远程图片。
- 删除邮件是真实 IMAP 删除行为，使用前建议先用测试邮箱确认效果。

## 开源地址

[https://github.com/Aries-by/open-mail](https://github.com/Aries-by/open-mail)

## License

MIT
