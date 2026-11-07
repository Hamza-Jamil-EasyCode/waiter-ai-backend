const dotenv = require("dotenv").config();

if (dotenv.error) {
  console.error(
    "Warning: Unable to load .env file. Defaulting to environment variables.",
  );
}

const http = require("http");
const cluster = require("cluster");
const os = require("os");

const app = require("./app");
const config = require("./src/config/config");
const mongooseConnection = require("./src/config/mongoose");
const User = require("./src/models/User");
const { USER_ROLE } = require("./src/helpers/constant-enums");

const {
  server: { environment, isProdOnly, port, clusterSize },
} = config;

const isDev = environment !== "PROD";
const numCPUs = os.cpus().length;
const numClusters = isDev
  ? 1
  : parseInt(clusterSize || Math.max(1, numCPUs - 1), 10);
const HOST = "127.0.0.1";

function setupServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);

    server.listen(port, HOST, () => {
      console.log(
        `🚀 Worker ${process.pid} running on http://${HOST}:${port} (${environment || "DEV"})`,
      );
      resolve(server);
    });

    server.on("error", (err) => {
      console.error(`❌ Server error: ${err.message}`);
      reject(err);
    });
  });
}

async function createDefaultData() {
  try {
    const {
      superAdminFirstName,
      superAdminLastName,
      superAdminEmail,
      superAdminPassword,
    } = config.server;
    const superAdminExist = await User.findOne({ email: superAdminEmail });

    if (!superAdminExist) {
      await User.create({
        firstName: superAdminFirstName || "Super",
        lastName: superAdminLastName || "Admin",
        email: superAdminEmail || "superadmin@example.com",
        password: superAdminPassword || "SuperAdmin@123",
        role: USER_ROLE.SUPER_ADMIN,
        status: "ACTIVE",
      });

      console.log("✅ Default SUPER ADMIN seeded successfully");
    }
  } catch (err) {
    console.error("❌ Failed to seed default super admin:", err.message);
  }
}

async function startWorker() {
  try {
    await setupServer();
    await mongooseConnection.connect();
    await createDefaultData();
    console.log(`✅ Worker ${process.pid} ready`);
  } catch (err) {
    console.error("❌ Worker failed to start:", err);
    process.exit(1);
  }
}

async function startPrimary() {
  console.log(`🧠 Primary ${process.pid} is running`);
  for (let i = 0; i < numClusters; i++) {
    cluster.fork();
  }
  cluster.on("exit", (worker, code, signal) => {
    console.error(`💥 Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
}

(async () => {
  console.log("\n🚀 ========= Starting AI Catalog Platform Server =========");
  console.log(`✅ PORT: ${port || 4000}\n`);

  if (isDev) {
    await startWorker();
  } else {
    if (cluster.isPrimary) {
      await startPrimary();
    } else {
      await startWorker();
    }
  }
})();
