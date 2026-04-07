# Battery Shop Management System

A full-stack battery shop management application with:
- Node.js + Express + TypeScript backend
- React frontend
- Electron desktop packaging

This repository is prepared for public sharing (source code only). Build outputs, installers, and secrets are excluded.

## Project Structure

- `backend/` API server (TypeScript, MongoDB, JWT auth)
- `frontend/` React web app
- `electron/` Electron main process

## Prerequisites

- Node.js 18+
- npm 9+
- MongoDB (local or Atlas)

## Install Dependencies

```bash
npm run install:all
```

## Environment Configuration

Create these files before running the app:

- `.env` (project root, optional for shared vars)
- `backend/.env` (required)
- `frontend/.env` (optional, only if overriding API URL for web)

Example `backend/.env`:

```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/battery_store_new_client
JWT_SECRET=replace_with_a_long_random_secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace_with_strong_password
WEBHOOK_VERIFY_TOKEN=replace_with_webhook_verify_token

# Optional
BASE_URL=http://127.0.0.1:5000
SERVE_FRONTEND=false
FRONTEND_BUILD_DIR=../frontend/build
STORE_NAME=My Store

# WhatsApp / Meta Cloud API
AccessToken=replace_with_whatsapp_access_token
NUMBER_ID=replace_with_number_id
WABA_ID=replace_with_waba_id
WHATSAPP_TEMPLATE_DOCUMENT=send_document_v1
WHATSAPP_TEMPLATE_WELCOME=customer_welcome
WHATSAPP_TEMPLATE_CLAIM=claim_update_v1
WHATSAPP_INCLUDE_STORE_NAME=false
```

Example `frontend/.env` (optional):

```env
REACT_APP_API_URL=http://127.0.0.1:5000
```

## Run in Development

Backend:

```bash
cd backend
npm run dev
```

Frontend (web):

```bash
cd frontend
npm start
```

## Build

Backend build:

```bash
npm run build:backend
```

Frontend build:

```bash
npm run build:frontend
```

Desktop frontend build (API URL fixed to local backend):

```bash
npm run build:frontend:desktop
```

## Run Desktop App (Electron)

```bash
npm run desktop:start
```

## Package Desktop App

Windows directory package:

```bash
npm run desktop:pack
```

Windows installer:

```bash
npm run desktop:dist
```

Portable build:

```bash
npm run desktop:dist:portable
```

## Security Notes

- Do not commit `.env` files or real credentials.
- The app now requires environment-based secrets for:
  - `JWT_SECRET`
  - `WEBHOOK_VERIFY_TOKEN`
  - `ADMIN_PASSWORD`
- Rotate any previously used secrets before production deployment.

## Scripts (Root)

- `npm run install:all`
- `npm run build:backend`
- `npm run build:frontend`
- `npm run build:frontend:desktop`
- `npm run build:all:desktop`
- `npm run desktop:start`
- `npm run desktop:pack`
- `npm run desktop:dist`
- `npm run desktop:dist:portable`
- `npm run desktop:dist:quick`

## License

No license has been defined yet. Add a license file before commercial/public distribution if needed.
