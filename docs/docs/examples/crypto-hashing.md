import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Cryptographic Hashing Example

Secure password hashing, data integrity, and verification.

## Password Hashing

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import crypto from 'crypto'

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  return { salt, hash }
}

function verifyPassword(password, salt, hash) {
  const testHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  return testHash === hash
}

export default async function handler(req, res) {
  const { action, password, salt, hash } = req.body

  if (action === 'hash') {
    if (!password) return res.status(400).json({ error: 'Password required' })
    const result = hashPassword(password)
    return res.json({ success: true, salt: result.salt, hash: result.hash })
  }

  if (action === 'verify') {
    if (!password || !salt || !hash) return res.status(400).json({ error: 'password, salt and hash required' })
    return res.json({ success: true, valid: verifyPassword(password, salt, hash) })
  }

  res.status(400).json({ error: 'Unknown action' })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import crypto from 'crypto'

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  return { salt, hash }
}

function verifyPassword(password: string, salt: string, hash: string) {
  const testHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  return testHash === hash
}

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const body = req.body as { action: string; password?: string; salt?: string; hash?: string }
  const { action, password, salt, hash } = body

  if (action === 'hash') {
    if (!password) return res.status(400).json({ error: 'Password required' })
    const result = hashPassword(password)
    return res.json({ success: true, salt: result.salt, hash: result.hash })
  }

  if (action === 'verify') {
    if (!password || !salt || !hash) return res.status(400).json({ error: 'password, salt and hash required' })
    return res.json({ success: true, valid: verifyPassword(password, salt, hash) })
  }

  res.status(400).json({ error: 'Unknown action' })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

public static class Function
{
    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var action   = req.Body?["action"]?.GetValue<string>();
        var password = req.Body?["password"]?.GetValue<string>();

        if (action == "hash")
        {
            if (string.IsNullOrEmpty(password))
            {
                res.Status(400).Json(new JsonObject { ["error"] = "Password required" });
                return Task.CompletedTask;
            }

            var salt = RandomNumberGenerator.GetBytes(16);
            var saltHex = Convert.ToHexString(salt).ToLower();
            var hash = Rfc2898DeriveBytes.Pbkdf2(
                Encoding.UTF8.GetBytes(password), salt,
                100000, HashAlgorithmName.SHA512, 64);
            var hashHex = Convert.ToHexString(hash).ToLower();

            res.Status(200).Json(new JsonObject { ["success"] = true, ["salt"] = saltHex, ["hash"] = hashHex });
            return Task.CompletedTask;
        }

        if (action == "verify")
        {
            var saltHex = req.Body?["salt"]?.GetValue<string>();
            var hashHex = req.Body?["hash"]?.GetValue<string>();

            if (string.IsNullOrEmpty(password) || string.IsNullOrEmpty(saltHex) || string.IsNullOrEmpty(hashHex))
            {
                res.Status(400).Json(new JsonObject { ["error"] = "password, salt and hash required" });
                return Task.CompletedTask;
            }

            var salt = Convert.FromHexString(saltHex);
            var expected = Convert.FromHexString(hashHex);
            var actual = Rfc2898DeriveBytes.Pbkdf2(
                Encoding.UTF8.GetBytes(password), salt,
                100000, HashAlgorithmName.SHA512, 64);

            res.Status(200).Json(new JsonObject
            {
                ["success"] = true,
                ["valid"] = CryptographicOperations.FixedTimeEquals(actual, expected)
            });
            return Task.CompletedTask;
        }

        res.Status(400).Json(new JsonObject { ["error"] = "Unknown action" });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>
