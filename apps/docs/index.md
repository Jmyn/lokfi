---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Lokfi"
  text: "See where your money actually goes — without giving it to anyone."
  tagline: Privacy-first personal finance tracker. Local-first, zero-telemetry, open-source.
  # image:
  #   src: /lokfi-logo.svg
  #   alt: Lokfi
  actions:
    - theme: brand
      text: Getting Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/jmyn/lokfi

features:
  - title: "100% Private"
    icon: 🛡️
    details: Your data never leaves your device. All parsing and storage happen locally in your browser. No servers, no accounts, no cloud dependency.
  - title: "Smart Categorization"
    icon: ⚙️
    details: A powerful rule engine automatically categorizes transactions as you import them. Manual overrides are always respected.
  - title: "Multi-Bank Support"
    icon: 🏦
    details: Parse bank statements from OCBC, Citibank, UOB, Crypto.com, and more. Support for both PDF and CSV formats.
  - title: "Investments Dashboard"
    icon: 📈
    details: Track your brokerage portfolios with real-time data from Tiger Brokers via OpenAPI. Holdings, dividends, and performance at a glance.
  - title: "Local-First"
    icon: 💾
    details: Built on IndexedDB (via Dexie.js) for fast, offline-capable storage. Your data is always available, even without internet.
  - title: "Open Source"
    icon: 🔓
    details: MIT licensed. The entire codebase is open and auditable. No telemetry, no tracking, no surprises.
---
