if (typeof window !== 'undefined') {
  try {
    const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (desc && !desc.set && desc.configurable) {
      Object.defineProperty(window, 'fetch', {
        get: desc.get,
        set: function() { /* ignore override */ },
        configurable: desc.configurable,
        enumerable: desc.enumerable
      });
    }
  } catch (e) {
    console.warn("Could not patch window.fetch", e);
  }
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
