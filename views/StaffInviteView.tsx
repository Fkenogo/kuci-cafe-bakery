import React from 'react';
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, LogIn, ShieldAlert } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { AppUserRecord, UserRole } from '../types';
import { claimStaffInvite, fetchInviteByToken, StaffInviteRecord } from '../lib/staffInvites';

interface StaffInviteViewProps {
  user: FirebaseUser | null;
  appUser?: AppUserRecord | null;
  onBackToHome: () => void;
  onGoToAuth: (token: string | null) => void;
  onInviteClaimed: (role: UserRole) => void;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  front_service: 'Front Service',
  bakery_front_service: 'Bakery Front Service',
  kitchen: 'Kitchen',
  barista: 'Barista',
  bakery_account_reconciliation: 'Bakery Reconciliation',
  cafe_account_reconciliation: 'Café Reconciliation',
};

const WORKSPACE_LABELS: Record<string, string> = {
  admin: 'Admin Dashboard',
  front_service: 'Front Service Board',
  bakery_front_service: 'Bakery Front Board',
  kitchen: 'Kitchen Board',
  barista: 'Barista Board',
  bakery_account_reconciliation: 'Reconciliation Board',
  cafe_account_reconciliation: 'Reconciliation Board',
};

function readTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('token');
  return raw?.trim() || null;
}

function isExpired(invite: StaffInviteRecord): boolean {
  if (!invite.expiresAt) return false;
  return invite.expiresAt.toDate().getTime() < Date.now();
}

function formatExpiry(invite: StaffInviteRecord): string {
  if (!invite.expiresAt) return '';
  const diff = invite.expiresAt.toDate().getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `Expires in ${days} day${days === 1 ? '' : 's'}`;
  if (hours > 0) return `Expires in ${hours} hour${hours === 1 ? '' : 's'}`;
  return 'Expires very soon';
}

function humanizeClaimError(message: string): string {
  if (message.includes('revoked')) return 'This invite has been cancelled by the admin.';
  if (message.includes('expired')) return 'This invite has expired. Ask the admin to send a new one.';
  if (message.includes('already been claimed')) return 'This invite has already been used by another account.';
  if (message.includes('different sign-in identity')) return 'wrong_account';
  if (message.includes('not found')) return 'Invite not found. The link may be invalid. Ask the admin for a new invite.';
  return 'Claim failed. Check the link or contact the admin.';
}

export const StaffInviteView: React.FC<StaffInviteViewProps> = ({
  user,
  appUser,
  onBackToHome,
  onGoToAuth,
  onInviteClaimed,
}) => {
  const [token] = React.useState<string | null>(() => readTokenFromUrl());
  const [invite, setInvite] = React.useState<StaffInviteRecord | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [claiming, setClaiming] = React.useState(false);
  const [claimed, setClaimed] = React.useState(false);
  const [redirecting, setRedirecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug('[staff-invite] Entered /staff-invite', {
        hasToken: !!token,
        hasUser: !!user,
        role: appUser?.role || null,
      });
    }
  }, [appUser?.role, token, user]);

  React.useEffect(() => {
    let mounted = true;
    const loadInvite = async () => {
      if (!token) {
        setError('no_token');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const found = await fetchInviteByToken(token);
        if (!mounted) return;
        if (!found) {
          setError('not_found');
          setInvite(null);
        } else {
          if (import.meta.env.DEV) {
            console.debug('[staff-invite] Invite resolved', {
              inviteId: found.id,
              status: found.status,
              role: found.role,
            });
          }
          setInvite(found);
        }
      } catch (loadError) {
        console.error('Failed to load staff invite:', loadError);
        if (mounted) setError('load_error');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadInvite();
    return () => {
      mounted = false;
    };
  }, [token]);

  const handleClaim = async () => {
    if (!token || !user || !invite) return;
    try {
      setClaiming(true);
      setError(null);
      const claimedInvite = await claimStaffInvite({ token, user, appUser });
      setInvite(claimedInvite);
      setClaimed(true);
      setRedirecting(true);
      setTimeout(() => {
        onInviteClaimed(claimedInvite.role);
      }, 1500);
    } catch (claimError) {
      console.error('Failed to claim invite:', claimError);
      const raw = claimError instanceof Error ? claimError.message : 'Invite claim failed.';
      setError(humanizeClaimError(raw));
    } finally {
      setClaiming(false);
    }
  };

  const inviteExpired = invite ? isExpired(invite) : false;
  const isClaimable = !!invite && invite.status === 'pending' && !inviteExpired;

  const roleLabel = invite ? (ROLE_LABELS[invite.role] ?? invite.role.replace(/_/g, ' ')) : '';
  const workspaceLabel = invite ? (WORKSPACE_LABELS[invite.role] ?? 'Staff Workspace') : '';
  const signedInIdentity = user ? (user.email || user.phoneNumber || 'your account') : null;
  const bindingHint = invite?.email
    ? invite.email
    : invite?.phone
      ? invite.phone
      : null;

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto max-w-md min-h-screen px-4 py-6 pb-10 flex flex-col">
        <button
          onClick={onBackToHome}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="mt-6 rounded-[28px] border border-[var(--color-border)] bg-white px-5 py-6 shadow-sm space-y-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-primary)]">KUCI Staff Access</p>
            <h1 className="text-2xl font-serif text-[var(--color-text)] mt-1">Staff invite</h1>
          </div>

          {loading ? (
            <div className="py-8 flex flex-col items-center gap-3 text-[var(--color-text-muted)]">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
              <p className="text-sm">Checking your invite...</p>
            </div>
          ) : (
            <>
              {/* Invite details */}
              {invite && (
                <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-4 space-y-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">You are invited as</p>
                    <p className="text-xl font-serif text-[var(--color-text)] mt-0.5">{roleLabel}</p>
                  </div>

                  {bindingHint && (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Reserved for: <span className="font-semibold text-[var(--color-text)]">{bindingHint}</span>
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      inviteExpired
                        ? 'bg-gray-100 text-gray-500'
                        : invite.status === 'pending'
                          ? 'bg-green-50 text-green-700'
                          : invite.status === 'claimed'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-red-50 text-red-700'
                    }`}>
                      {inviteExpired ? 'Expired' : invite.status}
                    </span>
                    {invite.status === 'pending' && !inviteExpired && (
                      <span className="text-xs text-[var(--color-text-muted)]">{formatExpiry(invite)}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Logged out + claimable */}
              {!user && isClaimable && (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--color-text-muted)]">
                    You have been invited to join KUCI as{' '}
                    <span className="font-semibold text-[var(--color-text)]">{roleLabel}</span>.
                    Sign in to continue.
                  </p>
                  <button
                    onClick={() => onGoToAuth(token)}
                    className="flex w-full items-center justify-between rounded-[20px] bg-[var(--color-primary)] px-5 py-4 text-left text-white"
                  >
                    <div>
                      <p className="text-sm font-black uppercase tracking-widest">Sign in to continue</p>
                      <p className="text-xs text-white/70 mt-0.5">
                        Signing in does not activate access yet — you will confirm on the next step.
                      </p>
                    </div>
                    <LogIn className="w-5 h-5 shrink-0 ml-3" />
                  </button>
                </div>
              )}

              {/* Logged in + claimable */}
              {user && isClaimable && !claimed && (
                <div className="space-y-3">
                  <div className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Signed in as</p>
                    <p className="font-semibold text-[var(--color-text)] mt-0.5">{signedInIdentity}</p>
                  </div>
                  <button
                    onClick={handleClaim}
                    disabled={claiming}
                    className="flex w-full items-center justify-between rounded-[20px] bg-[var(--color-primary)] px-5 py-4 text-left text-white disabled:opacity-60"
                  >
                    <div>
                      <p className="text-sm font-black uppercase tracking-widest">
                        {claiming ? 'Activating access...' : 'Claim invite'}
                      </p>
                      <p className="text-xs text-white/70 mt-0.5">
                        {claiming
                          ? 'Setting up your staff access.'
                          : `This will activate your access to the ${workspaceLabel}.`}
                      </p>
                    </div>
                    {claiming ? (
                      <Loader2 className="w-5 h-5 shrink-0 ml-3 animate-spin" />
                    ) : (
                      <KeyRound className="w-5 h-5 shrink-0 ml-3" />
                    )}
                  </button>
                </div>
              )}

              {/* Success + redirecting */}
              {claimed && (
                <div className="space-y-3">
                  <div className="rounded-[18px] border border-green-200 bg-green-50 px-4 py-4 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-700 mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-green-800">Invite claimed successfully.</p>
                      <p className="text-sm text-green-700">
                        {redirecting
                          ? `Taking you to your ${workspaceLabel}...`
                          : `Welcome to KUCI as ${roleLabel}.`}
                      </p>
                    </div>
                  </div>
                  {redirecting && (
                    <div className="flex items-center justify-center gap-2 py-2 text-sm text-[var(--color-text-muted)]">
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />
                      Redirecting...
                    </div>
                  )}
                </div>
              )}

              {/* No-longer-claimable */}
              {!claimed && invite && (invite.status !== 'pending' || inviteExpired) && (
                <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-4 flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-amber-800">
                      {inviteExpired
                        ? 'This invite has expired.'
                        : invite.status === 'revoked'
                          ? 'This invite has been cancelled.'
                          : 'This invite has already been used.'}
                    </p>
                    <p className="text-xs text-amber-700">Ask the admin to send a new invite link.</p>
                  </div>
                </div>
              )}

              {/* Load / lookup errors */}
              {error && error !== 'wrong_account' && (
                <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-4 space-y-1">
                  <p className="text-sm font-semibold text-red-800">
                    {error === 'no_token' && 'Missing invite token'}
                    {error === 'not_found' && 'Invite not found'}
                    {error === 'load_error' && 'Could not load invite'}
                    {error !== 'no_token' && error !== 'not_found' && error !== 'load_error' && 'Something went wrong'}
                  </p>
                  <p className="text-sm text-red-700">
                    {error === 'no_token' && 'This invite link is incomplete. Ask the admin to re-send the full link.'}
                    {error === 'not_found' && 'This invite link is invalid or has already expired. Ask the admin for a new one.'}
                    {error === 'load_error' && 'Check your connection and reload the page. If this keeps happening, contact the admin.'}
                    {error !== 'no_token' && error !== 'not_found' && error !== 'load_error' && error}
                  </p>
                </div>
              )}

              {/* Wrong account error */}
              {error === 'wrong_account' && (
                <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-4 space-y-1.5">
                  <p className="text-sm font-semibold text-red-800">Wrong account</p>
                  <p className="text-sm text-red-700">
                    This invite is linked to a different email or phone.
                  </p>
                  {signedInIdentity && (
                    <p className="text-xs text-red-600">
                      You are signed in as <span className="font-semibold">{signedInIdentity}</span>.
                      Sign out from the home screen and retry with the correct account.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
