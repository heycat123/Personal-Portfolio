// src/index.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css' // 👈 THIS IS THE CRITICAL LINE!

// 1. Find the empty div in your public/index.html file
const container = document.getElementById('root');

// 2. Create a React root
const root = createRoot(container);

// 3. Render the App component into that root
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);