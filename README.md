# 🎓 CampusBid — Live Campus Auction & Product Exchange Platform

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-v19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-v5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-v6+-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-v4-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

**CampusBid** is a full-stack MERN platform built specifically for college students to buy, sell, and auction campus essentials (textbooks, electronics, dorm gear, lab equipment, cycles) safely within their verified university ecosystem.

Featuring **real-time live bidding**, **automated auction extensions**, **multi-image uploads with magic-bytes verification**, **scheduled listing publication**, **Smart Wanted Alerts**, **auction-specific discussions**, **direct campus messaging**, **seller and admin analytics**, and an end-to-end **Buyer–Seller Product Exchange** coordination workflow.

---

## 📸 Key Features & Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                              CAMPUSBID                                 │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
     ┌───────────────────────────────┼──────────────────────────────┐
     │                               │                              │
     ▼                               ▼                              ▼
⚡ Real-Time Bidding            🤝 Product Exchange            🔔 Notifications & Alerts
 • Live Socket.IO bid rooms     • Two-party confirmation        • Global listing broadcasts
 • 30s anti-sniping extension   • Handover meeting proposal     • Smart Wanted Alerts match
 • Authoritative server rules   • Dispute resolution            • Offline persistence in DB
 • Bid history timeline         • Linked private chat           • Live badge counter

     │                               │                              │
     ▼                               ▼                              ▼
💬 Campus Communications        📊 Dashboards & Analytics      🛡️ Security & Multi-Upload
 • Auction "Ask Seller" box     • Seller analytics & trends     • Multer multi-image upload
 • Direct student messenger     • Admin moderation center       • Magic bytes inspection
 • "Looking For" item board     • User suspension & reports     • JWT + Refresh tokens
```

---

## ✨ Features

### 1. ⚡ Real-Time Live Auctions & Automatic Proxy Bidding
- **Instant Bid Broadcasts**: Bids propagate immediately across active clients in authenticated auction rooms without manual page refreshes.
- **Automatic Proxy Bidding (Maximum Bid)**:
  - Buyers can commit a private maximum bid (`maxAmount`). The backend engine automatically places bids on their behalf by the minimum required increment, never exceeding their maximum limit.
  - **Deterministic Tie-Break Rule**: In case of equal maximum amounts, the earliest submitted commitment wins priority and the price rises to that maximum.
  - **Private Maximum Confidentiality**: A buyer's maximum is strictly confidential and never exposed in public endpoints, public socket broadcasts, bid history, or logs.
  - **Seamless Manual Bid Integration**: When another bidder places a manual bid below an active proxy maximum, the proxy automatically counters to maintain the lead.
- **Anti-Sniping Protection**: Server-side rule extends the auction countdown by 30 seconds if a bid is placed in the final 30 seconds (up to 10 extensions).
- **Authoritative Server Validation**: Bids are validated against current price, minimum increment, auction time window, and seller ownership rules.

### 2. 🤝 Buyer–Seller Product Exchange Workflow
Dedicated **My Transactions / Product Exchange** hub for physical handovers after an auction ends with a winner:
- **State Machine**: `READY_TO_ARRANGE` $\rightarrow$ `HANDOVER_SCHEDULED` $\rightarrow$ `HANDED_OVER` $\rightarrow$ `COMPLETED` (or `DISPUTED`).
- **Campus Meeting Negotiation**: Propose, accept, or decline handover dates, times, and safe campus locations (e.g., Central Library, Student Center).
- **Two-Party Physical Confirmation**: Both buyer and seller must confirm physical handover; neither party can confirm for the other.
- **Dispute Resolution & Audit Trail**: Full chronological history with actors, timestamps, and notes, plus administrative dispute review.
- **Linked Private Chat**: Dedicated private conversation automatically provisioned for every exchange.

### 3. 🖼️ Multi-Image Upload with Multer
- Upload up to 5 device photos per listing (`JPEG, JPG, PNG, WebP`).
- Drag-and-drop file picker with instant client-side image preview and removal.
- **Deep Security Validation**: Magic-bytes header verification blocks disguised executable files.
- **Storage Management**: Server-side disk cleanup removes replaced or deleted images to prevent orphaned storage bloat.

### 4. 📅 Scheduled Listings & Cancellation Policy
- **Publish Now or Schedule Later**: Sellers can set a future publication date and time.
- **Background Cron Engine**: `scheduledPublisher.js` activates scheduled listings when their start time arrives without human intervention.
- **Safe Cancellation**: Sellers can cancel scheduled auctions or active auctions with zero bids. Listings with existing bids are locked against seller cancellation for buyer protection.

### 5. 🎯 Smart Wanted Alerts
- Students can register keywords, categories, and maximum budget thresholds for items they need.
- Background worker matches new listing publications and dispatches both real-time socket events and persisted database notifications even when offline.

### 6. 💬 Campus Messaging & Auction Inquiries
- **Auction Discussion Box**: Prospective buyers can ask public/private questions directly on the listing page.
- **Global Direct Messaging**: Student-to-student private chat with file attachments, timestamps, and unread badges.
- **Looking For Marketplace**: Dedicated feed for students looking for specific campus items.

### 7. 📊 Seller & Admin Analytics Dashboards
- **Seller Dashboard**: Revenue metrics, active listings, bid counts, daily view trends, and individual listing performance metrics.
- **Admin Command Center**: System-wide statistics, user management (suspend, reinstate, promote/demote roles), listing moderation (hide, review, unhide), and user report resolution.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Routing**: [React Router DOM v7](https://reactrouter.com/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) (Custom Dark Glassmorphic Design System)
- **Real-Time Client**: [Socket.IO Client](https://socket.io/)
- **Icons & UI**: [Lucide React](https://lucide.dev/), [React Hot Toast](https://react-hot-toast.com/)
- **HTTP Client**: [Axios](https://axios-http.com/)

### Backend
- **Runtime**: [Node.js](https://nodejs.org/) (ES Modules & CommonJS)
- **Framework**: [Express 5](https://expressjs.com/)
- **Database**: [MongoDB](https://www.mongodb.com/) via [Mongoose 9](https://mongoosejs.com/)
- **Real-Time Server**: [Socket.IO](https://socket.io/)
- **File Uploads**: [Multer](https://github.com/expressjs/multer)
- **Scheduled Tasks**: [node-cron](https://github.com/kelektiv/node-cron)
- **Authentication**: JWT (Access + Refresh tokens), [bcryptjs](https://github.com/dcodeIO/bcrypt.js)

---

## 📁 Repository Structure

```
TheCloudCompany/
├── backend/
│   ├── config/              # MongoDB connection & app configuration
│   ├── controllers/         # Express controllers (auth, bids, listings, exchanges, chat, etc.)
│   ├── jobs/                # Background workers (scheduledPublisher, auctionCloser)
│   ├── middleware/          # Auth, roles, Multer upload & error middleware
│   ├── models/              # Mongoose models (User, Listing, Bid, Exchange, Conversation, etc.)
│   ├── routes/              # Express API route declarations
│   ├── scripts/             # Utility scripts (e.g., promote-admin.js)
│   ├── services/            # Core business logic (exchangeService, notificationService, etc.)
│   ├── socket/              # Socket.IO connection & event handlers
│   ├── uploads/             # Static file storage for listing images and attachments
│   ├── server.js            # Express & Socket.IO server entrypoint
│   └── test-*.js            # Comprehensive automated test suites (7 test suites)
│
├── frontend/
│   ├── public/              # Static assets
│   ├── src/
│   │   ├── api/             # Centralized Axios API services
│   │   ├── components/      # Reusable UI (Navbar, NotificationCenter, Countdown, etc.)
│   │   ├── context/         # React Contexts (AuthContext, SocketContext)
│   │   ├── pages/
│   │   │   ├── Admin/       # Admin Dashboard, User, Listing & Report moderation
│   │   │   ├── Auth/        # Login & Register views
│   │   │   ├── Browse/      # Public marketplace feed with live search & filters
│   │   │   ├── Chat/        # Direct student chat & Looking-For marketplace
│   │   │   ├── Dashboard/   # Student & Seller Analytics Dashboard
│   │   │   ├── Exchange/    # Product Exchange & Physical Handover Dashboard
│   │   │   └── Listing/     # Create, Edit, and View Auction Listing with live bidding
│   │   ├── utils/           # Utility functions (date formatting, image URL resolver)
│   │   ├── App.jsx          # Route definitions & guards
│   │   └── main.jsx         # React application entrypoint
│   └── vite.config.js       # Vite configuration
│
└── README.md                # Project documentation
```

---

## 🚀 Quick Start Guide

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [MongoDB](https://www.mongodb.com/try/download/community) installed and running locally on port `27017` (or MongoDB Atlas URI)
- Git

---

### 1. Clone the Repository
```bash
git clone https://github.com/DINUANAND-R/CampusBit.git
cd CampusBit
```

---

### 2. Backend Setup
```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` folder (or copy `.env.example`):
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/campusbid
JWT_SECRET=campusbid_jwt_secret_change_in_production
JWT_REFRESH_SECRET=campusbid_refresh_secret_change_in_production
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

Start the backend server:
```bash
npm run dev
# Server will run at http://localhost:5000
```

---

### 3. Frontend Setup
In a new terminal window:
```bash
cd frontend
npm install
npm run dev
# Client will run at http://localhost:5173
```

---

### 4. Create an Admin User (Optional)
To promote an existing registered user to an Administrator:
```bash
cd backend
node scripts/promote-admin.js <user-email-or-username>
```

---

## 🧪 Automated Test Suites

The project features **8 automated end-to-end test suites** with **285 assertions** verifying business logic, access control, concurrency, proxy pricing, and real-time Socket.IO synchronization:

| Test Suite | Purpose | Command |
| :--- | :--- | :--- |
| **Automatic Proxy Bidding** | Incremental auto-bids, tie-breaking, privacy, manual bid counters | `node test-proxy-bidding.js` |
| **Product Exchange Workflow** | Handover proposals, two-party confirmation, disputes, idempotency | `node test-exchange-workflow.js` |
| **Smart Wanted Alerts** | Keyword/budget matching, offline notifications, student privacy | `node test-wanted-alerts.js` |
| **Global Notifications** | New listing broadcast campaign, read counters, socket delivery | `node test-notifications.js` |
| **Messaging & Discussion** | Auction inquiry boxes, campus DMs, file attachments, room security | `node test-messaging.js` |
| **Scheduling & Cancellation** | Cron auto-publish, overdue restart recovery, seller cancel rules | `node test-scheduling-cancellation.js` |
| **Seller & Admin Analytics** | Revenue calculations, suspension, listing moderation, user reports | `node test-analytics-admin.js` |
| **Multer Multi-Image** | Multiple file upload, magic bytes, disk cleanup, storage limits | `node test-multer.js` |

To run the complete test suite:
```bash
cd backend
node test-proxy-bidding.js
node test-exchange-workflow.js
node test-wanted-alerts.js
node test-notifications.js
node test-messaging.js
node test-scheduling-cancellation.js
node test-analytics-admin.js
node test-multer.js
```

---

## 🔒 Security & Best Practices
- **Role-Based Authorization**: Strict middleware protects admin endpoints and prevents cross-user access to private chats, exchange details, and alerts.
- **Authoritative Server Validation**: Client timestamps or forged requests cannot place bids after auction closure or confirm handovers on behalf of the counterparty.
- **Magic Bytes File Inspection**: File uploads are verified via binary header buffers to block disguised executables and malicious scripts.
- **Idempotent Background Jobs**: Repeated execution of auction closing or scheduled publishing will never generate duplicate transactions, notifications, or alerts.
- **No Manual Refresh Required**: Socket.IO authenticated rooms and reactive hooks keep feeds, bids, alerts, and counters synchronized in real-time.

---

## 👥 Authors & Contributors
Developed by the **CampusBid** team for campus student marketplaces.

Contributions, issues, and feature requests are welcome! Feel free to open an issue or submit a pull request.
