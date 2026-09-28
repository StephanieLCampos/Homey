# Homey — Group-Aware Roommate Finder

Homey is a full-stack web application for finding roommates. It borrows the
swipe-and-match interaction people already understand from dating apps, then
adds the thing that actually makes house-sharing hard: **groups**.

Most roommate tools match people one to one. But a three-bedroom flat is not
three independent decisions — once two people agree to live together, they need
to look for a third *as a pair*, with a shared budget and shared standards. Homey
models that directly. Two matched users can merge into a group; the group gets
its own profile with reconciled preferences, and from then on the group is the
thing that swipes, is swiped on, and holds a conversation. The members'
individual profiles are paused until they leave.

That single rule — **a person is represented either as an individual or by a
group, never both** — is the spine of the system. Most of the non-obvious code in
this repository exists to enforce it consistently across matching, messaging and
profile visibility.

---

---

## Contents

**Understanding the project**
[Team](#team) · [Feature Overview](#feature-overview) · [Tech Stack](#tech-stack) ·
[System Design](#system-design) · [How the Pieces Fit Together](#how-the-pieces-fit-together) ·
[Design Decisions Worth Noting](#design-decisions-worth-noting) ·
[Repository Layout](#repository-layout) · [Core Classes](#core-classes)

**Running and operating it**
[Getting Started](#getting-started) · [Troubleshooting](#troubleshooting) ·
[API Endpoints](#api-endpoints) · [User Preferences](#user-preferences) ·
[Group Functionality](#group-functionality) · [Messaging System](#messaging-system) ·
[Development](#development) · [Deployment](#deployment) ·
[Maintenance Commands](#maintenance-commands) · [Contributing](#contributing) ·
[License](#license)

> If you are reviewing this as a portfolio project, the sections worth your time
> are **System Design**, **How the Pieces Fit Together** and **Design Decisions
> Worth Noting** — they cover the group model, which is what makes this more than
> a swipe-app clone.

---

## Team

Homey was built by a team of **three contributors** as a collaborative project.

| Contributor | Attribution in this repository |
|---|---|
| Stephanie Campos | Commits across client, server and group functionality |
| Sean Lai | Commits covering the external database integration and group functionality |

Work was not split cleanly by layer — the git history shows contributors touching
client, server and the group feature alike. The group functionality in particular
was built collaboratively over several iterations (see the commits from
November–December 2025).

---

## Feature Overview

### Core functionality
- **Swipe-based discovery** — swipe right to like, left to pass on potential roommates.
- **Mutual matching** — when two users like each other a match is created automatically and a conversation opens.
- **Group formation** — two matched users can merge into a shared group profile with reconciled preferences.
- **Group matching** — groups swipe on individuals and appear in individuals' decks as joinable cards.
- **Group membership** — outsiders join by invitation from a member, or by requesting to join and being accepted.
- **Real-time messaging** — direct and group conversations over Socket.io, with group-scoped restrictions.
- **Preference filtering** — age, budget, cleanliness, noise, pets, smoking, gender and location.

### Supporting features
- **JWT authentication** — registration, login, password change, and session restore.
- **Photo upload** — profile and group photos, uploaded inline at registration or from the profile editor.
- **Profile lifecycle** — profiles can be paused, reactivated, or deactivated, with full relational cleanup.
- **Typed client domain model** — TypeScript classes (`User`, `Group`) plus shared interfaces mirroring the server schemas.
- **Unit-tested domain logic** — Jest suites over the client classes.
- **Responsive UI** — sage-green theme, gradient buttons, mobile-first swipe gestures.

---

## Tech Stack

### Frontend
- **React 18** with **TypeScript** (strict mode)
- **Webpack 5** for bundling, with a dev server that proxies the API
- **Socket.io Client** for real-time messaging and notifications
- **CSS3** — Grid, Flexbox and animations, in a single global stylesheet
- **Jest** + **ts-jest** for unit tests

### Backend
- **Node.js** with **Express 4**
- **MongoDB** with **Mongoose 8** for persistence
- **Socket.io** for real-time delivery
- **JWT** (`jsonwebtoken`) for stateless authentication, **bcryptjs** for password hashing
- **helmet**, **express-rate-limit** and **express-validator** for baseline hardening

### Infrastructure
- **Docker** for the local MongoDB instance
- **Railway** (Nixpacks) for deployment — see `railway.json`

---

## System Design

### High-level shape

Homey is a two-tier application with a shared real-time channel. In production a
single Express process serves both the compiled React bundle and the API, so
there is one origin and no CORS layer to configure.

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│                                                              │
│   React (client/src)                                         │
│     App.tsx ......... owns all application state             │
│       ├── Header ............ navigation                     │
│       ├── SwipeCard ......... discovery deck                 │
│       ├── MatchesList ....... matches / invitations          │
│       ├── GroupManagement ... group chat, profile, requests  │
│       ├── MessagingInterface  direct chat, group requests    │
│       ├── Profile ........... own profile + deactivation     │
│       ├── Search ............ email lookup + outreach        │
│       └── FilterPanel ....... discovery filters              │
│                                                              │
│   authService ....... JWT in localStorage, /api/auth calls   │
└───────────────┬──────────────────────────┬───────────────────┘
                │ REST (fetch)             │ Socket.io
                │ Authorization: Bearer    │ token in handshake
┌───────────────▼──────────────────────────▼───────────────────┐
│  Express (server/index.js)                                   │
│                                                              │
│   routes/auth.js ......... /api/auth/*  (register, login…)   │
│   index.js ............... everything else (see below)       │
│   middleware/auth.js ..... verifies JWT, re-reads the user   │
│   Socket.io .............. one room per user id              │
│                                                              │
│   express.static('../client/dist')  ← serves the bundle      │
└───────────────────────────┬──────────────────────────────────┘
                            │ Mongoose
┌───────────────────────────▼──────────────────────────────────┐
│  MongoDB                                                     │
│   users · groups · matches · groupmatches · swipeactions     │
│   messages · grouprequests · groupjoinrequests               │
│   usergrouphistories                                         │
└──────────────────────────────────────────────────────────────┘
```

### Layer responsibilities

| Layer | Location | Responsibility |
|---|---|---|
| Domain models | `server/models/` | Mongoose schemas, validation, invariants, derived status flags |
| API | `server/index.js`, `server/routes/auth.js` | Authorisation, orchestration, cross-collection consistency |
| Real-time | `server/index.js` (Socket.io) | Push notifications to affected users |
| State + routing | `client/src/App.tsx` | All application state; every API call for the main flows |
| Presentation | `client/src/components/` | Rendering and user intent; raised to `App.tsx` via callbacks |
| Client domain | `client/src/classes/` | Typed domain model and the reference implementation of the rules |
| Session | `client/src/services/authService.ts` | Token storage, auth endpoints, auth headers |

A deliberate consequence of this layout: **components hold almost no state**.
`App.tsx` owns the user, the deck, the matches and the filters, and passes
callbacks down. The two exceptions are `GroupManagement` and
`MessagingInterface`, which own their own conversation state and Socket.io
connections because their data is high-frequency and local to the view.

### Data model

Nine collections, with the relationships that matter:

```
User ──────────────┬── groupId ──────────────► Group
  │                │                            │
  │                └── status: individual |     ├── memberIds[] ──► User
  │                    in_group | seeking       ├── pendingVotes: Map<userId, Ballot[]>
  │                    profileStatus: active |  ├── inviteCode
  │                    paused | deactivated     └── target_status / group_status
  │                                                (derived: full/not_full, active/paused)
  │
  ├── SwipeAction ── swipeType: user_to_user | user_to_group | group_to_user
  │        │
  │        ├─ mutual likes ──► Match         (user ↔ user)
  │        └─ group like ────► GroupMatch    (group ↔ user)
  │
  ├── Message ── receiverId (direct) XOR groupId (group), messageType: text|image|system
  │
  ├── GroupRequest ...... two individuals agreeing to *form* a group
  ├── GroupJoinRequest .. an outsider asking to join an *existing* group
  └── UserGroupHistory .. archive of swipes/matches deleted on joining a group
```

Two modelling decisions are worth calling out:

- **`Match` and `GroupMatch` are separate collections** rather than one
  polymorphic table. A user-to-user match is symmetric and needs no initiator; a
  group-to-user match is directional (`initiatedBy`, `groupMemberInitiator`) and
  accepting it mutates group membership. Merging them would have meant a schema
  where half the fields are always null.

- **`Group.target_status` and `group_status` are derived, never assigned.** They
  are recomputed in the schema's pre-save hook from `memberIds.length` against
  `maxMembers`. A full group is automatically paused, which removes it from
  other users' decks and stops it sending likes — capacity enforcement falls out
  of the model rather than being re-checked at each call site.

---

## How the Pieces Fit Together

### Flow 1 — discovery and matching

```
SwipeCard (gesture)
   └─► App.handleSwipe(userId, 'like' | 'pass')
          │
          ├─ target is a group card (`group_` prefix)
          │     └─► POST /api/groups/:id/join-request      → GroupJoinRequest
          │
          ├─ current user is in a group
          │     └─► POST /api/group/:groupId/swipe         → SwipeAction (group_to_user)
          │                                                 → GroupMatch (pending)
          │                                                 → socket: groupMatch → target
          │
          └─ current user is an individual
                └─► POST /api/swipe                        → SwipeAction (user_to_user)
                      └─ reciprocal like exists?
                            └─► Match (status: accepted)
                                → socket: match → both users
```

The deck itself comes from `GET /api/users/:id/potential-matches`, which
assembles two different things into one array: eligible individuals (minus
everyone already swiped on or matched with, then narrowed by the query-string
filters) and eligible groups, flattened into the same card shape with
`isGroup: true` and an id prefixed `group_`.

### Flow 2 — the id-prefix protocol

`GET /api/users/:id/matches` returns four kinds of record in one array. They are
distinguished by an **id prefix**, which is the contract between server and
client — `MatchesList.tsx` uses it to decide which card to render, and
`App.tsx` uses it to decide which endpoint an accept or decline should hit:

| Prefix | Meaning | Accepting it means |
|---|---|---|
| `pending_<swipeId>` | Someone liked you; no match record exists yet | Swipe right back, which creates the `Match` |
| `group_match_<id>` | A group invited you | `POST /api/group-matches/:id/accept` — you join the group |
| `group_<id>` | A group you could ask to join | `POST /api/groups/:id/join-request` |
| bare ObjectId | A real `Match` document | `POST /api/matches/:id/accept` |

This is why `App.tsx` has a `normalizeId` helper and why the accept/decline
handlers are written as prefix dispatches rather than single calls.

### Flow 3 — group formation, the central transition

Forming a group is the most involved write path in the system, because it has to
unwind the individual identity that the two users had until that moment.

```
MessagingInterface → "Request group"
   └─► POST /api/group-requests                    → GroupRequest (pending)
          └─ recipient accepts
                └─► POST /api/group-requests/:id/respond { accept }
                       1. merge both preference sets (see below)
                       2. create the Group
                       3. re-point existing matches between members → status 'group'
                       4. both users → status 'in_group', profileStatus 'paused'
                       5. socket: groupFormed → both members
```

**Preference merging** is conservative by design — the group profile must satisfy
*both* members, not either one:

| Field | Rule |
|---|---|
| Age range | Intersected (highest min, lowest max) |
| Preferred genders | Set intersection |
| Max rent | The **lower** of the two budgets |
| Cleanliness / noise | Averaged and rounded |
| Pets / smoking | Logical AND — a "no" from either member wins |
| Location | Taken from the requester, with fallbacks |

Joining an *existing* group (via `POST /api/group-matches/:id/accept`) does more
still, and the **ordering is deliberate**:

1. Snapshot the joiner's swipes and matches into `UserGroupHistory` — so the
   deletion in step 2 is recoverable.
2. Delete those swipes and matches, and emit `matchInvalidated` to every affected
   counterpart so stale cards vanish from their open clients.
3. Add the user to the group.
4. Flip them to `in_group` / `paused`.
5. **Only now** mark the invitation accepted, and drop their other pending
   invitations.

Marking the invitation accepted early was the original implementation, and it
produced a real bug: if a later step threw, the user ended up with an "accepted"
invitation to a group they were not in, and could never see that invitation
again. `server/detect_and_fix_orphaned_group_matches.js` exists to repair
records left in that state.

### Flow 4 — messaging and its restrictions

```
individual ──► GET /api/conversations       (accepted matches, minus anyone now in a group)
in a group ──► GET /api/group-conversations (returns the single group thread)
```

The restriction is enforced at the point of sending: `POST /api/messages`
requires group **membership** for a group message, and an **accepted match** for
a direct message. A user in a group therefore receives an empty array from
`/api/conversations` — which is why `MessagingInterface` distinguishes "no
conversations yet" from "you are in a group", and explains the latter rather than
showing a bare empty state.

### Flow 5 — real-time notifications

Socket.io rooms are named by user id, so `io.to(userId).emit(...)` reaches a user
on every device and tab. Three separate client sockets subscribe to the events
each one cares about:

| Client | Listens for | Because |
|---|---|---|
| `App.tsx` | `matchInvalidated`, `groupUpdated`, `memberLeft` | These invalidate the deck and matches list |
| `MessagingInterface` | `message`, `groupRequestReceived/Rejected`, `groupFormed`, `leftGroup`, `groupDissolved`, `memberLeft` | These change which conversations exist |
| `GroupManagement` | `message`, `groupJoinRequest`, `joinRequestAccepted/Rejected`, `memberLeft`, `groupDissolved` | These change group membership |

---

## Design Decisions Worth Noting

These are the choices an interviewer is most likely to ask about, with the
reasoning behind them.

**The compatibility filter is implemented but not applied to the deck.**
`User.isCompatibleWith` (both client and server) is a strict, symmetric,
all-or-nothing filter. Applied to a small user base it left decks empty, so the
`potential-matches` endpoint surfaces candidates broadly and lets the explicit
filter panel do the narrowing. The disabled call is left in place, and the method
is fully unit-tested — it is a deliberate product trade-off, not dead code.

**Swipes are written through the raw MongoDB driver, not Mongoose.**
In `POST /api/swipe`, new swipe documents bypass the model. Mongoose writes
explicit `null`s into the unused `groupId` / `targetGroupId` fields, and a `null`
participates in the sparse unique indexes — so a user's *second* swipe collided
with their first. Inserting through the driver keeps those fields absent
entirely, so the sparse indexes do not apply to them.

**Individual matching state is archived, then deleted, and never restored.**
Joining a group snapshots swipes and matches to `UserGroupHistory` before
deleting them. Leaving a group stamps `leftAt` on that record but deliberately
does *not* restore the data — leaving it deleted is what lets the user be
rematched from scratch rather than resurfacing stale likes from before they were
in a group.

**Photos are stored as base64 data URLs on the document.**
There is no upload endpoint or object storage; images are read client-side with
`FileReader` and travel inline in the JSON payload, which is why the photo
validators accept `data:` URLs. This is the clearest scaling limitation in the
codebase and the first thing a production version would change.

**Several flows respond to a state change by reloading the page.**
Group formation invalidates the user's status, deck, matches and conversations at
once. Rather than reconciling each, the affected handlers hard-reload. Blunt, but
correct — and it was a conscious choice to prioritise correctness over polish on
the least frequent transition in the app.

---

## Repository Layout

```
Homey/
├── client/                        # React + TypeScript frontend
│   ├── src/
│   │   ├── classes/               # Domain model
│   │   │   ├── User.ts            #   instantiated from API responses
│   │   │   └── Group.ts           #   group profile and preferences
│   │   ├── components/
│   │   │   ├── Auth/              #   AuthPage, LoginForm, RegisterForm
│   │   │   ├── SwipeCard.tsx      #   draggable discovery card
│   │   │   ├── MatchesList.tsx    #   matches, invitations, joinable groups
│   │   │   ├── GroupManagement.tsx#   group chat, profile, join requests
│   │   │   ├── MessagingInterface.tsx
│   │   │   ├── Profile.tsx        #   own profile, editing, deactivation
│   │   │   ├── Search.tsx         #   email lookup + outreach
│   │   │   ├── FilterPanel.tsx    #   discovery filters
│   │   │   └── Header.tsx         #   navigation
│   │   ├── services/authService.ts# JWT + /api/auth
│   │   ├── types/index.ts         # shared interfaces (mirror the schemas)
│   │   ├── __tests__/             # Jest suites: User.test.ts, Group.test.ts
│   │   ├── App.tsx                # application state and routing
│   │   ├── index.tsx              # entry point
│   │   └── index.css              # global stylesheet
│   ├── public/index.html          # HtmlWebpackPlugin template
│   ├── webpack.config.js          # bundling + /api dev proxy
│   ├── jest.config.js
│   └── tsconfig.json
│
├── server/                        # Node + Express backend
│   ├── models/                    # Mongoose schemas (9)
│   ├── routes/auth.js             # /api/auth/*
│   ├── middleware/auth.js         # JWT verification
│   ├── index.js                   # the rest of the API + Socket.io
│   ├── Dockerfile
│   ├── package.json
│   └── *.js                       # ~30 maintenance / diagnostic scripts
│
├── *.js                           # root-level maintenance scripts
├── railway.json                   # deployment configuration
├── start.sh                       # local dev launcher
└── README.md
```

### Reading order for a newcomer

1. **`client/src/types/index.ts`** — the vocabulary, in one screen.
2. **`server/models/User.js` and `Group.js`** — the two lifecycle state machines.
3. **`server/index.js`** — the header comment maps the file's ten sections; the
   swipe, matches and group-accept endpoints are the substance.
4. **`client/src/App.tsx`** — how the client consumes all of the above.
5. **`client/src/__tests__/Group.test.ts`** — the group rules, executable.

Every source file in the repository carries a header comment stating what it
does, what it connects to, and any known limitations.

---


## Core Classes

### User Class
- Manages individual user profiles and preferences
- Handles compatibility checking with other users
- Manages profile state (active, suspended, in group)

### Group Class
- Manages group profiles and member lists
- Manages group preferences and settings

---

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
- `GET /api/groups/:groupId` - Get group (members only)
- `GET /api/groups/:groupId/preview` - Get group profile for the discovery feed
- `PUT /api/groups/:groupId` - Update name, description, preferences, photo, capacity
- `POST /api/groups/:groupId/invite` - Invite a user into the group
- `POST /api/groups/:groupId/join-request` - Request to join a group
- `GET /api/groups/:groupId/join-requests` - List inbound join requests (members only)
- `POST /api/groups/:groupId/join-request/:requestId/respond` - Accept or reject a join request
- `POST /api/groups/:groupId/leave` - Leave the group
- `POST /api/group-requests` - Ask another individual to form a group
- `POST /api/group-requests/:requestId/respond` - Accept or reject that request
- `POST /api/group/:groupId/swipe` - Swipe on behalf of the group
- `POST /api/group-matches/:groupMatchId/accept` - Accept a group invitation

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
- **Invitations**: any member can invite an individual user into the group
- **Join Requests**: any user can request to join a group; any member can accept or reject
- **Group Preferences**: shared preferences for the group
- **Group Photos**: combined photos from all members

---

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

Run the client test suites from `client/`:

```bash
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
```

The suites live in `client/src/__tests__/` and cover the two domain classes that
the application uses: `User.test.ts` (39 tests) and `Group.test.ts` (55 tests).
There are no server-side tests; `npm test` in `server/` is a stub.

Remaining testing work:
- Add integration tests for the API endpoints
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

## Maintenance Commands

### Reset All Users (Clear All Data)
If you need to reset all users to a fresh state (useful for testing or demos):

```bash
# From the root directory
node reset_all_users.js

# OR from the server directory
cd server
node ../reset_all_users.js
```

This command will:
- Delete all matches between users
- Delete all groups
- Delete all messages
- Delete all swipe actions
- Delete all group join requests
- Reset all users to 'individual' status with active profiles

**⚠️ WARNING**: This is a destructive operation that cannot be undone!

### Verify Database Reset
To verify all data has been cleared:

```bash
# From the root directory
node verify_reset.js
```

### Debug User Status
To check a specific user's status and data:

```bash
# From the root directory
node debug_user_status.js user@email.com

# OR from the server directory
cd server
node ../debug_user_status.js user@email.com
```

This will show:
- User's current status (individual/in_group)
- Profile status (active/paused)
- Group membership
- Active matches

### Fix User Status
If a user's status is inconsistent (e.g., marked as in_group but not in any groups):

```bash
# From the root directory
node fix_user_status.js user@email.com

# OR from the server directory
cd server
node ../fix_user_status.js user@email.com
```

This will:
- Check if the user is actually in any active groups
- Fix status inconsistencies
- Update related matches to the correct state

### Clean Up Orphaned Data
To remove all data that references deleted users (matches, messages, swipes, etc.):

```bash
# From the root directory
node cleanup_orphaned_accounts.js
```

This will:
- Find and delete matches referencing deleted users
- Remove orphaned swipe actions and messages
- Clean up empty groups and join requests
- Allow deleted email addresses to be used for new registrations

**Use this after resetting users to ensure no old data references remain.**

### Remove Old User Accounts
To prevent login attempts with accounts that no longer exist in the database:

```bash
# From the root directory
node remove_old_accounts.js

# OR from the server directory
cd server
node ../remove_old_accounts.js
```

This command will:
- Find and delete specified old user accounts by email
- Remove all related data (matches, messages, swipes, groups, join requests)
- Allow those email addresses to be used for new registrations
- Prevent authentication with stale JWT tokens

**Note**: The authentication system automatically prevents login with deleted accounts by validating user existence on each API request. If users try to log in with cached tokens for deleted accounts, they will be automatically logged out and redirected to the login page.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details
