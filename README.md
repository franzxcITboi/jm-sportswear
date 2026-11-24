# JM Maker Sportswear – Business & Inventory System

Thesis web application for JM Maker Sportswear. It is operated by one Owner/Manager and runs entirely on **localhost**. No database is connected yet, so all records are saved in each browser's `localStorage`.

## Requirements

- [Node.js](https://nodejs.org/) **v18 or newer** (the LTS version is fine)
- An internet connection the **first time** you run it (Vite downloads automatically)

## How to Run

```bash
# 1. Download the project
git clone https://github.com/franzxcITboi/jm-sportswear.git
cd jm-sportswear

# 2. Start the local server (opens the browser automatically)
npm run dev
```

Then open **http://localhost:5173** if the browser does not open by itself.

> No `npm install` step is needed. The project has no dependencies to install, and `npm run dev` downloads Vite automatically.

## Default Owner/Manager Login

| Field | Value |
| --- | --- |
| Email | `jmmakersportswear@gmail.com` |
| Password | `jmowner2022` |
| Owner Security PIN (for account creation / password reset) | `07122022` |

## Pages

| URL | Purpose |
| --- | --- |
| `/index.html` | Owner/Manager login & account setup |
| `/dashboard.html` | Owner/Manager dashboard (requires login) |
| `/buyer.html?token=...` | Buyer payment proof upload (opened through a link generated in **Payment Proofs**) |

## Project Structure

```text
index.html, dashboard.html, buyer.html   # Page entry points
public/images/                           # Logo & showcase photo
src/config/       # Constants, storage keys, pricing
src/types/        # TypeScript interfaces
src/store/        # localStorage persistence
src/utils/        # Formatters, calculations, DOM helpers, logger
src/components/   # Avatar builder & avatar modal
src/services/     # Authentication & payment verification logic
src/pages/        # Page controllers (login, dashboard, buyer)
src/modules/      # Dashboard modules (inventory, POS, fulfillment, payments, sales, reports, notifications)
src/styles/       # Login, buyer, and dashboard stylesheets
```

## Notes

- Data lives only in the browser on the laptop where it was entered. Each classmate starts with an empty system.
- Use **Sales Reports → Clear Local Test Data** to reset the system.
