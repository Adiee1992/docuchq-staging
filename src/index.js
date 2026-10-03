import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ToastProvider } from './context/ToastContext'; // 1. Import the provider
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        {/* 2. Wrap <App /> inside the ToastProvider */}
        <ToastProvider>
            <App />
        </ToastProvider>
    </React.StrictMode>
);
