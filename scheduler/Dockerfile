# Scheduler Service Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install curl for health checks and cron for scheduling
RUN apk add --no-cache curl dcron

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy scheduler script
COPY scheduler.js ./

# Create entrypoint script
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Set timezone
ENV TZ=UTC

EXPOSE 3002

ENTRYPOINT ["./entrypoint.sh"]