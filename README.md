# FortLoot Backend

Backend API for FortLoot Fortnite gifting service.

## Tech Stack

- Node.js 22
- TypeScript
- Express
- Prisma (PostgreSQL)
- BullMQ (Redis)
- Docker

## Setup

1. Copy `.env.example` to `.env` and configure variables
2. Install dependencies: `npm install`
3. Run Prisma migrations: `npx prisma migrate deploy`
4. Start: `npm start`

## Development

```bash
npm run dev
```

## Docker

```bash
docker build -t fortloot-backend .
docker run -p 3001:3001 --env-file .env fortloot-backend
```

## Environment Variables

See `.env.example` for required configuration.
