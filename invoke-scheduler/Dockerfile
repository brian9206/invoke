# Scheduler Service Dockerfile
FROM node:24-alpine

WORKDIR /app

# Install curl for health checks and cron for scheduling
RUN apk add --no-cache curl dcron

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy scheduler script
COPY scheduler.js ./

# Create entrypoint script
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 3002

ENV NODE_ENV=production
ENTRYPOINT ["./entrypoint.sh"]