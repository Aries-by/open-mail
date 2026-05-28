# Open Mail 部署说明

本文档说明如何把 Open Mail 部署到 Ubuntu 服务器上。推荐架构是：

```text
用户浏览器 -> HTTPS -> Nginx/Caddy -> 127.0.0.1:4399 -> Node.js Open Mail -> QQ/163 IMAP
```

不要把 Node.js 服务直接暴露到公网，尤其不要用明文 HTTP 登录邮箱授权码。

## 服务器要求

- Ubuntu 20.04 / 22.04 / 24.04。
- Node.js 20 或更高版本。
- Nginx 或 Caddy 作为反向代理。
- 一个已经解析到服务器的域名。
- 服务器可以访问 QQ/163 的 IMAP 服务。

## 1. 安装基础环境

```bash
sudo apt update
sudo apt install -y curl git nginx ufw
```

安装 Node.js 20：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

安装 PM2：

```bash
sudo npm install -g pm2
```

## 2. 拉取项目

```bash
cd /opt
sudo git clone https://github.com/Aries-by/open-mail.git
sudo chown -R $USER:$USER /opt/open-mail
cd /opt/open-mail
npm install --omit=dev
```

## 3. 启动服务

建议只监听本机地址，由 Nginx 对外代理。

```bash
HOST=127.0.0.1 PORT=4399 pm2 start server.js --name open-mail
pm2 save
pm2 startup
```

检查运行状态：

```bash
pm2 status
pm2 logs open-mail
curl http://127.0.0.1:4399
```

## 4. 配置 Nginx

把 `mail.example.com` 改成你的真实域名。

```nginx
server {
    listen 80;
    server_name mail.example.com;

    location / {
        proxy_pass http://127.0.0.1:4399;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

保存到：

```text
/etc/nginx/sites-available/open-mail
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/open-mail /etc/nginx/sites-enabled/open-mail
sudo nginx -t
sudo systemctl reload nginx
```

## 5. 配置 HTTPS

推荐使用 Certbot 自动签发 Let's Encrypt 证书。

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d mail.example.com
```

完成后访问：

```text
https://mail.example.com
```

## 6. 防火墙

只开放 SSH、HTTP、HTTPS。`4399` 不需要对公网开放。

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

## 7. 更新项目

```bash
cd /opt/open-mail
git pull
npm install --omit=dev
pm2 restart open-mail
```

## 8. 邮箱配置

登录本项目之前，需要先在邮箱官方后台开启 IMAP，并生成授权码。

- QQ 邮箱：开启 IMAP/SMTP 服务，使用生成的授权码登录。
- 163 邮箱：开启 IMAP/SMTP 服务，使用客户端授权码登录。
- 不要填写网页登录密码。

## 9. 当前限制

- 会话存储在 Node.js 进程内存中，重启服务后需要重新登录。
- 多台服务器或多进程负载均衡时，需要把会话改成 Redis 等共享存储。
- 当前主要针对 QQ 和 163 邮箱调试，其他 IMAP 邮箱需要额外适配。
- 翻译功能会把邮件文本发送到微软翻译接口。
- 邮件原文可能包含远程图片，打开邮件时可能访问发件方图片服务器。

## 10. 安全建议

- 必须使用 HTTPS 后再公网使用。
- 不要把 `HOST` 设置成 `0.0.0.0` 后直接暴露 `4399` 端口。
- 不要把邮箱授权码写进代码、README、截图或日志。
- 服务器只开放 `80`、`443`、`22` 等必要端口。
- 如果准备给多人使用，建议增加账号系统、管理员控制台、操作日志、Redis 会话、删除确认和更严格的登录限速。

## 11. 常见问题

### 访问域名打不开

先检查 Nginx 和 Node.js：

```bash
sudo nginx -t
sudo systemctl status nginx
pm2 status
curl http://127.0.0.1:4399
```

### 登录失败

优先确认：

- 邮箱是否开启 IMAP。
- 是否使用授权码，而不是网页登录密码。
- 服务器是否能访问对应邮箱的 IMAP 服务。

### 重启后需要重新登录

这是当前设计：会话在进程内存里。后续如果要做生产级多人部署，应迁移到 Redis。

### 新邮件不是马上出现

当前前端首页默认 10 秒倒计时刷新一次；阅读页、后台标签页、非第一页或搜索状态下不会自动刷新，避免打扰阅读和浪费请求。
