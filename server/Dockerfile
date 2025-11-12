# Use Node.js official image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci --only=production
RUN npm run build

# Switch back to server directory
WORKDIR /app/server

# Expose port
EXPOSE 3333

# Start the application
CMD ["node", "index.js"]