import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Cryptography Guide

Learn how to use cryptographic functions in your Invoke functions.

## Overview

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import crypto from 'crypto'

export default function handler(req, res) {
  const data = req.body?.data ?? 'Hello World'
  const hash = crypto.createHash('sha256').update(data).digest('hex')
  res.json({ hash })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import crypto from 'crypto'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const data = (req.body as any)?.data ?? 'Hello World'
  const hash = crypto.createHash('sha256').update(data).digest('hex')
  res.json({ hash })
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
        var data = req.Body?["data"]?.GetValue<string>() ?? "Hello World";
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(data))).ToLower();
        res.Status(200).Json(new JsonObject { ["hash"] = hash });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## Hashing

### SHA-256 Hash

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import crypto from 'crypto'

export default function handler(req, res) {
  const data = req.body.data || 'Hello World'
  const hash = crypto.createHash('sha256').update(data).digest('hex')
  res.json({ hash })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import crypto from 'crypto'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const data = (req.body as { data?: string }).data ?? 'Hello World'
  const hash = crypto.createHash('sha256').update(data).digest('hex')
  res.json({ hash })
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
        var data = req.Body?["data"]?.GetValue<string>() ?? "Hello World";
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(data))).ToLower();
        res.Status(200).Json(new JsonObject { ["hash"] = hash });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

### Multiple Hashing Algorithms

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import crypto from 'crypto'

export default function handler(req, res) {
  const data = req.body.data || 'secret data'

  res.json({
    md5: crypto.createHash('md5').update(data).digest('hex'),
    sha1: crypto.createHash('sha1').update(data).digest('hex'),
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    sha512: crypto.createHash('sha512').update(data).digest('hex')
  })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import crypto from 'crypto'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const data = (req.body as { data?: string }).data ?? 'secret data'

  res.json({
    md5: crypto.createHash('md5').update(data).digest('hex'),
    sha1: crypto.createHash('sha1').update(data).digest('hex'),
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    sha512: crypto.createHash('sha512').update(data).digest('hex')
  })
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
    private static string Hash<T>(string data) where T : HashAlgorithm, new()
    {
        using var alg = new T();
        return Convert.ToHexString(alg.ComputeHash(Encoding.UTF8.GetBytes(data))).ToLower();
    }

    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var data = req.Body?["data"]?.GetValue<string>() ?? "secret data";

        res.Status(200).Json(new JsonObject
        {
            ["md5"]    = Hash<MD5>(data),
            ["sha1"]   = Hash<SHA1>(data),
            ["sha256"] = Hash<SHA256>(data),
            ["sha512"] = Hash<SHA512>(data)
        });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## HMAC (Message Authentication)

### Create HMAC

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import crypto from 'crypto'

export default function handler(req, res) {
  const secret = process.env.HMAC_SECRET || 'my-secret-key'
  const message = req.body.message || 'Hello World'

  const hmac = crypto.createHmac('sha256', secret).update(message).digest('hex')
  res.json({ message, hmac })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import crypto from 'crypto'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const secret = process.env.HMAC_SECRET ?? 'my-secret-key'
  const message = (req.body as { message?: string }).message ?? 'Hello World'

  const hmac = crypto.createHmac('sha256', secret).update(message).digest('hex')
  res.json({ message, hmac })
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
        var secret  = Encoding.UTF8.GetBytes(Environment.GetEnvironmentVariable("HMAC_SECRET") ?? "my-secret-key");
        var message = req.Body?["message"]?.GetValue<string>() ?? "Hello World";

        var hmac = Convert.ToHexString(HMACSHA256.HashData(secret, Encoding.UTF8.GetBytes(message))).ToLower();
        res.Status(200).Json(new JsonObject { ["message"] = message, ["hmac"] = hmac });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

### Verify HMAC

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import crypto from 'crypto'

function verifyHMAC(message, receivedHMAC, secret) {
  const expected = crypto.createHmac('sha256', secret).update(message).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(receivedHMAC), Buffer.from(expected))
}

export default function handler(req, res) {
  const { message, hmac } = req.body
  const secret = process.env.HMAC_SECRET
  res.json({ valid: verifyHMAC(message, hmac, secret) })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import crypto from 'crypto'

function verifyHMAC(message: string, receivedHMAC: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(message).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(receivedHMAC), Buffer.from(expected))
}

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const { message, hmac } = req.body as { message: string; hmac: string }
  const secret = process.env.HMAC_SECRET!
  res.json({ valid: verifyHMAC(message, hmac, secret) })
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
        var message  = req.Body?["message"]?.GetValue<string>() ?? "";
        var received = req.Body?["hmac"]?.GetValue<string>()    ?? "";
        var secret   = Encoding.UTF8.GetBytes(Environment.GetEnvironmentVariable("HMAC_SECRET") ?? "");

        var expected = Convert.ToHexString(HMACSHA256.HashData(secret, Encoding.UTF8.GetBytes(message))).ToLower();

        var valid = CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(received),
            Encoding.UTF8.GetBytes(expected));

        res.Status(200).Json(new JsonObject { ["valid"] = valid });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## Symmetric Encryption (AES)

### Encrypt Data

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import crypto from 'crypto'

function encrypt(text, password) {
  const key = crypto.pbkdf2Sync(password, 'salt', 100000, 32, 'sha256')
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return { encrypted, iv: iv.toString('hex') }
}

export default function handler(req, res) {
  const { text, password } = req.body
  res.json(encrypt(text, password))
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import crypto from 'crypto'

function encrypt(text: string, password: string) {
  const key = crypto.pbkdf2Sync(password, 'salt', 100000, 32, 'sha256')
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return { encrypted, iv: iv.toString('hex') }
}

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const { text, password } = req.body as { text: string; password: string }
  res.json(encrypt(text, password))
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
        var text     = req.Body?["text"]?.GetValue<string>()     ?? "";
        var password = req.Body?["password"]?.GetValue<string>() ?? "";

        var salt = Encoding.UTF8.GetBytes("salt");
        var key  = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(password), salt, 100000, HashAlgorithmName.SHA256, 32);

        using var aes = Aes.Create();
        aes.Key = key;
        aes.GenerateIV();

        using var encryptor = aes.CreateEncryptor();
        var plainBytes = Encoding.UTF8.GetBytes(text);
        var cipherBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);

        res.Status(200).Json(new JsonObject
        {
            ["encrypted"] = Convert.ToHexString(cipherBytes).ToLower(),
            ["iv"]        = Convert.ToHexString(aes.IV).ToLower()
        });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

### Decrypt Data

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import crypto from 'crypto'

function decrypt(encrypted, password, ivHex) {
  const key = crypto.pbkdf2Sync(password, 'salt', 100000, 32, 'sha256')
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export default function handler(req, res) {
  const { encrypted, password, iv } = req.body
  res.json({ decrypted: decrypt(encrypted, password, iv) })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import crypto from 'crypto'

function decrypt(encrypted: string, password: string, ivHex: string): string {
  const key = crypto.pbkdf2Sync(password, 'salt', 100000, 32, 'sha256')
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8')
}

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const { encrypted, password, iv } = req.body as { encrypted: string; password: string; iv: string }
  res.json({ decrypted: decrypt(encrypted, password, iv) })
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
        var encrypted = req.Body?["encrypted"]?.GetValue<string>() ?? "";
        var password  = req.Body?["password"]?.GetValue<string>()  ?? "";
        var ivHex     = req.Body?["iv"]?.GetValue<string>()        ?? "";

        var salt = Encoding.UTF8.GetBytes("salt");
        var key  = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(password), salt, 100000, HashAlgorithmName.SHA256, 32);
        var iv   = Convert.FromHexString(ivHex);

        using var aes = Aes.Create();
        aes.Key = key; aes.IV = iv;

        using var decryptor = aes.CreateDecryptor();
        var cipherBytes = Convert.FromHexString(encrypted);
        var plainBytes  = decryptor.TransformFinalBlock(cipherBytes, 0, cipherBytes.Length);

        res.Status(200).Json(new JsonObject { ["decrypted"] = Encoding.UTF8.GetString(plainBytes) });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## Asymmetric Encryption (RSA)

### Generate Key Pair

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import crypto from 'crypto'

export default function handler(req, res) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })
  res.json({ publicKey, privateKey })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import crypto from 'crypto'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })
  res.json({ publicKey, privateKey })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Security.Cryptography;
using System.Text.Json.Nodes;

public static class Function
{
    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        using var rsa = RSA.Create(2048);

        res.Status(200).Json(new JsonObject
        {
            ["publicKey"]  = rsa.ExportSubjectPublicKeyInfoPem(),
            ["privateKey"] = rsa.ExportPkcs8PrivateKeyPem()
        });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

### Encrypt / Decrypt with RSA

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import crypto from 'crypto'

export default function handler(req, res) {
  const { action, data, publicKey, privateKey } = req.body

  if (action === 'encrypt') {
    const encrypted = crypto.publicEncrypt(publicKey, Buffer.from(data))
    return res.json({ encrypted: encrypted.toString('base64') })
  }

  if (action === 'decrypt') {
    const decrypted = crypto.privateDecrypt(privateKey, Buffer.from(data, 'base64'))
    return res.json({ decrypted: decrypted.toString() })
  }

  res.status(400).json({ error: 'Unknown action' })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import crypto from 'crypto'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const { action, data, publicKey, privateKey } = req.body as {
    action: string
    data: string
    publicKey?: string
    privateKey?: string
  }

  if (action === 'encrypt') {
    const encrypted = crypto.publicEncrypt(publicKey!, Buffer.from(data))
    return res.json({ encrypted: encrypted.toString('base64') })
  }

  if (action === 'decrypt') {
    const decrypted = crypto.privateDecrypt(privateKey!, Buffer.from(data, 'base64'))
    return res.json({ decrypted: decrypted.toString() })
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
        var action     = req.Body?["action"]?.GetValue<string>()     ?? "";
        var data       = req.Body?["data"]?.GetValue<string>()       ?? "";
        var publicKey  = req.Body?["publicKey"]?.GetValue<string>()  ?? "";
        var privateKey = req.Body?["privateKey"]?.GetValue<string>() ?? "";

        if (action == "encrypt")
        {
            using var rsa = RSA.Create();
            rsa.ImportFromPem(publicKey);
            var encrypted = rsa.Encrypt(Encoding.UTF8.GetBytes(data), RSAEncryptionPadding.OaepSHA256);
            res.Status(200).Json(new JsonObject { ["encrypted"] = Convert.ToBase64String(encrypted) });
            return Task.CompletedTask;
        }

        if (action == "decrypt")
        {
            using var rsa = RSA.Create();
            rsa.ImportFromPem(privateKey);
            var decrypted = rsa.Decrypt(Convert.FromBase64String(data), RSAEncryptionPadding.OaepSHA256);
            res.Status(200).Json(new JsonObject { ["decrypted"] = Encoding.UTF8.GetString(decrypted) });
            return Task.CompletedTask;
        }

        res.Status(400).Json(new JsonObject { ["error"] = "Unknown action" });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## Digital Signatures

### Sign and Verify

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import crypto from 'crypto'

export default function handler(req, res) {
  const { action, data, privateKey, publicKey, signature } = req.body

  if (action === 'sign') {
    const sig = crypto.sign('sha256', Buffer.from(data), privateKey)
    return res.json({ signature: sig.toString('base64') })
  }

  if (action === 'verify') {
    const valid = crypto.verify('sha256', Buffer.from(data), publicKey, Buffer.from(signature, 'base64'))
    return res.json({ valid })
  }

  res.status(400).json({ error: 'Unknown action' })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import crypto from 'crypto'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const { action, data, privateKey, publicKey, signature } = req.body as {
    action: string
    data: string
    privateKey?: string
    publicKey?: string
    signature?: string
  }

  if (action === 'sign') {
    const sig = crypto.sign('sha256', Buffer.from(data), privateKey!)
    return res.json({ signature: sig.toString('base64') })
  }

  if (action === 'verify') {
    const valid = crypto.verify('sha256', Buffer.from(data), publicKey!, Buffer.from(signature!, 'base64'))
    return res.json({ valid })
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
        var action    = req.Body?["action"]?.GetValue<string>()    ?? "";
        var data      = req.Body?["data"]?.GetValue<string>()      ?? "";
        var keyPem    = req.Body?["privateKey"]?.GetValue<string>()
                     ?? req.Body?["publicKey"]?.GetValue<string>() ?? "";
        var sigBase64 = req.Body?["signature"]?.GetValue<string>() ?? "";

        if (action == "sign")
        {
            using var rsa = RSA.Create();
            rsa.ImportFromPem(keyPem);
            var sig = rsa.SignData(Encoding.UTF8.GetBytes(data), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            res.Status(200).Json(new JsonObject { ["signature"] = Convert.ToBase64String(sig) });
            return Task.CompletedTask;
        }

        if (action == "verify")
        {
            using var rsa = RSA.Create();
            rsa.ImportFromPem(keyPem);
            var valid = rsa.VerifyData(
                Encoding.UTF8.GetBytes(data),
                Convert.FromBase64String(sigBase64),
                HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            res.Status(200).Json(new JsonObject { ["valid"] = valid });
            return Task.CompletedTask;
        }

        res.Status(400).Json(new JsonObject { ["error"] = "Unknown action" });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

## Random Data Generation

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
import crypto from 'crypto'

export default function handler(req, res) {
  const bytes = crypto.randomBytes(32).toString('hex')
  const uuid = crypto.randomUUID()
  const randomInt = crypto.randomInt(1, 100)

  res.json({ bytes, uuid, randomInt })
}
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
import crypto from 'crypto'

export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const bytes = crypto.randomBytes(32).toString('hex')
  const uuid = crypto.randomUUID()
  const randomInt = crypto.randomInt(1, 100)

  res.json({ bytes, uuid, randomInt })
}
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
using Invoke;
using System.Security.Cryptography;
using System.Text.Json.Nodes;

public static class Function
{
    [EntryPoint]
    public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var bytes     = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLower();
        var uuid      = Guid.NewGuid().ToString();
        var randomInt = RandomNumberGenerator.GetInt32(1, 100);

        res.Status(200).Json(new JsonObject
        {
            ["bytes"]     = bytes,
            ["uuid"]      = uuid,
            ["randomInt"] = randomInt
        });
        return Task.CompletedTask;
    }
}
```

  </TabItem>
</Tabs>

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

function verifyPassword(password, salt, storedHash) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  return hash === storedHash
}

export default async function handler(req, res) {
  const { action, password } = req.body

  if (action === 'register') {
    const { salt, hash } = hashPassword(password)
    await kv.set('user:password', { salt, hash })
    return res.json({ success: true })
  }

  if (action === 'login') {
    const stored = await kv.get('user:password')
    const authenticated = verifyPassword(password, stored.salt, stored.hash)
    return res.json({ authenticated })
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

function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  return hash === storedHash
}

export default async function handler(req: InvokeRequest, res: InvokeResponse) {
  const { action, password } = req.body as { action: string; password: string }

  if (action === 'register') {
    const { salt, hash } = hashPassword(password)
    await kv.set('user:password', { salt, hash })
    return res.json({ success: true })
  }

  if (action === 'login') {
    const stored = (await kv.get('user:password')) as { salt: string; hash: string }
    const authenticated = verifyPassword(password, stored.salt, stored.hash)
    return res.json({ authenticated })
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
    public static async Task EntryPoint(InvokeRequest req, InvokeResponse res)
    {
        var kv       = new KeyValueStore();
        var action   = req.Body?["action"]?.GetValue<string>()   ?? "";
        var password = req.Body?["password"]?.GetValue<string>() ?? "";

        if (action == "register")
        {
            var salt     = RandomNumberGenerator.GetBytes(16);
            var saltHex  = Convert.ToHexString(salt).ToLower();
            var hash     = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(password), salt, 100000, HashAlgorithmName.SHA512, 64);
            var hashHex  = Convert.ToHexString(hash).ToLower();
            await kv.Set("user:password", new JsonObject { ["salt"] = saltHex, ["hash"] = hashHex });
            res.Status(200).Json(new JsonObject { ["success"] = true });
            return;
        }

        if (action == "login")
        {
            var stored  = await kv.Get("user:password") as JsonObject;
            var saltHex = stored?["salt"]?.GetValue<string>() ?? "";
            var hashHex = stored?["hash"]?.GetValue<string>() ?? "";
            var actual  = Rfc2898DeriveBytes.Pbkdf2(
                Encoding.UTF8.GetBytes(password),
                Convert.FromHexString(saltHex),
                100000, HashAlgorithmName.SHA512, 64);
            var authenticated = CryptographicOperations.FixedTimeEquals(
                actual, Convert.FromHexString(hashHex));
            res.Status(200).Json(new JsonObject { ["authenticated"] = authenticated });
            return;
        }

        res.Status(400).Json(new JsonObject { ["error"] = "Unknown action" });
    }
}
```

  </TabItem>
</Tabs>

## Best Practices

### 1. Use Strong Keys

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
// ❌ Weak
const key = 'password123'

// ✅ Strong
const key = crypto.randomBytes(32)
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
// ✅ Strong
const key = crypto.randomBytes(32)
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
// ✅ Strong
var key = RandomNumberGenerator.GetBytes(32);
```

  </TabItem>
</Tabs>

### 2. Store Secrets Securely

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
// ❌ Don't hardcode
const apiKey = 'hardcoded-secret'

// ✅ Use environment variables
const apiKey = process.env.API_KEY
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
// ✅ Use environment variables
const apiKey = process.env.API_KEY
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
// ✅ Use environment variables
var apiKey = Environment.GetEnvironmentVariable("API_KEY");
```

  </TabItem>
</Tabs>

### 3. Use Timing-Safe Comparisons

<Tabs groupId="language">
  <TabItem value="js" label="JavaScript">

```javascript
// ❌ Vulnerable to timing attacks
if (receivedToken === expectedToken) { ... }

// ✅ Timing-safe
const isEqual = crypto.timingSafeEqual(
  Buffer.from(receivedToken), Buffer.from(expectedToken))
```

  </TabItem>
  <TabItem value="ts" label="TypeScript">

```typescript
// ✅ Timing-safe
const isEqual = crypto.timingSafeEqual(Buffer.from(receivedToken), Buffer.from(expectedToken))
```

  </TabItem>
  <TabItem value="csharp" label="C#">

```csharp
// ✅ Timing-safe
var isEqual = CryptographicOperations.FixedTimeEquals(
    Encoding.UTF8.GetBytes(receivedToken),
    Encoding.UTF8.GetBytes(expectedToken));
```

  </TabItem>
</Tabs>

## Next Steps

- [Environment Variables](/docs/guides/environment-vars) - Secure secret storage
- [Examples](/docs/examples/crypto-hashing) - Crypto examples
