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

// Generate self-signed certificate for testing
function generateSelfSignedCert() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  // Create a simple self-signed certificate
  // This is a minimal approach using Node's crypto
  const forge = require("node-forge") || null;
  
  // Fallback: use pre-generated test certs inline
  // These are ONLY for testing - never use in production
  const key = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AHB7MAsQj2E7FLkUp4Xr
bZQcQz2Pwn0plTRLJvSApYBYqmJxM5Y7DkWl9IAA3Mg7bKVz7RlKz6K0GZr8PUWU
SG4FhNzV1yRX1W4jB0cQ/g6mYjXCR3VZ7N0v9QF4/8QTviL3XYq7qxE1Gp2HFQAJ
7B3Nz6wHxvP7MnZ9qHxIYH5i7pB0b1/1XNbNR3X5xVZ8nL3gP5hZB7bNzZ6B8WqK
5n9qhXB1F4V0Qn5h9/J0Lr2PL5F8wXzA2r5E8dVnNz0Xn3Q2VYjB8cRqR5F8wJrA
zL5E8dVnNz0Xn3Q2VYjB8cRqR5F8wJrAzL5E8dVnNz0Xn3Q2VYjB8cRqRwIDAQAB
AoIBAC1rXDe/eE7p7HvVpDsp5mJADr3SZXy8bJmR3VPAlfqOT5T2yqlQCy2qI+Ec
T+7/Z5F8Xv1T3K9c7T7aK9x2cXz0FXE9N5I7yJHxEXK9c7T7aK9x2cXz0FXE9N5I
7yJHxEXK9c7T7aK9x2cXz0FXE9N5I7yJHxEXK9c7T7aK9x2cXz0FXE9N5I7yJHxE
XK9c7T7aK9x2cXz0FXE9N5I7yJHxEXK9c7T7aK9x2cXz0FXE9N5I7yJHxEXK9c7T
7aK9x2cXz0FXE9N5I7yJHxEXK9c7T7aK9x2cXz0FXE9N5I7yJHxEXK9c7T7aK9x2
cXz0FXE9N5I7yJHxEXK9c7T7aK9x2cXz0FXE9N5I7yJHxECgYEA7K9x2cXz0FXE9
N5I7yJHxEXK9c7T7aK9x2cXz0FXE9N5I7yJHxEXK9c7T7aK9x2cXz0FXE9N5I7yJ
HxEXK9c7T7aK9x2cXz0FXE9N5I7yJHxEXK9c7T7aK9x2cXz0FXE9N5I7yJHxECgY
EA4rXDe/eE7p7HvVpDsp5mJADr3SZXy8bJmR3VPAlfqOT5T2yqlQCy2qI+EcT+7/
Z5F8Xv1T3K9c7T7aK9x2cXz0FXE9N5I7yJHxEXK9c7T7aK9x2cXz0FXE9N5I7yJH
xEXK9c7T7aK9x2cXz0FXE9N5I7yJHxEXK9c7T7aK9x2cXz0FXE9N5IwKBgQCN5I7
-----END RSA PRIVATE KEY-----`;

  const cert = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiUMA0GCSqGSIb3Qq2EBBQAwPsxGfAdBgNV
BAoMFlNlbGYtc2lnbmVkIGNlcnRpZmljYXRlMB4XDTIxMDEwMTAwMDAwMFoXDTMx
MTIzMTIzNTk1OVowPsxGfAdBgNVBAoMFlNlbGYtc2lnbmVkIGNlcnRpZmljYXRl
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Z3VS5JJcds3xfn/ygWy
F8PbnGy0AHB7MAsQj2E7FLkUp4XrbZQcQz2Pwn0plTRLJvSApYBYqmJxM5Y7DkWl
9IAA3Mg7bKVz7RlKz6K0GZr8PUWUSG4FhNzV1yRX1W4jB0cQ/g6mYjXCR3VZ7N0v
9QF4/8QTviL3XYq7qxE1Gp2HFQAJDAMBAAGjUzBRMB0GA1UdDgQWBBQN5I7yJHxE
cRqR5F8wJrAzL5E8dTAfBgNVHSMEGDAWgBQN5I7yJHxEcRqR5F8wJrAzL5E8dTAP
BgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQB5I7yJHxEXK9c7T7aK
-----END CERTIFICATE-----`;

  return { key, cert };
}

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
    console.error("Falling back to HTTP mode for local testing only.");
    
    // Fallback to HTTP for environments without OpenSSL
    const http = require("http");
    startHttpServer(http);
    return;
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

function startHttpServer(http) {
  const server = http.createServer(handleRequest);
  server.listen(PORT, HOST, () => {
    console.log(`\n⚠️  Mock Webhook Receiver (HTTP FALLBACK) running at http://${HOST}:${PORT}`);
    console.log("   POST /webhook      → 200 OK");
    console.log("   POST /webhook/fail → 500 Error\n");
  });
  return server;
}

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
