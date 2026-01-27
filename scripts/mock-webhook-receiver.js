#!/usr/bin/env node
/**
 * Mock Webhook Receiver for E2E Testing (HTTPS)
 * 
 * Endpoints:
 * - POST /webhook      → responds 200, logs headers + body
 * - POST /webhook/fail → responds 500 (for testing retry logic)
 * 
 * Usage:
 *   node scripts/mock-webhook-receiver.js
 *   # Listens on https://127.0.0.1:5055
 * 
 * Requires: Node.js with built-in https module
 * Uses self-signed certificate generated inline for testing
 */

const https = require("https");
const crypto = require("crypto");

const PORT = process.env.MOCK_WEBHOOK_PORT || 5055;
const HOST = "127.0.0.1";

// This receiver is HTTPS-only. No HTTP fallback allowed.

// Simpler approach: use Node's built-in TLS with self-signed cert
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const certsDir = path.join(__dirname, "certs");
const keyPath = path.join(certsDir, "server.key");
const certPath = path.join(certsDir, "server.crt");

// Generate certs if they don't exist
if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true });
}

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.log("Generating self-signed certificate...");
  try {
    execSync(`openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 365 -nodes -subj "/CN=localhost"`, {
      stdio: "pipe"
    });
    console.log("Certificate generated successfully.");
  } catch (err) {
    console.error("Failed to generate certificate. Please ensure OpenSSL is installed.");
    console.error("HTTPS is mandatory. Exiting.");
    process.exit(1);
  }
}

const options = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
  // Allow self-signed certs
  rejectUnauthorized: false,
};

function handleRequest(req, res) {
  // CORS headers for preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    const timestamp = new Date().toISOString();
    const headers = req.headers;
    
    // Log incoming request
    console.log("\n" + "=".repeat(60));
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    console.log("Headers:", JSON.stringify(headers, null, 2));
    
    try {
      const payload = JSON.parse(body);
      console.log("Payload:", JSON.stringify(payload, null, 2));
    } catch {
      console.log("Body (raw):", body);
    }
    console.log("=".repeat(60));

    // Route handling
    if (req.url === "/webhook/fail") {
      // Simulate failure for retry testing
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ 
        error: "Simulated failure for testing",
        received_at: timestamp 
      }));
      console.log("→ Response: 500 (simulated failure)");
    } else if (req.url === "/webhook" || req.url === "/") {
      // Success response
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ 
        success: true,
        received_at: timestamp,
        message: "Webhook received successfully"
      }));
      console.log("→ Response: 200 OK");
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      console.log("→ Response: 404 Not Found");
    }
  });
}

// No HTTP fallback - HTTPS only

const server = https.createServer(options, handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`\n🔒 Mock Webhook Receiver (HTTPS) running at https://${HOST}:${PORT}`);
  console.log("   POST /webhook      → 200 OK");
  console.log("   POST /webhook/fail → 500 Error\n");
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down mock webhook receiver...");
  server.close(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  server.close(() => {
    process.exit(0);
  });
});
