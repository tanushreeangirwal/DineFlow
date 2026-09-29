# DineFlow 🍽️
> **Scan. Wait. Get Your Table.**

DineFlow is a modern, digital queue and table management web application designed for hospitality, hotels, and restaurants.

---

## 🌟 Key Features

### 1. Customer Interface (Mobile-First)
- **Zero App Download / Zero Registration**: Accessible instantly via QR code (`/restaurant/:restaurantId`).
- **Screen 1 (Welcome)**: "Welcome to [Restaurant Name]" with quick "Check Table Availability" button.
- **Screen 2 (Customer Details)**: Simple form requiring only Name and Mobile Number, plus optional WhatsApp/SMS marketing consent checkbox (unchecked by default).
- **Screen 3A (Table Available Immediately)**: Instant "Your Table is Ready" screen displaying assigned table (e.g. `T-05`) with one-click "View Table Details".
- **Screen 3B (Table Not Available - Queue)**: Gentle "We're currently full" notice, generates token (`A-025`), displays currently serving token, people ahead, and estimated wait time in minutes.
- **Customer Live Queue Screen**: Clean card showing Token `#A-025`, Currently Serving, People Ahead, Estimated Wait, and a glowing `WAITING` status. Auto-refreshes via Server-Sent Events (SSE) and polling.
- **Table Ready Screen**: Prominently displays "Your Table is Ready", Table `T-05`, "Please proceed to the restaurant.", with gentle Web Audio chime and simulated SMS/WhatsApp message notification banner.
- **Session Persistence**: Restores active session and queue token if the customer leaves the browser or refreshes.

### 2. Restaurant Staff Dashboard (Desktop & Tablet Optimized)
- **Dashboard Home**: Summary metric cards (**Waiting**, **Available Tables**, **Occupied**, **Served Today**) and live queue table with one-click **Call** action.
- **Dedicated Queue Management**: Waiting list cards displaying Token, Customer Name, Mobile Number, Waiting time, and primary **Call Customer** button + secondary **Recall**, **Skip**, and **Cancel** actions.
- **Table Management**: Visual grid layout of all restaurant tables (`Available`, `Occupied`, `Preparing`, `Assigned`) with 1-click status transitions and ability to add new tables.
- **Customer Directory & History**: Tracks Customer Name, Mobile, Visit Count, Last Visit, Latest Bill, Total Spend, and WhatsApp consent. Clicking a customer opens their visit and spend breakdown.
- **Manual Billing Flow**: Staff enters bill amount manually after a customer is served (e.g. `₹2,450`), updating customer lifetime spend and visit records (POS-ready schema).
- **Printable QR Code & Table Stand**: Generates high-resolution restaurant-specific QR code with preview table tent card ready to print or download.
- **Modular Notification Service**: Multi-provider notification architecture (SMS, WhatsApp, Webhooks, SSE dispatch) triggered upon table assignment.
- **Optional LED Display / TV Monitor Endpoint**: Dedicated endpoint (`/api/display/:restaurantId`) and TV screen view showing `NOW SERVING [Token] - PROCEED TO TABLE [T-XX]`.

---

## 🎨 Design System

- **Brand Colors**: Hospitality Red (`#D92D20`) and Crisp White (`#FFFFFF`), with soft off-white surface cards (`#FAFAFA`) and dark charcoal typography (`#18181B`).
- **Hospitality Atmosphere**: Calm, soothing, premium, and clean — red is used selectively for primary actions, active tokens, and brand accents without overwhelming the user.
- **Typography**: Plus Jakarta Sans for modern readability and Space Grotesk for crisp token and table numbers.

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: React 19, Lucide Icons, Vanilla CSS Design System, Vite.
- **Backend**: Node.js, Express 5, Better-SQLite3, QR Code engine, Web Audio API chime.
- **Real-time Engine**: Server-Sent Events (SSE) via `/api/stream/:restaurantId` + periodic fallback.
- **Database**: Relational SQLite (`server/data/dineflow.db`) with relational tables:
  - `restaurants`
  - `tables`
  - `customers`
  - `queue_entries`
  - `visits`
  - `notifications`

---

## 🚀 Running Locally

### Development Mode (Both Server & Client with hot reload)
```bash
npm run dev
```

### Or Individual Services
- **Backend API (port 3001)**:
  ```bash
  npm run dev:server
  ```
- **Vite Client (port 5173)**:
  ```bash
  npm run dev:client
  ```

### Build & Production Serve
```bash
npm run build
npm start
```
App will be accessible at:
- **Staff Dashboard**: [http://localhost:3001](http://localhost:3001)
- **Customer QR View**: [http://localhost:3001/restaurant/rest-dineflow-01](http://localhost:3001/restaurant/rest-dineflow-01)
- **LED Display Screen**: [http://localhost:3001/api/display/rest-dineflow-01](http://localhost:3001/api/display/rest-dineflow-01)
