import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './view/App.tsx';
import './view/scene.css';
import './view/notebook.css';

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><App /></StrictMode>);
