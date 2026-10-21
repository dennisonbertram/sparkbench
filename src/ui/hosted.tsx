// Hosted mode in the app itself. The app is cross-origin isolated (the simulator needs it), which
// blocks Clerk's hosted images and bot checks, so signing in, organizations and invitations happen on
// the separate /account page. Here we only read the session, pick the workspace, load its projects
// and offer to import projects that were saved in this browser before signing in.
import { useEffect, useState, type ReactNode } from 'react';
import { ClerkProvider, useAuth, useOrganizationList, useClerk, useUser } from '@clerk/react';
import { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { hydrateFromServer, browserOnlyProjects, importBrowserProjects } from './store';

const accountUrl = (next = location.pathname + location.search) => `/account?redirect=${encodeURIComponent(next)}`;

export function HostedRoot({ publishableKey, children }: { publishableKey: string; children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={publishableKey} Clerk={Clerk as any} ui={ui} afterSignOutUrl="/account">
      <Workspace>{children}</Workspace>
    </ClerkProvider>
  );
}

const IMPORTED = (ws: string) => `sparkbench.imported.${ws}`;

function Workspace({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, orgId, userId } = useAuth();
  const workspace = orgId ?? userId ?? null;
  const [ready, setReady] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [offer, setOffer] = useState(0);

  useEffect(() => {
    if (isLoaded && !isSignedIn) location.replace(accountUrl());
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!workspace) return;
    // Switching workspace mid-session: start clean, so nothing from the last one lingers on screen.
    if (ready && ready !== workspace) return location.reload();
    hydrateFromServer(workspace)
      .then(() => {
        setReady(workspace);
        let done = false;
        try {
          done = !!localStorage.getItem(IMPORTED(workspace));
        } catch {}
        if (!done) setOffer(browserOnlyProjects().length);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [workspace]);

  if (error)
    return (
      <div className="hosted-gate">
        <p>{error}</p>
        <button onClick={() => location.reload()}>Try again</button>
      </div>
    );
  if (!ready) return <div className="hosted-gate">Loading your workspace…</div>;
  return (
    <>
      {offer > 0 && <ImportBanner count={offer} workspace={ready} onDone={() => setOffer(0)} />}
      {children}
    </>
  );
}

function ImportBanner({ count, workspace, onDone }: { count: number; workspace: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const finish = () => {
    try {
      localStorage.setItem(IMPORTED(workspace), '1');
    } catch {}
    onDone();
  };
  return (
    <div className="import-banner" role="status">
      {count === 1 ? 'One project is' : `${count} projects are`} saved in this browser but not in this workspace yet.
      <button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          importBrowserProjects()
            .then(() => (finish(), location.reload()))
            .catch(() => setBusy(false));
        }}
      >
        {busy ? 'Importing…' : 'Import them'}
      </button>
      <button className="ghost" onClick={finish}>
        Not now
      </button>
    </div>
  );
}

/** Header controls: which workspace you're in, and a link to the account page. */
export function AccountControls() {
  const { orgId } = useAuth();
  const { user } = useUser();
  const { setActive } = useClerk();
  const { userMemberships, isLoaded } = useOrganizationList({ userMemberships: { infinite: true } });
  const orgs = isLoaded ? userMemberships.data ?? [] : [];
  const current = orgId ?? 'personal';
  const initials = (user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '') || user?.primaryEmailAddress?.emailAddress?.[0]?.toUpperCase() || '?';
  return (
    <span className="account-controls">
      <select
        aria-label="Workspace"
        value={current}
        title="Projects, parts, gallery and classes belong to the workspace"
        onChange={(e) => setActive({ organization: e.target.value === 'personal' ? null : e.target.value })}
      >
        <option value="personal">Personal</option>
        {orgs.map((m) => (
          <option key={m.organization.id} value={m.organization.id}>
            {m.organization.name}
          </option>
        ))}
      </select>
      <a className="account-link" href={accountUrl()} title="Account: organizations, members, sign out" aria-label="Account">
        {initials}
      </a>
    </span>
  );
}
