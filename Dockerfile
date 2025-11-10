# Build stage
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./

COPY prisma ./prisma/

ENV NODE_ENV=development
RUN npm install --include=dev --loglevel=error

RUN npx prisma generate

COPY tsconfig.json .
COPY src ./src
COPY scripts ./scripts

RUN npm run build

# Production stage
FROM node:22-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./

COPY prisma ./prisma/

COPY --from=builder /app/node_modules ./node_modules
RUN npm prune --omit=dev --loglevel=error || true

# Prisma client already generated in build stage

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts

RUN mkdir -p /app/uploads/payment-proofs /app/logs && \
	adduser --system --uid 1001 appuser && chown -R appuser /app
USER appuser

# Declare volumes for persistent data
VOLUME ["/app/logs", "/app/uploads"]

# Expose port
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node dist/src/healthcheck.js || exit 1

# Start application with migrations and seed
CMD ["sh","-c","npx prisma migrate deploy && node dist/scripts/autoSeed.js && node dist/src/index.js"]
