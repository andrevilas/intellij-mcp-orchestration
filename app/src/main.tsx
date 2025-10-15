import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import './icons';
import './styles/bootstrap.scss';

import 'bootstrap/js/dist/dropdown';
import 'bootstrap/js/dist/collapse';
import 'bootstrap/js/dist/modal';
import 'bootstrap/js/dist/tooltip';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
