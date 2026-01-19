# Admin Service Dockerfile
FROM node:24-alpine

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy source code and shared modules
COPY . .

# Build Next.js application
RUN npm run build

# Expose port
EXPOSE 3000

# Health check - check if the app is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Start the service
ENV NODE_ENV=production
CMD ["npm", "start"]