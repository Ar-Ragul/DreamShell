import express from 'express';

export const pingRouter = express.Router();

pingRouter.get('/', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// Health check endpoint
pingRouter.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});
