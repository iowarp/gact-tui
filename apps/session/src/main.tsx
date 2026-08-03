import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/base.css';

const host = document.getElementById('root');
if (!host) throw new Error('#root host element is missing from index.html');

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
