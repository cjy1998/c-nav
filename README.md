```txt
npm install
npm run dev
```

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>();
```

## Database Management

Common commands for managing the D1 database with Drizzle ORM:

- `npm run db:generate`: Generate SQL migration files based on schema changes.
- `npm run db:migrate:local`: Apply migrations to the local D1 database.
- `npm run db:migrate:remote`: Apply migrations to the remote Cloudflare D1 database.
