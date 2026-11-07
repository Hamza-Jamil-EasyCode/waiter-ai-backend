# La Ra Costa Backend API

Node.js backend application built with Express.js, MongoDB, Mongoose, and Cluster support for production scalability.

## Features

-   Express.js REST API
-   MongoDB with Mongoose
-   Environment-based configuration
-   Production clustering using Node.js Cluster
-   Socket support (optional)
-   Cron jobs support (optional)
-   User authentication and authorization
-   Automatic worker restart on failure
-   Configurable MongoDB connection pool
-   Production-ready server architecture

---

## Prerequisites

Before running the project, make sure the following are installed:

-   Node.js (v18+ recommended)
-   MongoDB
-   npm or yarn

---

## Installation

Clone the repository:

```bash
git clone <repository-url>
cd <project-folder>
```

Install dependencies:

```bash
npm install
```

---

## Environment Variables

Create a `.env` file in the project root.

Example:

```env
NODE_ENV=DEV

PORT=4000

MONGO_HOST=localhost
MONGO_PORT=27017
DB_NAME=la-ra-costa

MONGO_POOL_SIZE=5

CLUSTER_SIZE=2

BROKER_EMAIL=broker@example.com
BROKER_PASSWORD=password123
```

---

## Running the Application

### Development Mode

```bash
npm run dev
```

Development mode runs a single Node.js process.

Expected output:

```bash
🚀 ========= Starting server =========
✅ ENVIRONMENT: DEV
🚀 Worker 12345 running on http://0.0.0.0:4000 (DEV)
✅ MongoDB connected successfully
✅ DEV server ready
```

---

### Production Mode

```bash
npm start
```

Production mode uses Node.js clustering.

Expected output:

```bash
🚀 ========= Starting server =========
🧠 Primary 12345 is running
✅ CLUSTER SIZE: 2

👷 Worker 12346 is online
👷 Worker 12347 is online

🚀 Worker 12346 running on http://0.0.0.0:4000 (PROD)
🚀 Worker 12347 running on http://0.0.0.0:4000 (PROD)

✅ MongoDB connected successfully
```

---

## Project Structure

```text
.
├── app.js
├── server.js
├── package.json
├── src
│   ├── config
│   │   ├── config.js
│   │   └── mongoose.js
│   ├── controllers
│   ├── middlewares
│   ├── models
│   ├── routes
│   ├── services
│   ├── socket
│   └── utils
└── .env
```

---

## MongoDB Connection

MongoDB connection is established only after the HTTP server starts successfully.

### Development

-   1 application process
-   1 MongoDB connection pool

### Production

-   Multiple worker processes
-   Each worker maintains its own MongoDB connection pool

Example:

```env
CLUSTER_SIZE=4
MONGO_POOL_SIZE=10
```

Total potential MongoDB connections:

```text
4 workers × 10 pool size = 40 connections
```

---

## Cluster Configuration

Recommended values:

### Development

```env
CLUSTER_SIZE=1
MONGO_POOL_SIZE=5
```

### Production

Small VPS:

```env
CLUSTER_SIZE=2
MONGO_POOL_SIZE=5
```

Medium Server:

```env
CLUSTER_SIZE=4
MONGO_POOL_SIZE=10
```

---

## Available Scripts

```bash
npm run dev
```

Starts the application in development mode using Nodemon.

```bash
npm start
```

Starts the application in production mode.

```bash
npm test
```

Runs automated tests.

---

## Worker Recovery

If a worker crashes:

```text
💥 Worker 12345 died
🔁 Restarting worker...
```

A new worker process is automatically created.

---

## API Base URL

Development:

```text
http://localhost:4000
```

Production:

```text
http://<server-ip>:4000
```

---

## Notes

-   Primary process does not connect to MongoDB.
-   MongoDB connections are established by worker processes only.
-   Cron jobs run only once in the primary process.
-   Socket communication can be broadcast between workers using the cluster message system.
-   Environment variables should never be committed to Git.

---

## License

This project is proprietary and intended for internal use unless otherwise specified.
