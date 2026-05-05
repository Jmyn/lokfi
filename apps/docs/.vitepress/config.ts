import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Lokfi',
  description: 'Privacy-first personal finance tracker — documentation',

  // Served at lokfi.app/docs
  base: '/docs/',

  // Output to apps/docs/dist (sibling of .vitepress)
  outDir: './dist',

  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['link', { rel: 'icon', href: '/docs/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#863bff' }],
  ],

  themeConfig: {
    logo: '/lokfi-logo.svg',

    siteTitle: 'Docs',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/supported-banks' },
      { text: 'Lokfi.app', link: 'https://lokfi.app' },
    ],

    sidebar: {
      '/guide/': {
        base: '/guide/',
        items: [
          {
            text: 'Guide',
            items: [
              { text: 'Getting Started', link: 'getting-started' },
              { text: 'Importing Data', link: 'importing-data' },
              { text: 'Categories & Rules', link: 'categories-and-rules' },
              { text: 'Transactions', link: 'transactions' },
              { text: 'Finances Dashboard', link: 'finances' },
              { text: 'Investments', link: 'investments' },
              { text: 'Privacy & Security', link: 'privacy' },
              { text: 'FAQ', link: 'faq' },
            ],
          },
        ],
      },
      '/reference/': {
        base: '/reference/',
        items: [
          {
            text: 'Reference',
            items: [
              { text: 'Supported Banks', link: 'supported-banks' },
              { text: 'Keyboard Shortcuts', link: 'keyboard-shortcuts' },
            ],
          },
        ],
      },
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/jmyn/lokfi' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'MIT License — Built with ❤️ for privacy.',
      copyright: '© 2026 Jmyn',
    },

    editLink: {
      pattern: 'https://github.com/jmyn/lokfi/edit/main/apps/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
})
