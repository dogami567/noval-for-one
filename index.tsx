import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AdminPage from './components/AdminPage';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const isAdminRoute = window.location.pathname === '/admin';
root.render(
  <React.StrictMode>
    {isAdminRoute ? <AdminPage /> : <App />}
  </React.StrictMode>
);
