import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import CustomerDisplay from './components/CustomerDisplay';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const isCustomerDisplay = window.location.hash === '#customer-display';

root.render(
  <React.StrictMode>
    {isCustomerDisplay ? <CustomerDisplay /> : <App />}
  </React.StrictMode>
);