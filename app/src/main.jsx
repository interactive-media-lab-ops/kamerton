import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './app.css';
import './kompas.css';
import './plots/scene.css';
import './plots/star.css';
import './plots/zoom.css';
import './graviton/graviton.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
