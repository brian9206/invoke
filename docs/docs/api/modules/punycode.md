# punycode

The `punycode` module provides utilities for converting between Unicode and ASCII representations of domain names, which is essential for handling internationalized domain names (IDN).

## Import

```javascript
const punycode = require('punycode');
```

## API Reference

### punycode.encode(string)

Converts a string of Unicode symbols to Punycode.

**Parameters:**
- `string` - Unicode string to encode

**Returns:** Punycode string

### punycode.decode(string)

Converts a Punycode string to Unicode.

**Parameters:**
- `string` - Punycode string to decode

**Returns:** Unicode string

### punycode.toASCII(domain)

Converts a Unicode domain name to ASCII (Punycode).

**Parameters:**
- `domain` - Unicode domain name

**Returns:** ASCII-compatible domain name

### punycode.toUnicode(domain)

Converts an ASCII domain name to Unicode.

**Parameters:**
- `domain` - ASCII/Punycode domain name

**Returns:** Unicode domain name

### punycode.ucs2.decode(string)

Creates an array of Unicode code points from a string.

**Parameters:**
- `string` - String to decode

**Returns:** Array of code points

### punycode.ucs2.encode(codePoints)

Creates a string from an array of Unicode code points.

**Parameters:**
- `codePoints` - Array of code points

**Returns:** String

## Examples

### Convert Domain to ASCII (Punycode)

```javascript
const punycode = require('punycode');

export async function handler(event) {
  const domain = event.domain || '中国.com';
  
  const ascii = punycode.toASCII(domain);
  
  return {
    original: domain,
    ascii: ascii,
    encoded: true
  };
}
```

### Convert Domain to Unicode

```javascript
const punycode = require('punycode');

export async function handler(event) {
  const domain = event.domain || 'xn--fiqs8s.com';
  
  const unicode = punycode.toUnicode(domain);
  
  return {
    original: domain,
    unicode: unicode,
    decoded: true
  };
}
```

### Encode String to Punycode

```javascript
const punycode = require('punycode');

export async function handler(event) {
  const string = event.string || 'münchen';
  
  const encoded = punycode.encode(string);
  
  return {
    original: string,
    encoded: encoded,
    explanation: 'Punycode representation without xn-- prefix'
  };
}
```

### Decode Punycode String

```javascript
const punycode = require('punycode');

export async function handler(event) {
  const punycodeString = event.punycode || 'mnchen-3ya';
  
  const decoded = punycode.decode(punycodeString);
  
  return {
    punycode: punycodeString,
    decoded: decoded,
    note: 'Input should be without xn-- prefix'
  };
}
```

### Multiple International Domains

```javascript
const punycode = require('punycode');

export async function handler(event) {
  const domains = event.domains || [
    '中国.com',           // Chinese
    'россия.рф',        // Russian
    'مصر.com',          // Arabic
    'ελλάδα.eu',        // Greek
    '日本.jp',          // Japanese
    'deutschland.de'    // German (ASCII, no conversion needed)
  ];
  
  const results = domains.map(domain => ({
    unicode: domain,
    ascii: punycode.toASCII(domain),
    needsEncoding: domain !== punycode.toASCII(domain)
  }));
  
  return {
    totalDomains: domains.length,
    results: results
  };
}
```

### Email Address Internationalization

```javascript
const punycode = require('punycode');

export async function handler(event) {
  const email = event.email || 'user@münchen.de';
  
  const [localPart, domain] = email.split('@');
  const asciiDomain = punycode.toASCII(domain);
  const asciiEmail = `${localPart}@${asciiDomain}`;
  
  return {
    originalEmail: email,
    asciiEmail: asciiEmail,
    localPart: localPart,
    unicodeDomain: domain,
    asciiDomain: asciiDomain
  };
}
```

### Validate International Domain

```javascript
const punycode = require('punycode');

export async function handler(event) {
  const domain = event.domain || 'example.中国';
  
  try {
    const ascii = punycode.toASCII(domain);
    const backToUnicode = punycode.toUnicode(ascii);
    
    const isValid = domain === backToUnicode;
    
    return {
      domain: domain,
      ascii: ascii,
      roundTrip: backToUnicode,
      isValid: isValid,
      canBeConverted: true
    };
    
  } catch (error) {
    return {
      domain: domain,
      isValid: false,
      canBeConverted: false,
      error: error.message
    };
  }
}
```

### URL with International Domain

```javascript
const punycode = require('punycode');

export async function handler(event) {
  const url = event.url || 'https://münchen.de/path?query=value';
  
  // Parse URL
  const urlParts = url.match(/^(https?:\/\/)?([^\/\?]+)(.*)/);
  
  if (urlParts) {
    const protocol = urlParts[1] || 'https://';
    const domain = urlParts[2];
    const rest = urlParts[3] || '';
    
    const asciiDomain = punycode.toASCII(domain);
    const asciiUrl = protocol + asciiDomain + rest;
    
    return {
      originalUrl: url,
      asciiUrl: asciiUrl,
      protocol: protocol,
      unicodeDomain: domain,
      asciiDomain: asciiDomain,
      path: rest
    };
  }
  
  return {
    originalUrl: url,
    error: 'Could not parse URL'
  };
}
```

### UCS-2 Code Points

```javascript
const punycode = require('punycode');

export async function handler(event) {
  const string = event.string || '你好'; // Hello in Chinese
  
  const codePoints = punycode.ucs2.decode(string);
  const encoded = punycode.ucs2.encode(codePoints);
  
  return {
    original: string,
    codePoints: codePoints,
    hexCodePoints: codePoints.map(cp => '0x' + cp.toString(16).toUpperCase()),
    roundTrip: encoded,
    matches: string === encoded
  };
}
```

### Domain Name Comparison

```javascript
const punycode = require('punycode');

export async function handler(event) {
  const domain1 = event.domain1 || 'münchen.de';
  const domain2 = event.domain2 || 'xn--mnchen-3ya.de';
  
  const ascii1 = punycode.toASCII(domain1);
  const ascii2 = punycode.toASCII(domain2);
  
  const areSame = ascii1 === ascii2;
  
  return {
    domain1: {
      original: domain1,
      ascii: ascii1
    },
    domain2: {
      original: domain2,
      ascii: ascii2
    },
    areSame: areSame,
    comparison: areSame ? 'Domains are equivalent' : 'Domains are different'
  };
}
```

### Extract Domain from URL and Convert

```javascript
const punycode = require('punycode');

export async function handler(event) {
  const url = event.url || 'https://www.münchen.de:8080/path';
  
  try {
    // Simple domain extraction
    const domainMatch = url.match(/^(?:https?:\/\/)?(?:www\.)?([^:\/\s]+)/);
    
    if (domainMatch) {
      const domain = domainMatch[1];
      const ascii = punycode.toASCII(domain);
      
      return {
        url: url,
        extractedDomain: domain,
        asciiDomain: ascii,
        fullAsciiUrl: url.replace(domain, ascii)
      };
    }
    
    return {
      url: url,
      error: 'Could not extract domain'
    };
    
  } catch (error) {
    return {
      url: url,
      error: error.message
    };
  }
}
```

### Internationalized Subdomain

```javascript
const punycode = require('punycode');

export async function handler(event) {
  const subdomain = event.subdomain || 'münchen';
  const domain = event.domain || 'example.com';
  
  const fullDomain = `${subdomain}.${domain}`;
  const ascii = punycode.toASCII(fullDomain);
  
  return {
    subdomain: subdomain,
    domain: domain,
    fullUnicodeDomain: fullDomain,
    fullAsciiDomain: ascii,
    subdomainOnly: punycode.toASCII(subdomain)
  };
}
```

## Common Punycode Examples

| Unicode Domain | ASCII (Punycode) |
|----------------|------------------|
| 中国.com | xn--fiqs8s.com |
| münchen.de | xn--mnchen-3ya.de |
| россия.рф | xn--h1alffa9f.xn--p1ai |
| مصر.com | xn--wgbh1c.com |
| 日本.jp | xn--wgv71a.jp |

## Best Practices

- **Always convert for DNS** - Use toASCII before DNS lookups
- **Display Unicode to users** - Show readable names in UI
- **Store both forms** - Keep Unicode for display, ASCII for processing
- **Validate input** - Check if conversion is successful
- **Handle errors gracefully** - Invalid input can throw errors
- **Use for email domains** - Apply to domain part of email addresses
- **Consider security** - Be aware of homograph attacks

## Common Use Cases

- **International domain names (IDN)** - Convert foreign language domains
- **Email validation** - Handle international email addresses
- **URL processing** - Parse and normalize URLs with Unicode
- **DNS lookups** - Convert before querying DNS
- **Web scraping** - Handle international websites
- **Domain registration** - Validate and convert domain names

## Security Considerations

**Homograph Attacks:** Be aware that similar-looking characters from different scripts can be used maliciously:
- Greek ρ (rho) looks like Latin p
- Cyrillic а looks like Latin a

Always validate and potentially warn users when displaying internationalized domains.

## Next Steps

- [URL parsing](./url.md)
- [Buffer encoding](./buffer.md)
- [String operations](./string_decoder.md)
- [HTTP requests](./http.md)
