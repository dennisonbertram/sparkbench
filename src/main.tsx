import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@wokwi/elements';
import './ui/styles.css';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(<App />);
