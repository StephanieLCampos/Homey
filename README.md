# Roommate Finder App

A Tinder-like roommate finder application with group functionality, built with React, TypeScript, and Node.js.

## Features

### Core Functionality
- **Tinder-like Swiping**: Swipe right to like, left to pass on potential roommates
- **Smart Matching**: Algorithm-based compatibility matching based on preferences
- **Group Creation**: Merge individual profiles into shared group profiles when matched
- **Group Management**: Collaborative group management with voting system
- **Messaging System**: Real-time messaging with group restrictions
- **Preference-based Filtering**: Comprehensive preference system for better matches

### Key Features
- **Object-Oriented Design**: Clean class-based architecture with TypeScript
- **Real-time Communication**: Socket.io for instant messaging and notifications
- **Responsive UI**: Modern, mobile-first design with smooth animations
- **Group Voting**: Democratic system for adding new group members
- **Profile Suspension**: Individual profiles are suspended when joining groups
- **Compatibility Algorithm**: Multi-factor compatibility scoring
- **User Authentication**: JWT-based secure login and registration system
- **Photo Upload**: Profile photo upload during registration and in profile management
- **Modern Design**: Sage green color scheme with gradient buttons and shadows
- **Profile Management**: Comprehensive profile editing with preferences

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Webpack** for bundling
- **CSS3** with modern features (Grid, Flexbox, Animations)
- **Socket.io Client** for real-time communication

### Backend
- **Node.js** with Express
- **Socket.io** for real-time features
- **MongoDB** with Mongoose for data persistence
- **RESTful API** design

## Project Structure

```
Homey_webv1/
├── client/                 # React frontend
│   ├── src/
│   │   ├── classes/        # Core business logic classes
│   │   │   ├── User.ts
│   │   │   ├── Group.ts
│   │   │   ├── MatchingSystem.ts
│   │   │   ├── MessagingSystem.ts
│   │   │   └── ProfileManager.ts
│   │   ├── components/     # React components
│   │   │   ├── Auth/       # Authentication components
│   │   │   │   ├── AuthPage.tsx
│   │   │   │   ├── LoginForm.tsx
│   │   │   │   └── RegisterForm.tsx
│   │   │   ├── SwipeCard.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── Profile.tsx
│   │   │   ├── MatchesList.tsx
│   │   │   ├── GroupManagement.tsx
│   │   │   └── MessagingInterface.tsx
│   │   ├── services/       # API services
│   │   │   └── authService.ts
│   │   ├── types/          # TypeScript interfaces
│   │   │   ├── index.ts
│   │   │   └── images.d.ts
│   │   ├── images/         # Static images
│   │   │   ├── default_user.png
│   │   │   └── sample_user1.png
│   │   ├── App.tsx
│   │   ├── index.tsx
│   │   └── index.css
│   ├── public/
│   │   └── index.html
│   ├── dist/               # Built files (generated)
│   ├── package.json
│   ├── tsconfig.json
│   └── webpack.config.js
├── server/                 # Node.js backend
│   ├── models/             # MongoDB schemas
│   │   ├── User.js
│   │   └── Group.js
│   ├── routes/             # API routes
│   │   ├── auth.js
│   │   ├── users.js
│   │   └── groups.js
│   ├── middleware/         # Express middleware
│   │   └── auth.js
│   ├── .env               # Environment variables
│   ├── index.js           # Main server file
│   └── package.json
└── README.md
```

## Core Classes

### User Class
- Manages individual user profiles and preferences
- Handles compatibility checking with other users
- Manages profile state (active, suspended, in group)

### Group Class
- Manages group profiles and member lists
- Handles group voting system for new members
- Manages group preferences and settings

### MatchingSystem Class
- Implements Tinder-like swiping functionality
- Manages match creation and status
- Handles potential match generation

### MessagingSystem Class
- Manages real-time messaging between users and groups
- Enforces group messaging restrictions
- Handles message delivery and read status

### ProfileManager Class
- Central manager for users and groups
- Handles profile merging and suspension
- Manages group creation and member management

## Getting Started

### Prerequisites
- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **Docker** (for MongoDB) - [Download here](https://www.docker.com/get-started)
- **npm** (comes with Node.js)

### Quick Setup Steps

Follow these exact steps to get the application running:

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Homey_webv1
   ```

2. **Install client dependencies**
   ```bash
   cd client
   npm install
   ```

3. **Install server dependencies**
   ```bash
   cd ../server
   npm install
   ```

4. **Start MongoDB using Docker**
   ```bash
   docker run -d -p 27017:27017 --name homey-mongodb mongo:latest
   ```
   
   **Note**: If you get a "Docker daemon not running" error, make sure Docker Desktop is installed and running.

5. **Configure environment variables**
   
   The server should already have a `.env` file, but verify it contains:
   ```bash
   # In server/.env
   MONGODB_URI=mongodb://localhost:27017/homey_roommate_app
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   NODE_ENV=development
   PORT=3333
   ```

6. **Build the client**
   ```bash
   cd client
   npm run build
   ```

7. **Start the server**
   ```bash
   cd ../server
   npm start
   ```
   
   **Success indicators:**
   - You should see: "Server running on http://localhost:3333"
   - You should see: "Connected to MongoDB"
   - Sample users (Alex, Sam, Mike) will be automatically created

Note if too many authentication attempts: lsof -ti:3333 | xargs kill
Note:  && npm start

Reset server:
lsof -ti:3333 -> check if server still running and get PID
kill 37809 
run in the sever folder: && node index.js &
8. **Access the application**
   
   Open your browser and go to: **http://localhost:3333**
   
   This serves both the frontend and API from the same Express server:
   - Frontend: http://localhost:3333
   - API: http://localhost:3333/api

### Development Mode

For development with hot reloading:

1. **Start MongoDB** (as above)

2. **Start the server**
   ```bash
   cd server
   npm run dev
   ```
NOTE: if issue with process, kill process on port 3333: lsof -ti:3333
3. **Start the client development server** (in another terminal)
   ```bash
   cd client
   npm start
   ```
   
   In development mode:
   - Client runs on http://localhost:3000
   - Server runs on http://localhost:3333/api

## Troubleshooting

### Common Issues and Solutions

#### 1. "ERR_CONNECTION_REFUSED" in Browser

**Problem**: Browser shows "This site can't be reached" or "ERR_CONNECTION_REFUSED"

**Solutions**:
```bash
# Check if server is running
ps aux | grep "node index.js"

# If not running, restart server
cd server
npm start

# If still not working, try hard refresh
# Mac: Cmd+Shift+R
# Windows/Linux: Ctrl+Shift+R

# Or open incognito/private window to bypass cache
```

#### 2. MongoDB Connection Issues

**Problem**: Server shows "MongoDB connection error" or "Invalid scheme"

**Solutions**:
```bash
# Check if MongoDB container is running
docker ps

# If not running, start MongoDB
docker run -d -p 27017:27017 --name homey-mongodb mongo:latest

# If container already exists but stopped
docker start homey-mongodb

# Check .env file format (should NOT have ${} syntax)
# Correct: MONGODB_URI=mongodb://localhost:27017/homey_roommate_app
# Incorrect: MONGODB_URI=${MONGODB_URI:-mongodb://localhost:27017/homey_roommate_app}
```

#### 3. Docker Issues

**Problem**: "Cannot connect to Docker daemon" or "Docker command not found"

**Solutions**:
```bash
# Install Docker Desktop from https://www.docker.com/get-started
# Make sure Docker Desktop is running (check system tray/menu bar)

# Alternative: Install MongoDB locally (macOS with Homebrew)
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# Then use: MONGODB_URI=mongodb://localhost:27017/homey_roommate_app
```

#### 4. Build/Compilation Errors

**Problem**: TypeScript errors or webpack build failures

**Solutions**:
```bash
# Clean install dependencies
cd client
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build

# Common fixes for image import errors:
# Make sure webpack.config.js has image loader:
# {
#   test: /\.(png|svg|jpg|jpeg|gif)$/i,
#   type: 'asset/resource',
# }
```

#### 5. Port Already in Use

**Problem**: "EADDRINUSE: address already in use :::3333"

**Solutions**:
```bash
# Find process using port 3333
lsof -ti:3333

# Kill the process (replace PID with actual process ID)
kill -9 PID

# Or kill all node processes
pkill -f "node index.js"

# Then restart server
cd server
npm start
```

#### 6. Client Not Loading After Server Restart

**Problem**: Server runs but website doesn't load changes

**Solutions**:
```bash
# Rebuild client after making changes
cd client
npm run build

# Server will automatically serve updated build
# No need to restart server after rebuilding client

# If still not working, restart server
cd ../server
pkill -f "node index.js"
npm start
```

#### 7. Missing Dependencies

**Problem**: "Module not found" errors

**Solutions**:
```bash
# Install missing dependencies
cd client
npm install

cd ../server
npm install

# If specific module missing, install individually:
# npm install <module-name>
```

### Checking System Status

Use these commands to verify everything is working:

```bash
# 1. Check Docker containers
docker ps
# Should show homey-mongodb container running

# 2. Check server status
curl -s -o /dev/null -w "%{http_code}" http://localhost:3333
# Should return 200

# 3. Check MongoDB connection
# Server logs should show "Connected to MongoDB"

# 4. Check server processes
ps aux | grep "node index.js"
# Should show running node process
```

### Reset Everything (Nuclear Option)

If nothing works, start fresh:

```bash
# Stop all processes
pkill -f "node index.js"
docker stop homey-mongodb
docker rm homey-mongodb

# Clean dependencies
cd client
rm -rf node_modules package-lock.json
npm install
npm run build

cd ../server
rm -rf node_modules package-lock.json
npm install

# Restart everything
docker run -d -p 27017:27017 --name homey-mongodb mongo:latest
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user profile
- `PUT /api/auth/profile` - Update user profile

### Users
- `GET /api/user/:id` - Get user by ID
- `GET /api/users/:id/matches` - Get potential matches for user

### Matching
- `POST /api/swipe` - Record swipe action
- `GET /api/users/:id/matches` - Get user's matches

### Groups
- `POST /api/groups` - Create new group
- `GET /api/users/:id/group` - Get user's group
- `POST /api/groups/:groupId/propose` - Propose new member
- `POST /api/groups/:groupId/vote` - Vote on proposed member

### Messaging
- `POST /api/messages` - Send message
- `GET /api/messages/:conversationId` - Get conversation messages

**Note**: All endpoints except registration and login require JWT authentication via `Authorization: Bearer <token>` header.

## User Preferences

The app uses a comprehensive preference system:

- **Age Range**: Minimum and maximum age preferences
- **Gender**: Preferred gender(s) for roommates
- **Budget**: Maximum rent amount
- **Cleanliness Level**: 1-5 scale (1 = very messy, 5 = very clean)
- **Noise Tolerance**: 1-5 scale (1 = very quiet, 5 = very loud)
- **Pet Friendly**: Boolean preference
- **Smoking**: Boolean preference
- **Location**: City and state preferences

## Group Functionality

### Group Creation
1. Two matched users can create a group
2. Individual profiles are suspended
3. Group profile is created with merged preferences
4. Users can only message within the group

### Group Management
- **Member Proposals**: Any group member can propose new users
- **Voting System**: Democratic voting on new members
- **Group Preferences**: Shared preferences for the group
- **Group Photos**: Combined photos from all members

### Voting System
- Majority vote required to add new members
- All group members must vote
- Real-time vote counting and notifications

## Messaging System

### Individual Messaging
- Users can message other individual users
- Real-time message delivery
- Read status tracking

### Group Messaging
- Group members can message within the group
- Messages are visible to all group members
- Real-time group chat functionality

### Restrictions
- Users in groups can only message within their group
- Individual users cannot message group members
- Group members cannot message outside their group

## Development

### Adding New Features
1. Create new classes in `client/src/classes/`
2. Add TypeScript interfaces in `client/src/types/`
3. Create React components in `client/src/components/`
4. Add API endpoints in `server/index.js`

### Database
The application uses MongoDB for data persistence:

- **MongoDB**: Document database for storing users, groups, matches, and messages
- **Mongoose**: ODM for MongoDB with schema validation
- **Docker**: MongoDB runs in a Docker container for easy setup
- **Sample Data**: Automatically creates sample users when database is empty

### Testing
- Add unit tests for classes
- Add integration tests for API endpoints
- Add end-to-end tests for user flows

## Deployment

### Option 1: Local Network Access
Share with others on your WiFi network:
```bash
# Find your IP address
ifconfig | grep "inet " | grep -v 127.0.0.1

# Share this URL: http://YOUR_IP:3333
# Example: http://192.168.1.100:3333
```

### Option 2: Cloud Deployment

#### Railway (Recommended - Free)
1. **Create account**: [railway.app](https://railway.app)
2. **Connect GitHub**: Link your repository
3. **Add MongoDB**: Add MongoDB service in Railway dashboard
4. **Deploy**: Railway will automatically deploy from your repo
5. **Set environment variables**:
   - `MONGODB_URI`: Use Railway's MongoDB connection string
   - `JWT_SECRET`: Generate secure secret
   - `NODE_ENV`: production

#### Alternative Platforms
- **Heroku**: Free tier with MongoDB Atlas
- **Render**: Free tier with built-in PostgreSQL
- **Vercel**: For frontend + Serverless functions
- **Netlify**: For frontend + Netlify functions

### Environment Variables for Production
```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/homey_db
JWT_SECRET=your-super-long-random-secret-key-here
NODE_ENV=production
PORT=3333
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Future Enhancements

- [x] Database integration (MongoDB)
- [x] User authentication and authorization (JWT)
- [x] Photo upload and management
- [x] Profile management and editing
- [x] Modern UI design with sage green theme
- [x] Default user images and sample data
- [ ] Advanced matching algorithms
- [ ] Push notifications
- [ ] Mobile app (React Native)
- [ ] Admin dashboard
- [ ] Analytics and reporting
- [ ] Payment integration for premium features
- [ ] Integration with rental platforms
- [ ] Email verification
- [ ] Password reset functionality
- [ ] Photo cropping and filters
- [ ] Location-based matching


## Users and passwords:
- all fake users:
   first_name@example.com
   password: password123

   seanlai@gmail.com
   password: abcd1234

   ashikab@gmail.com
   password: abcd1234

   stephaniec.1646@gmail.com
   password: abcd1234

ALL USERS:
'Stephanie Louise Campos',
  'Mia C',
  'Test User',
  'Test User 2',
  'Test User 3',
  'Test User 4',
  'Test User 5',
  'Sean Lai',
  'Ashika B',
  'Sam Chen',
  'Mike Rodriguez'
  'Alex Johnson'

