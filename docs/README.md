# Alon POS Enterprise — Documentation Index

> **Version:** 0.1.0 · **Stack:** Next.js 16, Electron 33, MySQL 2, TypeScript 5

Alon POS is a full-featured, offline-capable inventory and point-of-sale management system packaged as an Electron desktop application. Built for Philippine retail businesses, it ships with BIR-compliance features (RMO 24-2023), multi-level approval workflows, and a native thermal-receipt printer stack.

---

## 📂 Documentation Files

| File | Description |
|------|-------------|
| [README.md](./README.md) | This file — project overview & doc index |
| [FEATURES.md](./FEATURES.md) | Complete feature reference for all modules |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Tech stack, folder layout, data flow |
| [API_ENDPOINTS.md](./API_ENDPOINTS.md) | Full REST API endpoint listing |
| [USER_GUIDE.md](./USER_GUIDE.md) | Step-by-step guide for end users |
| [SETUP.md](./SETUP.md) | Installation & environment setup |
| [blueprint.md](./blueprint.md) | Original design brief |

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the web admin dashboard (development)
npm run dev

# 3. Launch the POS terminal (Electron window)
npm run electron-only

# 4. Run both simultaneously
npm run electron-dev
```

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Desktop Shell | Electron 33 |
| Database | MySQL 2 |
| Language | TypeScript 5 |
| UI Library | shadcn/ui + Radix UI |
| Styling | Tailwind CSS 3 |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| PDF/Print | jsPDF, ESC/POS encoder, React-to-Print |
| Drag & Drop | @hello-pangea/dnd |

---

## 🗺️ Module Overview

```
Alon POS System
├── 🖥️  Point of Sale (POS)          → /pos
├── 📊  Dashboard                    → /dashboard
├── 📦  Products                     → /products
├── 🏭  Inventory                    → /inventory
│   ├── Stock Levels
│   ├── Stock Counts (Snapshots)
│   ├── Repackaging / Break Pack
│   ├── Shelf Board (drag-and-drop)
│   ├── Transfer Board
│   ├── Adjustment History
│   └── Stock Movement Log
├── 💰  Sales                        → /sales
│   ├── POS Transactions
│   ├── Sales Details
│   ├── Sales by Product / Date
│   ├── Sales Orders & Invoices
│   ├── Returns (Merchandise Credits)
│   ├── Post Void
│   ├── X-Reading & Z-Reading
│   └── Sales Analysis
├── 🛒  Purchases                    → /purchases
│   ├── Purchase Orders
│   └── Bad Orders
├── 👥  Customers                    → /customer
│   ├── Customer List
│   ├── Customer Payments
│   ├── Customer Balances
│   └── Loyalty Points
├── 🏢  Suppliers                    → /suppliers
│   ├── Supplier List
│   ├── Balance to Supplier
│   └── Supplier Payments
├── ✅  Approvals Board              → (sidebar drawer)
├── 📈  Reports                      → /reports
├── 👤  User Management              → /user-management
└── ⚙️  Settings                     → /settings
    ├── POS Setup
    ├── Pricing & Price Levels
    ├── Tax Rates
    ├── POS Terminals
    ├── Appearance
    ├── Notifications
    ├── Data Management
    ├── External API
    └── System
```
