# TLS Test Function

This function tests the comprehensive TLS module implementation for the Invoke VM environment.

## Features Tested

### Module Loading
- TLS module availability and core functions
- Constants and properties
- Class constructors

### Certificate Store
- CA certificate loading from bundled store
- System certificate store access
- Extra certificates from `NODE_EXTRA_CA_CERTS`
- Certificate caching and mutex locking
- Malformed certificate handling

### TLS Socket
- Socket creation and basic functionality
- Event handling and method chaining
- TLS-specific properties (`authorized`, `encrypted`)
- Certificate inspection methods
- Session management

### Secure Context
- Context creation and configuration
- Certificate and key management
- CA certificate handling
- Cipher configuration

### Server Stubs
- Proper "not supported" errors for server functionality
- Correct error codes and messages
- API signature compatibility

### Node.js Compatibility
- Method overloads and parameter handling
- Event timing and behavior
- Error types and messages
- Advanced TLS features

## Usage

Deploy this function and call it to get a comprehensive report of TLS functionality:

The response includes detailed test results showing:
- Module loading status
- Certificate store functionality
- TLS socket capabilities
- Compatibility with Node.js TLS API
- Error conditions and edge cases

## Expected Results

- All server-side functions should throw `ENOTSUP` errors
- Client-side functions should work with proper Node.js compatibility
- Certificate loading should work with caching
- TLS socket should provide full Node.js API surface
- Constants and properties should match Node.js values