# Lucerne Boutique

A production-ready, bilingual e-commerce platform for **Lucerne Boutique**, built for online fashion retail and in-store sales. It combines a responsive customer storefront, complete administration dashboard, inventory and order management, analytics, and browser/Electron point of sale in one codebase.

> Live website: [lucerne-boutique.com](https://lucerne-boutique.com)

## Highlights

- Arabic and English storefront with RTL/LTR support
- Responsive desktop, tablet, and mobile experience
- Products with categories, sizes, colors, variants, media, stock, barcodes, and discounts
- Search, filtering, wishlist, persistent cart, checkout, reviews, and order tracking
- Customer profiles, order history, store credit, loyalty points, and exchange requests
- Cash on delivery and online payment integrations
- Admin management for products, orders, users, content, discounts, exchanges, and database operations
- POS with barcode support, customer management, receipts, inventory updates, and reporting
- Optional Electron desktop POS application
- Analytics dashboards, category reports, and Excel bulk imports
- Cloudinary/local media, image cropping, optimization, and watermarking
- AI product-image generation and storefront chatbot
- Email, SMS, WhatsApp notifications, and phone OTP
- Security headers, CORS allow-listing, API rate limiting, sessions, and safe errors

## Technology Stack

| Area | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Wouter |
| UI | Tailwind CSS, Radix UI, Lucide, Framer Motion |
| State/data | TanStack Query, Zustand, React Hook Form, Zod |
| Backend | Node.js, Express 5, TypeScript |
| Database | PostgreSQL, Drizzle ORM |
| Authentication | Local sessions, Firebase, phone OTP |
| Media | Cloudinary, Sharp, Multer |
| Payments | Stripe, Lahza, cash on delivery |
| Messaging | Nodemailer, Twilio SMS/Verify/WhatsApp |
| AI | OpenAI, Google Gemini, optional Ollama |
| Reports/imports | Recharts, ExcelJS, JsBarcode |
| Desktop POS | Electron |

## Main Modules

### Customer storefront

- Home, shop, sale, and dynamic category pages
- Dresses, clothes, and shoes collections
- Size/color variants with variant media and inventory
- Product galleries, ratings, reviews, recommendations, and low-stock information
- Wishlist and persistent shopping cart
- Checkout with delivery region, discount code, credit, and multiple payment methods
- Account settings, orders, points, credit, and exchanges
- FAQ, contact, location, shipping/returns, privacy, and terms
- Arabic/English responsive RTL/LTR layouts

### Admin dashboard

- Sales overview and operational statistics
- Product, variant, inventory, barcode, media, and bulk-upload management
- Categories and subcategories
- Orders, fulfillment, and item editing
- Users, roles, blocking, points, and credit
- Targeted discount codes, limits, and expiration
- Exchange requests and editable storefront content
- Analytics, category reports, backups, and maintenance tools

### Point of sale

- Product lookup and barcode scanning
- Size/color selection and live stock handling
- Customer search and creation
- Discounts, payments, receipts, and orders
- Daily sales/reporting workflows
- Electron desktop packaging

## Project Structure

```text
.
├── client/                  # React storefront and admin app
│   ├── public/              # Static assets
│   └── src/
│       ├── components/      # Shared, layout, profile, admin, and UI components
│       ├── hooks/           # API/application hooks
│       ├── i18n/            # Arabic and English translations
│       ├── lib/             # Firebase, tracking, AI, and utilities
│       ├── pages/           # Storefront pages
│       ├── pages/admin/     # Admin, reports, and POS pages
│       └── store/           # Cart state
├── server/                  # Express API and integrations
│   └── chatbot/             # Chatbot intent/entity logic
├── shared/                  # Shared schema, models, and route types
├── migrations/              # Drizzle SQL migrations
├── pos-electron/            # Desktop POS wrapper
├── script/                  # Production build script
├── lucerne-boutique-schema.sql
└── package.json
```

## Prerequisites

- Node.js 20+
- npm
- PostgreSQL 16 or a compatible recent version
- Optional accounts for integrations you enable

## Local Installation

1. Clone and enter the repository:

   ```bash
   git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
   cd YOUR_REPOSITORY
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a PostgreSQL database.

4. Add a root `.env` file using the example below.

5. Apply the schema:

   ```bash
   npm run db:push
   ```

   Alternatively, import `lucerne-boutique-schema.sql` or apply files from `migrations/` in order.

6. Start development:

   ```bash
   npm run dev
   ```

7. Open `http://localhost:5000` unless `PORT` is different.

## Environment Variables

Never commit `.env`, passwords, API keys, or service-account credentials.

```env
# Application
NODE_ENV=xxx
PORT=xxx
SESSION_SECRET=xxx

# PostgreSQL
DATABASE_URL=xxx
POSTGRES_URL=xxx

# Initial staff accounts
ADMIN_NAME=xxx
ADMIN_EMAIL=xxx
ADMIN_PASSWORD=xxx
EMPLOYEE_NAME=xxx
EMPLOYEE_EMAIL=xxx
EMPLOYEE_PASSWORD=xxx

# Firebase
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=xxx
VITE_FIREBASE_PROJECT_ID=xxx
VITE_FIREBASE_APP_ID=xxx
FIREBASE_PROJECT_ID=xxx

# Cloudinary
CLOUDINARY_CLOUD_NAME=xxx
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx

# Email
EMAIL_USER=xxx
EMAIL_PASS=xxx

# Payments
STRIPE_SECRET_KEY=xxx
STRIPE_PUBLISHABLE_KEY=xxx
STRIPE_WEBHOOK_SECRET=xxx
LAHZA_SECRET_KEY=xxx

# Twilio SMS, Verify, and WhatsApp
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_SMS_FROM=xxx
TWILIO_VERIFY_SERVICE_SID=xxx
TWILIO_WHATSAPP_FROM=xxx
TWILIO_OTP_TEMPLATE_SID=xxx
TWILIO_NOTIF_TEMPLATE_SID=xxx
ADMIN_WHATSAPP_PHONE=xxx

# AI (optional)
OPENAI_API_KEY=xxx
AI_INTEGRATIONS_OPENAI_API_KEY=xxx
AI_INTEGRATIONS_OPENAI_BASE_URL=xxx
GEMINI_API_KEY=xxx
GEMINI_MODEL=xxx
GEMINI_IMAGE_MODEL=xxx
OLLAMA_URL=xxx

# Optional database-backup executable override
PG_DUMP_PATH=xxx
```

Third-party integrations are optional. Enable their related features in admin settings only after configuring credentials.

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run Express and the Vite development app |
| `npm run check` | Run TypeScript checking |
| `npm run build` | Build the client and bundled server |
| `npm start` | Start `dist/index.cjs` in production |
| `npm run deploy` | Run the safe VPS deployment script (`deploy.sh`) |
| `npm run db:push` | Push the Drizzle schema to PostgreSQL |

## Production Deployment

Express serves both the API and built React app. `npm run build` now builds into a staging directory and only swaps `dist/` after both the frontend and backend succeed, so a failed build does not remove the currently working production bundle.

For the production VPS, configure the real credentials only in the server `.env` file, then run:

```bash
chmod +x deploy.sh
./deploy.sh
```

The safe deploy script fetches `origin/main`, installs locked dependencies **including the build-time devDependencies** (`tsx`, Vite, esbuild, Tailwind tooling), builds before restarting PM2, verifies `dist/index.cjs` and `dist/public/index.html`, waits for `/api/health` to return successfully, reloads Nginx, and verifies that the server commit matches GitHub. This is required even when the VPS has `NODE_ENV=production`, because npm would otherwise be allowed to omit the build tools. The script does not contain environment secrets.

For a first-time VPS setup, install PM2 and start the application once:

```bash
npm install --global pm2
npm ci --include=dev
npm run build
pm2 start dist/index.cjs --name lucerne
pm2 save
```

Example Nginx proxy:

```nginx
server {
    server_name your-domain.com www.your-domain.com;
    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

For another domain, update the CORS allow-list in `server/index.ts`. Configure HTTPS, `NODE_ENV=production`, a strong `SESSION_SECRET`, persistent uploads, and backups.

## Stripe Webhooks

Set the Stripe webhook endpoint to:

```text
https://your-domain.com/api/stripe/webhook
```

Save its signing secret as `STRIPE_WEBHOOK_SECRET`. Never expose server Stripe keys to the frontend.

## Desktop POS

```bash
cd pos-electron
npm install
npm start
```

Update `pos-electron/config.json` with the hosted app URL. On Windows, `START.bat` starts the POS and `BUILD_EXE.bat` builds the installer.

## Security Notes

- Keep secrets outside Git and rotate previously committed credentials.
- Use HTTPS for secure session cookies.
- Restrict CORS to trusted domains.
- Protect admin routes with role checks.
- Use least-privilege database/service accounts.
- Back up PostgreSQL and uploaded media.
- Review uploads and keep dependencies updated.

## Data and Media

Media can use Cloudinary or local `uploads/`. Local uploads are served from `/uploads`; use persistent storage and do not delete them during deployments. Back up production before migrations.

## Screenshots

Add real screenshots under `docs/screenshots/`, then add:

```markdown
![Storefront](docs/screenshots/storefront.png)
![Product page](docs/screenshots/product-page.png)
![Admin dashboard](docs/screenshots/admin-dashboard.png)
![Point of sale](docs/screenshots/pos.png)
```

## Troubleshooting

- **Database fails:** check `DATABASE_URL`, PostgreSQL, credentials, and firewall.
- **Firebase fails:** check variables and Firebase Authorized Domains.
- **Uploads fail:** check Cloudinary or local `uploads/` permissions.
- **Login does not persist:** check HTTPS, proxy headers, and `SESSION_SECRET`.
- **CORS blocks requests:** add the exact trusted origin in `server/index.ts`.
- **Stripe webhook fails:** check the endpoint and signing secret.
- **Desktop POS cannot connect:** update `pos-electron/config.json`.

## License

Package metadata currently declares MIT. Add a root `LICENSE` before public distribution. If the software is proprietary, update `package.json` and this section.

## Author

Developed by **Mohammad Adeela**.

---

If this project is useful, consider starring the repository.
