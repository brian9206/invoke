import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Invoke Documentation',
  tagline: 'Build powerful serverless functions with ease',
  favicon: 'img/favicon.svg',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://brian9206.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/invoke/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'brian9206', // Usually your GitHub org/user name.
  projectName: 'invoke', // Usually your repo name.
  deploymentBranch: 'gh-pages',

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: false,
      disableSwitch: false,
    },
    navbar: {
      title: 'Invoke',
      logo: {
        alt: 'Invoke Logo',
        src: 'img/logo.svg',
      },
      hideOnScroll: true,
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'gettingStartedSidebar',
          position: 'left',
          label: 'Getting Started',
        },
        {
          type: 'docSidebar',
          sidebarId: 'cliSidebar',
          position: 'left',
          label: 'CLI',
        },
        {
          type: 'docSidebar',
          sidebarId: 'apiSidebar',
          position: 'left',
          label: 'API',
        },
        {
          type: 'docSidebar',
          sidebarId: 'guidesSidebar',
          position: 'left',
          label: 'Guides',
        },
        {
          type: 'docSidebar',
          sidebarId: 'examplesSidebar',
          position: 'left',
          label: 'Examples',
        },
        {
          type: 'html',
          position: 'right',
          value: '<a href="https://github.com/brian9206/invoke" class="navbar__item navbar__link" target="_blank" rel="noopener noreferrer">GitHub</a>',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Quick Start',
              to: '/docs/getting-started/quick-start',
            },
            {
              label: 'CLI Reference',
              to: '/docs/cli/reference',
            },
            {
              label: 'API Reference',
              to: '/docs/api/globals',
            },
            {
              label: 'Examples',
              to: '/docs/examples/hello-world',
            },
          ],
        },
        {
          title: 'Guides',
          items: [
            {
              label: 'HTTP Requests',
              to: '/docs/guides/http-requests',
            },
            {
              label: 'Environment Variables',
              to: '/docs/guides/environment-vars',
            },
            {
              label: 'KV Store Usage',
              to: '/docs/examples/kv-store-usage',
            },
            {
              label: 'Cryptography',
              to: '/docs/guides/cryptography',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Advanced Topics',
              to: '/docs/advanced/limitations',
            },
            {
              label: 'Best Practices',
              to: '/docs/advanced/best-practices',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/brian9206/invoke',
            },
          ],
        },
      ],
      copyright: `Built with ⚡ by Brian · © ${new Date().getFullYear()} Invoke Documentation`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'javascript', 'typescript', 'json', 'docker'],
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: true,
      },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
