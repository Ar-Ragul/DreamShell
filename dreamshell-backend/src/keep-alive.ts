// This script pings the backend every 14 minutes to keep it alive
import fetch from 'node-fetch';

const BACKEND_URL = 'https://your-render-backend-url';
const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes in milliseconds

async function pingServer() {
  try {
    const response = await fetch(`${BACKEND_URL}/ping/health`);
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] Server status:`, data);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error pinging server:`, error.message);
  }
}

// Initial ping
pingServer();

// Setup interval
setInterval(pingServer, PING_INTERVAL);

console.log(`Started pinger. Pinging ${BACKEND_URL} every ${PING_INTERVAL/1000/60} minutes.`);
