import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  gettingStartedSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/quick-start',
        'getting-started/runtimes',
        'getting-started/function-anatomy',
        'getting-started/deploying'
      ]
    }
  ],

  cliSidebar: [
    {
      type: 'category',
      label: 'CLI Reference',
      collapsed: false,
      items: [
        'cli/installation',
        'cli/configuration',
        'cli/functions',
        'cli/versions',
        'cli/environment',
        'cli/execution',
        'cli/local-run',
        'cli/logs',
        'cli/reference'
      ]
    }
  ],

  apiSidebar: [
    {
      type: 'category',
      label: 'Bun (JavaScript / TypeScript)',
      collapsed: false,
      items: [
        'api/bun/globals',
        'api/bun/request',
        'api/bun/response',
        'api/bun/router',
        'api/bun/kv-store',
        'api/bun/realtime'
      ]
    },
    {
      type: 'category',
      label: '.NET (C#)',
      collapsed: false,
      items: [
        'api/dotnet/overview',
        'api/dotnet/logger',
        'api/dotnet/request',
        'api/dotnet/response',
        'api/dotnet/router',
        'api/dotnet/kv-store',
        'api/dotnet/realtime'
      ]
    }
  ],

  guidesSidebar: [
    {
      type: 'category',
      label: 'Guides',
      collapsed: false,
      items: [
        'guides/http-requests',
        'guides/file-serving',
        'guides/cryptography',
        'guides/environment-vars',
        'guides/realtime',
        'guides/compression',
        'guides/timers-async',
        'guides/sql-database'
      ]
    }
  ],

  examplesSidebar: [
    {
      type: 'category',
      label: 'Examples',
      collapsed: false,
      items: [
        'examples/hello-world',
        'examples/rest-api',
        'examples/crypto-hashing',
        'examples/kv-store-usage',
        'examples/webhook-handler',
        'examples/realtime-chat'
      ]
    },
    {
      type: 'category',
      label: 'Advanced',
      collapsed: false,
      items: ['advanced/limitations', 'advanced/best-practices', 'advanced/debugging']
    }
  ]
}

export default sidebars
