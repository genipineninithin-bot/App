import React, { useEffect, useState } from 'react';
import { LifeBuoy, Shield, ShieldCheck, UserCheck } from 'lucide-react';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { verifyAndSyncUserProfile } from '../services/firestoreService';
import { AuthUser, UserRole } from '../types/modules';
import { NexoraLogoCenterpiece } from './NexoraBackground';

interface LoginPortalProps {
  onAuthenticated: (user: AuthUser) => void;
}

export const LoginPortal: React.FC<LoginPortalProps> = ({ onAuthenticated }) => {
  const [portalRole, setPortalRole] = useState<UserRole>('citizen');
  const [cachedFbUser, setCachedFbUser] = useState<FirebaseUser | null>(() => auth.currentUser);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingCitizenFallback, setPendingCitizenFallback] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      setCachedFbUser(fbUser);
    });
    return () => unsubscribe();
  }, []);

  const switchPortal = (role: UserRole) => {
    setPortalRole(role);
    setErrorMsg(null);
    setPendingCitizenFallback(false);
  };

  const handleGoogleSignIn = async (targetRole: UserRole) => {
    setErrorMsg(null);
    setPendingCitizenFallback(false);
    setIsSubmitting(true);

    try {
      const credential = await signInWithPopup(auth, googleProvider);
      const { authUser } = await verifyAndSyncUserProfile(credential.user, targetRole);
      onAuthenticated(authUser);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to authenticate with Google.';
      if (targetRole === 'administrator' && msg.includes('Administrator clearance required')) {
        setPendingCitizenFallback(true);
      }
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinueAs = async (targetRole: UserRole) => {
    if (!auth.currentUser) {
      await handleGoogleSignIn(targetRole);
      return;
    }
    setErrorMsg(null);
    setPendingCitizenFallback(false);
    setIsSubmitting(true);
    try {
      const { authUser } = await verifyAndSyncUserProfile(auth.currentUser, targetRole);
      onAuthenticated(authUser);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to enter portal.';
      if (targetRole === 'administrator' && msg.includes('Administrator clearance required')) {
        setPendingCitizenFallback(true);
      }
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSwitchAccount = async () => {
    setErrorMsg(null);
    setPendingCitizenFallback(false);
    await signOut(auth);
    await handleGoogleSignIn(portalRole);
  };

  const isAdmin = portalRole === 'administrator';
  const isRescue = portalRole === 'rescue';

  return (
    <div className="relative z-20 flex-1 flex flex-col items-center justify-center px-4 py-6 sm:py-10 w-full max-w-5xl mx-auto">
      {/* Compact Transparent Logo Centerpiece */}
      <div className="mb-4 sm:mb-6">
        <NexoraLogoCenterpiece />
      </div>

      {/* Multi-Role Portal Login Container (Windows Desktop 2-Pane / Mobile Single-Column) */}
      <div className="w-full max-w-3xl rounded-2xl border border-slate-700/70 bg-[#0C1322]/88 backdrop-blur-xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12">
        {/* Left Role Selector & Scope Brief */}
        <div className="md:col-span-5 p-5 sm:p-6 border-b md:border-b-0 md:border-r border-slate-800 bg-[#090E1A]/90 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Choose Your Account Type
              </h2>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Pick how you want to use NEXORA AI today.
              </p>
            </div>

            {/* Interactive Role Switcher */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => switchPortal('citizen')}
                className={`w-full min-h-[54px] p-3 rounded-xl border text-left transition-all duration-150 flex items-start gap-3 ${
                  portalRole === 'citizen'
                    ? 'bg-blue-600/15 border-blue-500/70 text-white'
                    : 'bg-[#0C1322]/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <UserCheck
                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                    portalRole === 'citizen' ? 'text-blue-400' : 'text-slate-400'
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold">User / Citizen</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    See local alerts, check fake scam links, ask AI, and report emergencies
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => switchPortal('rescue')}
                className={`w-full min-h-[54px] p-3 rounded-xl border text-left transition-all duration-150 flex items-start gap-3 ${
                  isRescue
                    ? 'bg-emerald-500/12 border-emerald-500/70 text-white'
                    : 'bg-[#0C1322]/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <LifeBuoy
                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                    isRescue ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold">Rescue Team</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    See assigned emergencies, update rescue progress, and manage supplies
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => switchPortal('administrator')}
                className={`w-full min-h-[54px] p-3 rounded-xl border text-left transition-all duration-150 flex items-start gap-3 ${
                  isAdmin
                    ? 'bg-amber-500/12 border-amber-500/70 text-white'
                    : 'bg-[#0C1322]/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <Shield
                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                    isAdmin ? 'text-amber-400' : 'text-slate-400'
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold">Administrator</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Manage all alerts, verify reports, assign rescue teams, and control settings
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Portal Scope Details */}
          <div className="pt-4 border-t border-slate-800/80 space-y-1.5 text-[11px] text-slate-400">
            <div className="font-medium text-slate-300">
              {isAdmin
                ? 'What Admins Can Do (All 9 Tools)'
                : isRescue
                ? 'What Rescue Teams Can Do'
                : 'What Citizens Can Do'}
            </div>
            <p className="leading-relaxed">
              {isAdmin
                ? 'Full access to disaster alerts, cyber protection, AI helper, rescue dispatch, shelters, reports, and user settings.'
                : isRescue
                ? 'View live 3D map, check disaster warnings, update rescue steps, and manage hospital/shelter capacity.'
                : 'View live 3D disaster map, find nearby hospitals & shelters, check suspicious links, and ask the AI helper.'}
            </p>
          </div>
        </div>

        {/* Right Firebase Google Auth Pane */}
        <div className="md:col-span-7 p-5 sm:p-6 flex flex-col justify-center space-y-5">
          <div>
            <div className="text-[11px] font-mono text-slate-400">
              {isAdmin
                ? 'Verified Admin Login'
                : isRescue
                ? 'Rescue Responder Login'
                : 'Public Safety Login'}
            </div>
            <h3 className="font-display text-lg font-semibold text-slate-100 mt-0.5">
              {isAdmin
                ? 'Administrator Sign In'
                : isRescue
                ? 'Rescue Team Sign In'
                : 'Citizen Sign In'}
            </h3>
            <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
              {isAdmin
                ? 'Sign in with an approved administrator Google account to manage alerts and rescue teams.'
                : isRescue
                ? 'Sign in with Google to see active rescue requests, maps, and patient status updates.'
                : 'Sign in with Google to view disaster warnings, find shelters, check links for scams, and report emergencies.'}
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-800 bg-[#080C15]/90 space-y-2.5 text-xs text-slate-300">
            <div className="flex items-center gap-2 font-medium text-slate-200">
              <ShieldCheck
                className={`w-4 h-4 shrink-0 ${
                  isAdmin ? 'text-amber-400' : isRescue ? 'text-emerald-400' : 'text-blue-400'
                }`}
                aria-hidden="true"
              />
              <span>
                {isAdmin
                  ? 'Admin Access Details'
                  : isRescue
                  ? 'Connected Rescue Team Account'
                  : 'Safe Citizen Account'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {isAdmin
                ? 'Authorized Primary Admin Google Email: genipineninithin@gmail.com (or any account approved as Administrator inside Module 09 -> Admin Settings). Sign in here to write and send test or live safety alerts in Module 08.'
                : isRescue
                ? 'Your rescue updates and shelter counts sync live across phones and desktop screens.'
                : 'Your emergency reports and alert preferences are saved safely and kept private.'}
            </p>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="px-3.5 py-2.5 text-xs rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 space-y-2"
            >
              <div>{errorMsg}</div>
              {pendingCitizenFallback && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleContinueAs('citizen')}
                    disabled={isSubmitting}
                    className="min-h-[36px] px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition-colors"
                  >
                    Enter User Portal
                  </button>
                  <button
                    type="button"
                    onClick={() => handleContinueAs('rescue')}
                    disabled={isSubmitting}
                    className="min-h-[36px] px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs transition-colors"
                  >
                    Enter Rescue Team
                  </button>
                  <button
                    type="button"
                    onClick={handleSwitchAccount}
                    disabled={isSubmitting}
                    className="min-h-[36px] px-3 py-1.5 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-medium text-xs transition-colors"
                  >
                    Switch Account
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => handleGoogleSignIn(portalRole)}
              disabled={isSubmitting}
              className={`w-full min-h-[48px] px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2.5 ${
                isAdmin
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : isRescue
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
                />
              </svg>
              <span>
                {isSubmitting
                  ? 'Authenticating...'
                  : isAdmin
                  ? 'Sign in with Google (Administrator)'
                  : isRescue
                  ? 'Sign in with Google (Rescue Team)'
                  : 'Sign in with Google (User / Citizen)'}
              </span>
            </button>

            {cachedFbUser?.email && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-800 bg-[#080C15]/80 text-[11px] text-slate-400">
                <span className="truncate">
                  Google account ready: <strong className="text-slate-200">{cachedFbUser.email}</strong>
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleContinueAs(portalRole)}
                    className="text-blue-400 hover:text-blue-300 font-medium underline underline-offset-2 disabled:opacity-50"
                  >
                    Enter Portal
                  </button>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void signOut(auth)}
                    className="text-slate-400 hover:text-slate-200 disabled:opacity-50"
                  >
                    Clear Session
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
