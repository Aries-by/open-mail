# Deployment Notes

This app is safe to run locally on Windows for development. Before exposing it on a server, use this checklist.

## Required

- Put the app behind HTTPS. Do not expose IMAP authorization codes over plain HTTP.
- Run Node with a process manager such as PM2, systemd, or a container runtime.
- Keep the app bound to a private port, for example `4399`, and expose it through Nginx/Caddy reverse proxy.
- Restrict firewall access to the public HTTP/HTTPS ports only.
- Use QQ/163 IMAP authorization codes, not mailbox web passwords.

## Reverse Proxy Headers

The server disables `X-Powered-By` and sends basic browser hardening headers. A reverse proxy should also set:

```nginx
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
```

## Sessions

Sessions are stored in process memory and expire after 6 hours of inactivity. Restarting the server logs users out. For multi-instance deployment, move sessions to Redis or another shared store.

## Login Protection

The login API is rate-limited in-process. For public deployment, keep the app behind a reverse proxy with IP-based rate limiting as a second layer.
