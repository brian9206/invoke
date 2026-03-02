# Scheduler Service Dockerfile
# Build context must be the monorepo root
FROM node:24-alpine

# Install curl for health checks and cron for scheduling
RUN apk add --no-cache curl dcron

WORKDIR /app

# Copy root workspace manifest and lockfile
COPY package.json package-lock.json ./

# Copy workspace package manifest (needed before npm ci)
COPY invoke-scheduler/package.json ./invoke-scheduler/

# Install dependencies for scheduler workspace only
RUN npm ci --omit=dev -w invoke-scheduler

# Copy scheduler source
COPY invoke-scheduler/ ./invoke-scheduler/

WORKDIR /app/invoke-scheduler

RUN chmod +x entrypoint.sh

EXPOSE 3002

ENV NODE_ENV=production
ENTRYPOINT ["./entrypoint.sh"]