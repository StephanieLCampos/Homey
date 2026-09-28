#!/bin/bash
#
# DEVELOPMENT STARTUP SCRIPT
#
# Convenience launcher for local development. It verifies that Node.js and npm
# are present, installs dependencies for client/ and server/ if their
# node_modules directories are missing, then starts both processes in the
# background: the Express API from server/ and the webpack dev server from
# client/. A trap on SIGINT/SIGTERM stops both together, so Ctrl+C shuts the
# whole stack down rather than orphaning the backend.
#
# Usage: ./start.sh   (from the repository root)
#
# Connections:
#   - server/index.js      - the backend process started here.
#   - client/package.json  - the `dev` script that serves the front end on :3000.
#   - client/webpack.config.js - proxies /api from :3000 to the backend.
#
# Notes:
#   - MongoDB is NOT started by this script; start it separately (see the README)
#     or the server will exit on a failed connection.
#   - The messages announce port 5000, which is neither the port the server
#     defaults to (5001) nor the one server/.env sets (3333). Treat the printed
#     backend URL as decorative and use the port from server/.env. The webpack
#     proxy is hard-coded to 3333 and is the one that must match.
#   - `npm install --force` is used to push past peer-dependency conflicts; it
#     can mask genuine version incompatibilities.

echo "🏠 Starting Roommate Finder App..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"

# Install dependencies if needed
if [ ! -d "client/node_modules" ]; then
    echo "📦 Installing client dependencies..."
    cd client
    npm install --force
    cd ..
fi

if [ ! -d "server/node_modules" ]; then
    echo "📦 Installing server dependencies..."
    cd server
    npm install --force
    cd ..
fi

echo "🚀 Starting the application..."

# Start the server in the background
echo "🔧 Starting backend server on port 5000..."
cd server
node index.js &
SERVER_PID=$!
cd ..

# Wait a moment for server to start
sleep 2

# Start the client
echo "🎨 Starting frontend development server on port 3000..."
cd client
npm run dev &
CLIENT_PID=$!
cd ..

echo ""
echo "🎉 Application started successfully!"
echo ""
echo "📱 Frontend: http://localhost:3000"
echo "🔧 Backend: http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Stop both child processes on exit so Ctrl+C does not leave the backend running
# and holding its port.
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $SERVER_PID 2>/dev/null
    kill $CLIENT_PID 2>/dev/null
    echo "✅ Servers stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for both processes
wait
