# dns

The `dns` module provides name resolution functionality, allowing you to resolve domain names to IP addresses and vice versa.

## Import

```javascript
const dns = require('dns');
// For promise-based API
const dnsPromises = require('dns').promises;
```

## API Reference

### dns.lookup(hostname[, options], callback)

Resolves a hostname to the first found A (IPv4) or AAAA (IPv6) record.

**Parameters:**
- `hostname` - Hostname to resolve
- `options` - Can be an object or integer (address family)
  - `family` - Address family (4 or 6)
  - `all` - Return all resolved addresses (default: false)
- `callback(err, address, family)` - Callback function

### dns.resolve4(hostname[, options], callback)

Resolves a hostname to an array of IPv4 addresses.

### dns.resolve6(hostname[, options], callback)

Resolves a hostname to an array of IPv6 addresses.

### dns.resolve(hostname[, rrtype], callback)

Resolves a hostname using the specified DNS record type.

**Record types:** `'A'`, `'AAAA'`, `'CNAME'`, `'MX'`, `'NS'`, `'PTR'`, `'SOA'`, `'SRV'`, `'TXT'`

### dns.resolveMx(hostname, callback)

Resolves a hostname to an array of MX (mail exchange) records.

### dns.resolveTxt(hostname, callback)

Resolves a hostname to an array of TXT records.

### dns.resolveCname(hostname, callback)

Resolves a hostname to an array of CNAME records.

### dns.resolveNs(hostname, callback)

Resolves a hostname to an array of name server records.

### dns.resolveSrv(hostname, callback)

Resolves a hostname to an array of SRV records.

### dns.reverse(ip, callback)

Performs a reverse DNS query that resolves an IP address to an array of hostnames.

### dns.promises API

All methods have promise-based equivalents in `dns.promises`.

## Examples

### Basic Hostname Resolution

```javascript
const dns = require('dns').promises;

export async function handler(event) {
  const hostname = event.hostname || 'example.com';
  
  try {
    // Resolve to IP address
    const address = await dns.lookup(hostname);
    
    console.log('Resolved:', address);
    
    return {
      hostname,
      address: address.address,
      family: address.family
    };
  } catch (error) {
    console.error('DNS lookup failed:', error);
    throw error;
  }
}
```

### Resolving All Addresses

```javascript
const dns = require('dns').promises;

export async function handler(event) {
  const hostname = event.hostname || 'google.com';
  
  // Get all addresses
  const addresses = await dns.lookup(hostname, { all: true });
  
  return {
    hostname,
    addressCount: addresses.length,
    addresses: addresses.map(a => ({
      address: a.address,
      family: a.family === 4 ? 'IPv4' : 'IPv6'
    }))
  };
}
```

### IPv4 and IPv6 Resolution

```javascript
const dns = require('dns').promises;

export async function handler(event) {
  const hostname = event.hostname || 'example.com';
  
  try {
    // Resolve IPv4 addresses
    const ipv4Addresses = await dns.resolve4(hostname);
    
    // Resolve IPv6 addresses
    let ipv6Addresses = [];
    try {
      ipv6Addresses = await dns.resolve6(hostname);
    } catch (err) {
      console.log('No IPv6 addresses found');
    }
    
    return {
      hostname,
      ipv4: ipv4Addresses,
      ipv6: ipv6Addresses
    };
  } catch (error) {
    console.error('DNS resolution failed:', error);
    throw error;
  }
}
```

### MX Record Lookup

```javascript
const dns = require('dns').promises;

export async function handler(event) {
  const domain = event.domain || 'gmail.com';
  
  try {
    // Get mail server records
    const mxRecords = await dns.resolveMx(domain);
    
    // Sort by priority (lower is higher priority)
    mxRecords.sort((a, b) => a.priority - b.priority);
    
    return {
      domain,
      mailServers: mxRecords.map(record => ({
        priority: record.priority,
        exchange: record.exchange
      }))
    };
  } catch (error) {
    console.error('MX lookup failed:', error);
    throw error;
  }
}
```

### TXT Record Lookup

```javascript
const dns = require('dns').promises;

export async function handler(event) {
  const domain = event.domain || 'example.com';
  
  try {
    // Get TXT records (e.g., SPF, DKIM, domain verification)
    const txtRecords = await dns.resolveTxt(domain);
    
    // Flatten records (each can be an array of strings)
    const records = txtRecords.map(record => record.join(''));
    
    return {
      domain,
      txtRecords: records
    };
  } catch (error) {
    console.error('TXT lookup failed:', error);
    throw error;
  }
}
```

### Reverse DNS Lookup

```javascript
const dns = require('dns').promises;

export async function handler(event) {
  const ipAddress = event.ip || '8.8.8.8';
  
  try {
    // Reverse lookup - IP to hostname
    const hostnames = await dns.reverse(ipAddress);
    
    return {
      ip: ipAddress,
      hostnames
    };
  } catch (error) {
    console.error('Reverse DNS failed:', error);
    return {
      ip: ipAddress,
      hostnames: [],
      error: error.message
    };
  }
}
```

### CNAME Record Resolution

```javascript
const dns = require('dns').promises;

export async function handler(event) {
  const hostname = event.hostname || 'www.example.com';
  
  try {
    // Resolve CNAME records
    const cnames = await dns.resolveCname(hostname);
    
    return {
      hostname,
      cnames
    };
  } catch (error) {
    if (error.code === 'ENODATA') {
      return {
        hostname,
        message: 'No CNAME records found'
      };
    }
    throw error;
  }
}
```

### Name Server Lookup

```javascript
const dns = require('dns').promises;

export async function handler(event) {
  const domain = event.domain || 'example.com';
  
  try {
    // Get name servers for domain
    const nameservers = await dns.resolveNs(domain);
    
    return {
      domain,
      nameservers
    };
  } catch (error) {
    console.error('NS lookup failed:', error);
    throw error;
  }
}
```

### SRV Record Lookup

```javascript
const dns = require('dns').promises;

export async function handler(event) {
  // Example: _service._proto.domain
  const service = event.service || '_xmpp-server._tcp.gmail.com';
  
  try {
    const srvRecords = await dns.resolveSrv(service);
    
    return {
      service,
      records: srvRecords.map(record => ({
        priority: record.priority,
        weight: record.weight,
        port: record.port,
        name: record.name
      }))
    };
  } catch (error) {
    console.error('SRV lookup failed:', error);
    throw error;
  }
}
```

### Comprehensive DNS Information

```javascript
const dns = require('dns').promises;

export async function handler(event) {
  const domain = event.domain || 'example.com';
  
  const results = {
    domain,
    timestamp: new Date().toISOString()
  };
  
  // A records (IPv4)
  try {
    results.ipv4 = await dns.resolve4(domain);
  } catch (err) {
    results.ipv4 = [];
  }
  
  // AAAA records (IPv6)
  try {
    results.ipv6 = await dns.resolve6(domain);
  } catch (err) {
    results.ipv6 = [];
  }
  
  // MX records
  try {
    results.mx = await dns.resolveMx(domain);
  } catch (err) {
    results.mx = [];
  }
  
  // TXT records
  try {
    const txt = await dns.resolveTxt(domain);
    results.txt = txt.map(record => record.join(''));
  } catch (err) {
    results.txt = [];
  }
  
  // NS records
  try {
    results.nameservers = await dns.resolveNs(domain);
  } catch (err) {
    results.nameservers = [];
  }
  
  // CNAME records
  try {
    results.cname = await dns.resolveCname(domain);
  } catch (err) {
    results.cname = [];
  }
  
  return results;
}
```

### Callback-based API Example

```javascript
const dns = require('dns');

export async function handler(event) {
  const hostname = event.hostname || 'example.com';
  
  // Using callback-based API
  return new Promise((resolve, reject) => {
    dns.lookup(hostname, (err, address, family) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          hostname,
          address,
          family
        });
      }
    });
  });
}
```

### DNS Error Handling

```javascript
const dns = require('dns').promises;

export async function handler(event) {
  const hostname = event.hostname;
  
  if (!hostname) {
    return { error: 'hostname is required' };
  }
  
  try {
    const address = await dns.lookup(hostname);
    return {
      success: true,
      hostname,
      address: address.address
    };
  } catch (error) {
    // Handle common DNS errors
    const errorMap = {
      'ENOTFOUND': 'Domain not found',
      'ENODATA': 'No data returned',
      'ETIMEOUT': 'DNS query timed out',
      'ECONNREFUSED': 'Connection refused',
      'ESERVFAIL': 'Server failed to complete query'
    };
    
    return {
      success: false,
      hostname,
      error: errorMap[error.code] || error.message,
      code: error.code
    };
  }
}
```

## Common Error Codes

- `ENOTFOUND` - Domain name not found
- `ENODATA` - DNS server returned answer with no data
- `ETIMEOUT` - DNS query timed out
- `ECONNREFUSED` - Connection to DNS server refused
- `ESERVFAIL` - DNS server returned a failure

## Best Practices

- Use the promise-based API (`dns.promises`) for cleaner async code
- Handle common DNS errors gracefully
- Consider caching DNS results for frequently accessed domains
- Use appropriate record types for your use case
- Be aware that DNS lookups can fail due to network issues

## Next Steps

- [HTTP requests](./http.md)
- [HTTPS requests](./https.md)
- [Network connections with net](./net.md)
- [URL parsing](./url.md)
