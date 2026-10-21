import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@wokwi/elements';
import './ui/styles.css';
import { App } from './ui/App';
import { useStore } from './ui/store';

// Locally there are no accounts; a hosted server sends its mode and Clerk's public key.
async function start() {
  const cfg: { mode?: string; clerkPublishableKey?: string | null } = await fetch('/api/config')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  const root = createRoot(document.getElementById('root')!);
  if (cfg.mode === 'hosted' && cfg.clerkPublishableKey) {
    const { HostedRoot } = await import('./ui/hosted');
    useStore.getState().set({ hosted: true });
    root.render(
      <HostedRoot publishableKey={cfg.clerkPublishableKey}>
        <App />
      </HostedRoot>,
    );
  } else root.render(<App />);
}
start();
