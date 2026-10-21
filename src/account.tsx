// The account page (/account): sign in or up, create and switch organizations, invite members,
// sign out. It is deliberately NOT cross-origin isolated, so Clerk's images and bot checks work.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import { ClerkProvider, Show, SignIn, OrganizationSwitcher, OrganizationProfile, UserButton, useAuth } from '@clerk/react';
import { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import './ui/account.css';

/** Only same-site paths, so the page can't be used to bounce people to another site. */
function nextUrl(): string {
  const r = new URLSearchParams(location.search).get('redirect') ?? '/';
  return r.startsWith('/') && !r.startsWith('//') && !r.startsWith('/account') ? r : '/';
}

function Signed() {
  const { orgId } = useAuth();
  return (
    <main className="account">
      <header>
        <a className="brand" href={nextUrl()}>
          Sparkbench
        </a>
        <OrganizationSwitcher hidePersonal={false} afterSelectOrganizationUrl={location.href} afterSelectPersonalUrl={location.href} afterCreateOrganizationUrl={location.href} />
        <UserButton />
      </header>
      <p className="lede">
        Your projects, parts, gallery and classes belong to the workspace you pick here: your personal one, or an organization you share with your class or team.
      </p>
      <p>
        <a className="open" href={nextUrl()}>
          Open Sparkbench →
        </a>
      </p>
      {orgId && <OrganizationProfile routing="hash" />}
    </main>
  );
}

async function start() {
  const cfg: { mode?: string; clerkPublishableKey?: string | null } = await fetch('/api/config')
    .then((r) => r.json())
    .catch(() => ({}));
  const root = createRoot(document.getElementById('root')!);
  if (cfg.mode !== 'hosted' || !cfg.clerkPublishableKey) {
    root.render(
      <main className="account">
        <p>This Sparkbench runs locally without accounts.</p>
        <a href="/">Open Sparkbench</a>
      </main>,
    );
    return;
  }
  root.render(
    <ClerkProvider publishableKey={cfg.clerkPublishableKey} Clerk={Clerk as any} ui={ui} afterSignOutUrl="/account">
      <Show when="signed-out">
        <main className="account center">
          <SignIn routing="hash" fallbackRedirectUrl={nextUrl()} signUpFallbackRedirectUrl={nextUrl()} />
        </main>
      </Show>
      <Show when="signed-in">
        <Signed />
      </Show>
    </ClerkProvider>,
  );
}
start();
