# Local Git Hooks

Install repository-managed hooks once:

```bash
npm run hooks:install
```

Verify active hooks path:

```bash
npm run hooks:status
```

Current hooks:

- `pre-push`: runs `npm run gate:local:strict`
