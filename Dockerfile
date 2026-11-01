# syntax=docker/dockerfile:1
# LibraryHub web server image (Assignment 2, Part I).
#   docker build -t <dockerhub-user>/libraryhub:1.0 .

# Stage 1: install production dependencies only, so the npm cache stays out of the final image.
FROM node:22-alpine AS deps
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Stage 2: runtime image = Node.js web server + application code.
FROM node:22-alpine
LABEL org.opencontainers.image.title="LibraryHub" \
      org.opencontainers.image.description="Library Management System (Node.js 22 + Express + MySQL)" \
      org.opencontainers.image.authors="Amna Ahmad" \
      org.opencontainers.image.source="https://github.com/amnaahmadh/libraryhub-devops"

ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY app/ ./

# Code stays owned by root and read-only; the server runs as the unprivileged "node" user.
USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --start-interval=2s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
