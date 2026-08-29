# Clone Fixed 2 — CEL Dark Theme

# CEL Website Clone / Redesign

A working internal prototype for Central Electronics Limited featuring a modern public website, email-OTP account verification, persistent complaint tracking, comments, attachments, and a role-protected admin panel.

## Stack choice

This project uses a **single Node.js + Express application**, a responsive HTML/CSS/JavaScript frontend, and **SQLite** through `better-sqlite3`.

Why this stack:
- one command starts both frontend and backend;
- SQLite requires no separate database server;
- session and complaint data persist in local database files;
- it is easy to demonstrate, hand over, and later migrate to PostgreSQL;
- Nodemailer supports mock mode now and real SMTP later.

For a large public production deployment, migrate SQLite to PostgreSQL, place uploads in protected object storage, deploy behind HTTPS, and use an institutional SMTP/email provider.

## Included features

### Public website
- CEL identity header and tagline
- accessibility controls: font size, grayscale, high contrast, underlined links, readable font, reset
- responsive multi-level navigation
- hero section
- business-area cards
- CMD message
- current-news list
- quick links
- tender preview
- products and solutions
- partner-logo strip
- responsive footer and visitor display

### User portal
- user registration
- bcrypt password hashing
- six-digit email OTP with 10-minute expiry
- mock email mode for easy local testing
- secure session login/logout
- verified-account requirement
- complaint form with optional attachment
- automatic complaint IDs such as `CEL-2026-000001`
- persistent statuses: `Solved` and `Not Solved Yet`
- personal complaint dashboard
- complaint detail and conversation thread
- access control so users only see their own complaints

### Admin portal
- seeded admin account
- protected admin dashboard
- statistics cards
- all-user complaint table
- user names and emails
- status toggle
- official admin remarks
- comments visible to the user

### Security basics
- hashed passwords
- HTTP-only session cookie
- SQLite-backed session store
- rate limits on authentication and OTP routes
- server-side role checks
- input length limits and basic sanitisation
- restricted attachment extensions and 5 MB size limit
- Helmet security headers

## Folder structure

```text
cel-clone/
├── data/                  # SQLite DB and session DB (created at runtime)
├── public/
│   ├── assets/
│   ├── css/styles.css
│   ├── js/app.js
│   └── index.html
├── uploads/               # complaint attachments
├── .env.example
├── package.json
├── server.js
└── README.md
```

## Run locally

### 1. Install Node.js

Use Node.js 20 LTS or newer.

### 2. Open the project folder

```bash
cd cel-clone
```

### 3. Install dependencies

```bash
npm install
```

### 4. Create the environment file

macOS/Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Change `SESSION_SECRET` to a long random value.

### 5. Start the application

```bash
npm start
```

Open:

```text
http://localhost:3000
```

The database is created automatically in `data/cel.sqlite`.

## Demo admin login

```text
Email: admin@cel.local
Password: Admin@12345
```

Change these values in `.env` before starting the application for the first time. If the admin has already been seeded, update the database or delete the local development database and restart.

## OTP testing

The default setting is:

```env
EMAIL_MODE=mock
```

In mock mode, the OTP is:
- printed in the server terminal;
- returned to the registration screen for development convenience.

Do not return the OTP to the browser in production.

## Configure real Gmail SMTP

1. Enable two-step verification on the sending Google account.
2. Generate a Google App Password.
3. Update `.env`:

```env
EMAIL_MODE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-character-app-password
EMAIL_FROM="CEL Support <your-email@gmail.com>"
```

Restart the server.

For production, use CEL's approved institutional SMTP service rather than a personal Gmail account.

## Production recommendations

Before a public deployment:
- replace placeholder copy and illustrations with approved CEL material;
- use PostgreSQL;
- store files in a private bucket and return signed download links;
- add malware scanning for uploads;
- add CSRF tokens;
- add password reset and account lockout;
- add audit logs and status history;
- add a CMS for tenders, news, careers and pages;
- integrate Hindi translations;
- place the application behind HTTPS and a reverse proxy;
- remove mock OTP exposure;
- use secure secret management;
- conduct accessibility, security and penetration testing.

## Reference

The public navigation structure and homepage content pattern were modelled from CEL's official website for this authorised internal prototype. The included artwork and copy are placeholders and can be replaced with approved source material.
