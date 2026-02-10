# tls

The `tls` module provides an implementation of the Transport Layer Security (TLS) and Secure Socket Layer (SSL) protocols built on top of OpenSSL. Use it for secure network communication.

## Import

```javascript
const tls = require('tls');
```

## API Reference

### tls.connect(options[, callback])
### tls.connect(port[, host][, options][, callback])

Creates a new TLS/SSL connection.

**Returns:** `tls.TLSSocket` instance

### tls.createServer([options][, secureConnectionListener])

Creates a new TLS server.

**Returns:** `tls.Server` instance

### Class: tls.TLSSocket

Wraps a TCP socket with TLS encryption.

#### tlsSocket.encrypted

Always `true` for TLS sockets.

#### tlsSocket.authorized

`true` if peer certificate was signed by a trusted CA.

#### tlsSocket.authorizationError

Reason why peer certificate verification failed.

#### tlsSocket.getPeerCertificate([detailed])

Returns peer certificate information.

#### tlsSocket.getCipher()

Returns cipher name and version.

#### tlsSocket.getProtocol()

Returns negotiated TLS protocol version.

### Class: tls.Server

Accepts TLS connections.

#### Event: 'secureConnection'

Emitted when handshake completes successfully.

#### Event: 'tlsClientError'

Emitted when error occurs before connection established.

## Examples

### Basic HTTPS Request with TLS

```javascript
const tls = require('tls');

export async function handler(event) {
  const host = event.host || 'www.google.com';
  const port = 443;
  
  return new Promise((resolve, reject) => {
    const options = {
      host: host,
      port: port,
      servername: host, // For SNI
      rejectUnauthorized: true // Verify certificate
    };
    
    const socket = tls.connect(options, () => {
      console.log('TLS connection established');
      console.log('Authorized:', socket.authorized);
      
      // Send HTTP request
      socket.write('GET / HTTP/1.1\r\n');
      socket.write(`Host: ${host}\r\n`);
      socket.write('Connection: close\r\n');
      socket.write('\r\n');
    });
    
    let data = '';
    
    socket.on('data', (chunk) => {
      data += chunk.toString();
    });
    
    socket.on('end', () => {
      resolve({
        host,
        authorized: socket.authorized,
        protocol: socket.getProtocol(),
        cipher: socket.getCipher().name,
        responseLength: data.length
      });
    });
    
    socket.on('error', reject);
  });
}
```

### Get Certificate Information

```javascript
const tls = require('tls');

export async function handler(event) {
  const host = event.host || 'www.github.com';
  const port = 443;
  
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: host,
      port: port,
      servername: host
    }, () => {
      const cert = socket.getPeerCertificate();
      const cipher = socket.getCipher();
      
      socket.end();
      
      resolve({
        host,
        authorized: socket.authorized,
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        serialNumber: cert.serialNumber,
        fingerprint: cert.fingerprint,
        cipher: cipher.name,
        protocol: socket.getProtocol()
      });
    });
    
    socket.on('error', reject);
  });
}
```

### Detailed Certificate Chain

```javascript
const tls = require('tls');

export async function handler(event) {
  const host = event.host || 'www.google.com';
  
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: host,
      port: 443,
      servername: host
    }, () => {
      const cert = socket.getPeerCertificate(true); // Get detailed cert
      
      const extractCertInfo = (c) => ({
        subject: c.subject,
        issuer: c.issuer,
        validFrom: c.valid_from,
        validTo: c.valid_to,
        serialNumber: c.serialNumber
      });
      
      const chain = [];
      let current = cert;
      
      while (current) {
        chain.push(extractCertInfo(current));
        current = current.issuerCertificate;
        // Break if self-signed (root CA)
        if (current === cert) break;
      }
      
      socket.end();
      
      resolve({
        host,
        authorized: socket.authorized,
        chainLength: chain.length,
        certificates: chain
      });
    });
    
    socket.on('error', reject);
  });
}
```

### Check Certificate Expiry

```javascript
const tls = require('tls');

export async function handler(event) {
  const host = event.host || 'www.github.com';
  
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: host,
      port: 443,
      servername: host
    }, () => {
      const cert = socket.getPeerCertificate();
      
      const validFrom = new Date(cert.valid_from);
      const validTo = new Date(cert.valid_to);
      const now = new Date();
      
      const daysUntilExpiry = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));
      
      socket.end();
      
      resolve({
        host,
        subject: cert.subject.CN,
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
        daysUntilExpiry: daysUntilExpiry,
        isValid: now >= validFrom && now <= validTo,
        expiryWarning: daysUntilExpiry < 30
      });
    });
    
    socket.on('error', reject);
  });
}
```

### TLS Version Detection

```javascript
const tls = require('tls');

export async function handler(event) {
  const host = event.host || 'www.cloudflare.com';
  
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: host,
      port: 443,
      servername: host
    }, () => {
      const protocol = socket.getProtocol();
      const cipher = socket.getCipher();
      const ephemeralKeyInfo = socket.getEphemeralKeyInfo();
      
      socket.end();
      
      resolve({
        host,
        protocol: protocol,
        cipher: {
          name: cipher.name,
          version: cipher.version
        },
        ephemeralKeyInfo: ephemeralKeyInfo,
        alpnProtocol: socket.alpnProtocol
      });
    });
    
    socket.on('error', reject);
  });
}
```

### Certificate Validation Errors

```javascript
const tls = require('tls');

export async function handler(event) {
  const host = event.host || 'expired.badssl.com';
  
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: host,
      port: 443,
      servername: host,
      rejectUnauthorized: false // Don't reject invalid certs
    }, () => {
      const cert = socket.getPeerCertificate();
      
      socket.end();
      
      resolve({
        host,
        authorized: socket.authorized,
        authorizationError: socket.authorizationError,
        subject: cert.subject,
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        fingerprint: cert.fingerprint
      });
    });
    
    socket.on('error', (err) => {
      resolve({
        host,
        error: err.message,
        code: err.code
      });
    });
  });
}
```

### SNI (Server Name Indication)

```javascript
const tls = require('tls');

export async function handler(event) {
  const host = event.host || 'www.cloudflare.com';
  
  // SNI allows hosting multiple SSL sites on same IP
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: host,
      port: 443,
      servername: host, // SNI hostname
      checkServerIdentity: (hostname, cert) => {
        console.log('Checking server identity for:', hostname);
        // Custom validation logic can go here
        return undefined; // No error
      }
    }, () => {
      const cert = socket.getPeerCertificate();
      
      socket.end();
      
      resolve({
        host,
        sniServerName: host,
        certSubject: cert.subject.CN,
        subjectAltNames: cert.subjectaltname,
        authorized: socket.authorized
      });
    });
    
    socket.on('error', reject);
  });
}
```

### Multiple Hosts Certificate Check

```javascript
const tls = require('tls');

async function checkHost(host) {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: host,
      port: 443,
      servername: host
    }, () => {
      const cert = socket.getPeerCertificate();
      const now = new Date();
      const validTo = new Date(cert.valid_to);
      const daysLeft = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));
      
      socket.end();
      
      resolve({
        host,
        authorized: socket.authorized,
        subject: cert.subject.CN,
        validTo: cert.valid_to,
        daysUntilExpiry: daysLeft,
        protocol: socket.getProtocol(),
        cipher: socket.getCipher().name
      });
    });
    
    socket.on('error', (err) => {
      resolve({
        host,
        error: err.message
      });
    });
  });
}

export async function handler(event) {
  const hosts = event.hosts || [
    'www.github.com',
    'www.google.com',
    'www.cloudflare.com'
  ];
  
  const results = await Promise.all(hosts.map(checkHost));
  
  return {
    totalChecked: results.length,
    results: results
  };
}
```

### TLS with Client Certificate

```javascript
const tls = require('tls');
const fs = require('fs');

export async function handler(event) {
  // Note: This example shows the API - actual cert files would be needed
  const host = event.host || 'client-cert-test.com';
  
  return new Promise((resolve, reject) => {
    const options = {
      host: host,
      port: 443,
      servername: host,
      // Client certificate authentication would require:
      // key: fs.readFileSync('client-key.pem'),
      // cert: fs.readFileSync('client-cert.pem'),
      // ca: fs.readFileSync('ca-cert.pem')
    };
    
    // For demonstration without actual certs
    const socket = tls.connect(options, () => {
      socket.end();
      
      resolve({
        host,
        message: 'TLS connection established',
        protocol: socket.getProtocol(),
        authorized: socket.authorized
      });
    });
    
    socket.on('error', (err) => {
      resolve({
        host,
        error: err.message,
        note: 'Client certificates not provided in this example'
      });
    });
  });
}
```

### Cipher Suite Information

```javascript
const tls = require('tls');

export async function handler(event) {
  const host = event.host || 'www.howsmyssl.com';
  
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: host,
      port: 443,
      servername: host
    }, () => {
      const cipher = socket.getCipher();
      const protocol = socket.getProtocol();
      const ephemeralKeyInfo = socket.getEphemeralKeyInfo();
      
      socket.end();
      
      resolve({
        host,
        cipher: {
          name: cipher.name,
          standardName: cipher.standardName,
          version: cipher.version
        },
        protocol: protocol,
        ephemeralKey: ephemeralKeyInfo ? {
          type: ephemeralKeyInfo.type,
          size: ephemeralKeyInfo.size
        } : null,
        securityLevel: protocol === 'TLSv1.3' ? 'Excellent' :
                       protocol === 'TLSv1.2' ? 'Good' : 'Outdated'
      });
    });
    
    socket.on('error', reject);
  });
}
```

### ALPN Protocol Negotiation

```javascript
const tls = require('tls');

export async function handler(event) {
  const host = event.host || 'www.cloudflare.com';
  
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: host,
      port: 443,
      servername: host,
      ALPNProtocols: ['h2', 'http/1.1'] // HTTP/2 and HTTP/1.1
    }, () => {
      const negotiatedProtocol = socket.alpnProtocol;
      
      socket.end();
      
      resolve({
        host,
        requestedProtocols: ['h2', 'http/1.1'],
        negotiatedProtocol: negotiatedProtocol,
        supportsHTTP2: negotiatedProtocol === 'h2',
        tlsProtocol: socket.getProtocol()
      });
    });
    
    socket.on('error', reject);
  });
}
```

## Security Best Practices

- **Always verify certificates** - Set `rejectUnauthorized: true` in production
- **Use modern TLS versions** - Prefer TLSv1.2 and TLSv1.3
- **Check certificate expiry** - Monitor certificate expiration dates
- **Validate hostnames** - Use SNI and proper hostname validation
- **Use strong cipher suites** - Avoid weak or deprecated ciphers
- **Keep OpenSSL updated** - Security patches are critical
- **Handle errors properly** - Don't silently ignore TLS errors

## Common Use Cases

- **HTTPS connections** - Secure HTTP communication
- **Certificate validation** - Verify server identity
- **Certificate monitoring** - Track certificate expiration
- **Mutual TLS** - Client certificate authentication
- **Security scanning** - Check TLS configuration
- **Protocol negotiation** - ALPN for HTTP/2

## Next Steps

- [HTTPS module](./https.md)
- [Crypto module](./crypto.md)
- [NET module](./net.md)
- [Certificate handling examples](./https.md)
