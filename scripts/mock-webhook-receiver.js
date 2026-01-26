#!/usr/bin/env node
/**
 * Mock Webhook Receiver for E2E Testing
 * 
 * Endpoints:
 * - POST /webhook      → responds 200, logs headers + body
 * - POST /webhook/fail → responds 500 (for testing retry logic)
 * 
 * Usage:
 *   node scripts/mock-webhook-receiver.js
 *   # Listens on 127.0.0.1:5055
 */

const http = require("http");

const PORT = process.env.MOCK_WEBHOOK_PORT || 5055;
const HOST = "127.0.0.1";

const server = http.createServer((req, res) => {
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
});

server.listen(PORT, HOST, () => {
  console.log(`\n🎯 Mock Webhook Receiver running at http://${HOST}:${PORT}`);
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
