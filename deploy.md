# QWIK POS deployment checklist

This repository deploys two applications:

- `apps/api`: NestJS API, normally on port `4020`.
- `apps/admin`: Angular static files served by Nginx.

The API does not modify the database schema automatically. Migrations must be checked and run as an explicit deployment step.

## 1. Server prerequisites

Install Node.js 20 or newer, pnpm 9, PostgreSQL, Nginx and PM2. Create a dedicated PostgreSQL database and user for the application.

## 2. Install and configure

```bash
git clone <repository-url> /var/www/smoke-pos
cd /var/www/smoke-pos
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
```

Set production database, JWT, storage, mail and CORS values in `apps/api/.env`. Keep this file outside source control and restrict it to the deployment user.

## 3. Back up and migrate

Take a PostgreSQL backup before every migration and verify periodically that backups can be restored to a separate database.

```bash
cd /var/www/smoke-pos
pnpm --filter @smoke-pos/api run migration:show
pnpm --filter @smoke-pos/api run migration:run
pnpm --filter @smoke-pos/api run migration:show
```

After migration, every entry shown by `migration:show` should be marked `[X]`.

## 4. Build

```bash
cd /var/www/smoke-pos
pnpm build:api
pnpm build:admin
```

Expected outputs:

- API: `apps/api/dist/main.js`
- Admin: `apps/admin/dist/admin/browser/`

## 5. Start the API

```bash
cd /var/www/smoke-pos
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Use `pm2 logs qwik-pos-api` to confirm startup. The health check is `GET /v1/health` and should report both `status: ok` and `database: connected`.

## 6. Nginx

Use the actual API and admin hostnames for the client installation.

```nginx
server {
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:4020;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    server_name pos.example.com;
    root /var/www/smoke-pos/apps/admin/dist/admin/browser;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable TLS with the server's certificate automation and allow only required inbound ports.

## 7. Go-live verification

- Confirm `/v1/health` succeeds through Nginx.
- Log in with a non-owner staff account and confirm it cannot access an unassigned branch.
- Create a test sale, confirm the stock deduction, approve a payment and download its receipt.
- Cancel an unpaid test sale and confirm stock is restored once.
- Receive a partial purchase order and confirm quantity and weighted-average cost.
- Run the API and admin test suites.
- Record the deployed commit, migration status and backup location.

The initial administrator seed is for a new installation only:

```bash
pnpm seed:admin
```

Change seeded credentials immediately and do not rerun the seed casually on a configured client installation.
