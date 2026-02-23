---
sidebar_position: 1
---

# Installation

The Invoke CLI is a powerful command-line interface for managing serverless functions, deployments, environment variables, and more.

## Prerequisites

- Node.js 14 or higher
- npm or yarn
- An Invoke account with API key

## Installation

### Via npm

```bash
npm install -g invoke-cli
```

### Via yarn

```bash
yarn global add invoke-cli
```

### From Source

```bash
git clone https://github.com/brian9206/invoke.git
cd invoke/invoke-cli
npm install
npm link
```

## Verify Installation

Check that the CLI is installed correctly:

```bash
invoke --version
```

You should see the version number displayed.

## Next Steps

- [Configure the CLI](./configuration.md) with your API key
- Learn about [Function Management](./functions.md)
- Explore [Execution Commands](./execution.md)
