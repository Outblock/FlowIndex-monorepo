#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scriptPath = resolve(__dirname, '../dist/index.js');

const server = spawn('node', [scriptPath], {
  stdio: 'inherit',
  shell: false,
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

const cleanup = () => { if (!server.killed) server.kill(); };
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
