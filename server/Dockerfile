# CONTAINER IMAGE for the Homey server
#
# Builds a single image that serves both the API and the compiled front end:
# server dependencies are installed, the client is built, and the container then
# runs the Express process from server/ on port 3333.
#
# Connections:
#   - server/index.js         - the entry point started by CMD.
#   - client/webpack.config.js - produces the bundle served statically.
#   - railway.json            - the actual deployment path used for this project,
#                               which builds with Nixpacks rather than this file.
#
# Notes:
#   - Expects the repository root as the build context, since it copies client/.
#     Building with server/ as the context will fail at the client stage.
#   - The final WORKDIR assumes a server/ directory inside the image, which the
#     COPY steps above do not create at that path; this file has not been
#     exercised since the project moved to Nixpacks deployment on Railway.
#   - `npm ci --only=production` skips devDependencies, which the client build
#     (webpack, ts-loader) requires.
#
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