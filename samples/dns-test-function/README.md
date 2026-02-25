# DNS Test Function

This function tests the `dns` module implementation in the Invoke VM environment.

## Features Tested

### Callback-based API
- `dns.lookup()` - Resolves a hostname to an IP address
- `dns.lookupService()` - Resolves an address and port to a hostname and service
- `dns.resolve()` - Generic DNS resolution
- `dns.resolve4()` - Resolve IPv4 addresses (A records)
- `dns.resolve6()` - Resolve IPv6 addresses (AAAA records)
- `dns.resolveMx()` - Resolve mail exchange records
- `dns.resolveTxt()` - Resolve text records
- `dns.resolveNs()` - Resolve name server records
- `dns.resolveCname()` - Resolve canonical name records
- `dns.resolveSoa()` - Resolve start of authority records
- `dns.reverse()` - Reverse DNS lookup

### Promises API
- `dns.promises.lookup()`
- `dns.promises.resolve4()`
- `dns.promises.resolve6()`
- `dns.promises.resolveMx()`

### Resolver Class
- `new dns.Resolver()` - Custom resolver instances
- `resolver.setServers()` - Configure custom DNS servers
- `resolver.getServers()` - Get configured DNS servers
- `resolver.resolve4()` - IPv4 resolution with custom servers
- `resolver.resolveMx()` - MX resolution with custom servers
- `new dns.promises.Resolver()` - Promises-based resolver

### Server Configuration
- `dns.getServers()` - Get system DNS servers
- `dns.setServers()` - Set system DNS servers
- `dns.getDefaultResultOrder()` - Get default result ordering (Node.js v16+)

### Error Codes
Tests that all DNS error code constants are exposed:
- `NODATA`, `FORMERR`, `SERVFAIL`, `NOTFOUND`, `NOTIMP`, `REFUSED`
- `BADQUERY`, `BADNAME`, `BADFAMILY`, `BADRESP`, `CONNREFUSED`
- `TIMEOUT`, `EOF`, `FILE`, `NOMEM`, `DESTRUCTION`
- `BADSTR`, `BADFLAGS`, `NONAME`, `BADHINTS`, `NOTINITIALIZED`
- `LOADIPHLPAPI`, `ADDRGETNETWORKPARAMS`, `CANCELLED`

## Usage

Deploy this function to your Invoke instance and send a request:

## Response Format

The function returns a JSON object with the following structure:

```json
{
  "lookupTests": {
    "exampleCom": { "address": "93.184.216.34", "family": 4 },
    "localhost": { "address": "127.0.0.1", "family": 4 }
  },
  "lookupServiceTests": {
    "localhost80": { "hostname": "localhost", "service": "http" }
  },
  "resolveTests": {
    "resolve4": ["93.184.216.34"],
    "resolve6": ["2606:2800:220:1:248:1893:25c8:1946"],
    "resolveMx": [{ "exchange": "mail.example.com", "priority": 10 }],
    "resolveTxt": [["v=spf1 include:_spf.example.com ~all"]],
    "resolveNs": ["a.iana-servers.net", "b.iana-servers.net"],
    "resolveCname": ["www.example.com"],
    "resolveSoa": {
      "nsname": "ns.example.com",
      "hostmaster": "hostmaster.example.com",
      "serial": 2023010101,
      "refresh": 10800,
      "retry": 3600,
      "expire": 604800,
      "minttl": 86400
    }
  },
  "reverseTests": {
    "googleDNS": ["dns.google"]
  },
  "promisesTests": {
    "lookup": { "address": "93.184.216.34", "family": 4 },
    "resolve4": ["93.184.216.34"],
    "resolve6": ["2606:2800:220:1:248:1893:25c8:1946"],
    "resolveMx": [{ "exchange": "mail.example.com", "priority": 10 }]
  },
  "resolverTests": {
    "defaultServers": ["192.168.1.1"],
    "customServers": ["8.8.8.8", "8.8.4.4"],
    "resolve4": ["93.184.216.34"],
    "resolveMx": [{ "exchange": "mail.example.com", "priority": 10 }],
    "promisesResolverServers": ["1.1.1.1", "1.0.0.1"],
    "promisesResolverResult": ["93.184.216.34"]
  },
  "serverTests": {
    "originalServers": ["192.168.1.1"],
    "modifiedServers": ["8.8.8.8", "1.1.1.1"],
    "restoredServers": ["192.168.1.1"],
    "defaultResultOrder": "ipv4first"
  },
  "errorCodes": {
    "NODATA": "ENODATA",
    "NOTFOUND": "ENOTFOUND",
    ...
  },
  "errors": [],
  "success": true,
  "message": "DNS module tests completed"
}
```

## Node.js v24 Compatibility

This test function verifies full compatibility with Node.js v24 DNS API including:
- All callback-based methods with proper error handling
- Complete `dns.promises` API for async/await usage
- Full `Resolver` class with custom DNS server support
- All DNS error codes and constants
- Proper cross-VM boundary data transfer using ArrayBuffer/Buffer patterns

## Notes

- Some DNS queries may fail depending on network configuration and DNS server availability
- CNAME records may not exist for all domains (this is expected)
- The function uses example.com for testing, which is a reserved domain for documentation
- Error codes are properly serialized across the VM boundary
