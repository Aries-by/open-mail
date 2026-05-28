# Open Mail

Open Mail is a lightweight IMAP web mailbox for QQ Mail and 163 Mail. It merges inbox and spam messages into one Gmail-style reading interface, supports pagination, batch deletion, automatic refresh, and Microsoft-powered mail translation to Simplified Chinese.

## Features

- QQ Mail and 163 Mail IMAP login with authorization codes.
- Unified inbox view that merges normal inbox and spam folder messages.
- Gmail-like mail list, reading pane, checkbox batch selection, and keyboard shortcuts.
- Single-message and multi-message deletion.
- Pagination with jump-to-page and configurable page size.
- 10-second auto refresh on the first page when the tab is active.
- Microsoft Edge Translator integration for long email translation while preserving original mail layout.
- HttpOnly cookie sessions and basic browser security headers.

## Keyboard Shortcuts

- `Shift + click`: select a range of messages.
- `j` / `k` or `ArrowDown` / `ArrowUp`: move the focused message.
- `Shift + ArrowDown` / `Shift + ArrowUp`: extend selection.
- `Space`: toggle the focused message checkbox.
- `Enter`: open the focused message.
- `Delete` / `Backspace`: delete selected messages.

## Requirements

- Node.js 20 or newer.
- QQ Mail or 163 Mail with IMAP enabled.
- Mailbox authorization code, not the normal web login password.

## Local Development

```bash
npm install
npm start
```

Open:

```text
http://127.0.0.1:4399
```

By default the service binds to `127.0.0.1` for local safety. Use `HOST=0.0.0.0` only behind a reverse proxy.

## Deployment

For Ubuntu/VPS deployment, use Node.js + PM2 + Nginx + HTTPS. See [DEPLOYMENT.md](./DEPLOYMENT.md).

Example:

```bash
npm install --omit=dev
HOST=127.0.0.1 PORT=4399 pm2 start server.js --name open-mail
```

## Security Notes

- Do not expose this app over plain HTTP when logging in with mailbox authorization codes.
- Sessions are stored in process memory and expire after 6 hours of inactivity.
- Restarting the server logs users out.
- For multi-user or multi-instance deployment, move sessions to Redis or another shared store.
- Translation sends selected email text to Microsoft Translator.
- Remote email images may still load from external senders.

## License

MIT
