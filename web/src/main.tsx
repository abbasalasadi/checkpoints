import { StrictMode } from 'react';
import './styles.css';
import './lib/monaco.js';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { logger } from './logger.js';

logger.info('app.boot', { env: import.meta.env.MODE });

const root = document.getElementById('root');
if (!root) throw new Error('#root not found in index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
