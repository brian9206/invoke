import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# SQL Database

Each Invoke project can have a dedicated **PostgreSQL database** provisioned on demand. Once enabled, the connection is automatically injected into every function invocation — no configuration required.

## Enabling the Database

1. Open the **Admin Panel** and select your project.
2. Go to **SQL Database** in the sidebar.
3. Click **Initialize Database**.

Invoke creates:

- An **admin** user — full DDL + DML (CREATE, ALTER, DROP, INSERT, SELECT…)
- An **app** user — DML only (SELECT, INSERT, UPDATE, DELETE) — this is what your functions use

Your functions always run as the app user.
You can manage your database via the SQL Database console or through a tunnel; both approaches use the admin user.

## Connecting from a Function

No environment variables to set. When the database is initialized, Invoke automatically injects the connection details into the function's runtime environment. The PostgreSQL database connection is exposed via a Unix socket in `/run/postgresql` and `/var/run/postgresql`.

Below is the recommended way to connect to the database. You can always use your preferred framework or library.

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

Import `sql` from `'bun'` — it's pre-configured with the injected `DATABASE_URL`. Use it directly as a tagged template literal, no setup needed.

```javascript
import { sql } from 'bun'

export default async function handler(req, res) {
  const rows = await sql`SELECT NOW() AS time`
  res.json({ time: rows[0].time })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

Import `sql` from `'bun'` — it's pre-configured with the injected `DATABASE_URL`. Use it directly as a tagged template literal, no setup needed.

```typescript
import { sql } from 'bun'

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const rows = await sql`SELECT NOW() AS time`
  res.json({ time: rows[0].time })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

Use **Npgsql** with the connection string provided by `EnvironmentEx.GetConnectionString()`.

First, add Npgsql to your project:

```bash
dotnet add package Npgsql
```

```csharp
using Invoke;
using Npgsql;
using System.Text.Json.Nodes;

public static class Function
{
    [EntryPoint]
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        await using var dataSource = NpgsqlDataSource.Create(EnvironmentEx.GetConnectionString());
        await using var cmd = dataSource.CreateCommand("SELECT NOW() AS time");
        var time = (DateTime)(await cmd.ExecuteScalarAsync())!;

        res.Status(200).Json(new JsonObject { ["time"] = time.ToString("O") });
    }
}
```

  </TabItem>
</Tabs>

## Creating Tables

Run schema migrations from the **SQL Console** in the Admin Panel, or from the CLI tunnel (see [Connecting with CLI](#connecting-with-cli)).

```sql
CREATE TABLE users (
  id    SERIAL PRIMARY KEY,
  name  TEXT        NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Basic Usage

To learn more about interacting with the SQL database, please refer to the following documentation.

- [Bun SQL Usage (JavaScript/TypeScript)](https://bun.com/docs/runtime/sql)
- [Npgsql Basic Usage (C#)](https://www.npgsql.org/doc/basic-usage.html)

## Manage your Database

### CLI Tunnel

Use the CLI to open a secure tunnel to your database for schema management, migrations, or direct inspection:

```bash
invoke sql:connect --project "Default Project"
```

Then connect with `psql` or any PostgreSQL client (e.g. pgAdmin 4, DataGrip):

```bash
psql -h localhost -p 5433
```

:::note
The tunnel forwards to your project's database with **admin** user over the secure WebSocket connection.
:::

### SQL Console

The **Admin Panel → SQL Database → Console** tab lets you run queries directly against your database without leaving the browser. It supports:

- Multi-statement queries
- Session SQL (persistent `SET` commands per connection)
- Query history (last 50 queries)

:::note
SQL Console always connect with **admin** user to your project's database.
:::

## Storage Quota

Each project has a storage quota displayed in the SQL Database page. If you approach the limit, `INSERT`/`UPDATE` queries will return a storage warning and execution will be denied. Contact your administrator to increase the quota or use `DELETE` or `TRUNCATE` to free up storage.
