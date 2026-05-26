import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Polyfill window.storage → localStorage
window.storage = {
  get: (key) => Promise.resolve(
    localStorage.getItem(key) != null
      ? { value: localStorage.getItem(key) }
      : null
  ),
  set: (key, value) => {
    localStorage.setItem(key, value);
    return Promise.resolve();
  },
  remove: (key) => {
    localStorage.removeItem(key);
    return Promise.resolve();
  },
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
