// This script pings the backend every 14 minutes to keep it alive
import fetch from 'node-fetch';

const BACKEND_URL = 'https://dreamshell.onrender.com/';
const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes in milliseconds

async function pingServer() {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { method: "GET" });
    const text = await res.text(); // don't assume JSON in case of proxies
    console.log(`[${new Date().toISOString()}] /health -> ${res.status} ${res.statusText}; body: ${text}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${new Date().toISOString()}] Error pinging server: ${msg}`);
  }
}

// initial ping + interval
void pingServer();
setInterval(pingServer, PING_INTERVAL);

console.log(`Started pinger. Pinging ${BACKEND_URL} every ${PING_INTERVAL / 60000} minutes.`);
