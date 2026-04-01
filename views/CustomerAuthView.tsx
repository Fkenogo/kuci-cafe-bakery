import React from 'react';
import { auth } from '../lib/firebase';
import {
  ConfirmationResult,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
  signInWithRedirect,
  User,
} from 'firebase/auth';
import { ArrowLeft, LogIn, MessageSquareText, Phone } from 'lucide-react';

interface CustomerAuthViewProps {
  user: User | null;
  onBack: () => void;
  onAuthSuccess: () => void;
}

type AuthScreen = 'entry' | 'phone' | 'otp';

declare global {
  interface Window {
    kuciRecaptchaVerifier?: RecaptchaVerifier;
  }
}

const PHONE_RECATCHA_ID = 'kuci-phone-recaptcha';

export const CustomerAuthView: React.FC<CustomerAuthViewProps> = ({ user, onBack, onAuthSuccess }) => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [screen, setScreen] = React.useState<AuthScreen>('entry');
  const [phoneNumber, setPhoneNumber] = React.useState('');
  const [otpCode, setOtpCode] = React.useState('');
  const [confirmationResult, setConfirmationResult] = React.useState<ConfirmationResult | null>(null);

  const resetPhoneFlow = React.useCallback(() => {
    setScreen('entry');
    setPhoneNumber('');
    setOtpCode('');
    setConfirmationResult(null);
    setError(null);
  }, []);

  const getRecaptchaVerifier = React.useCallback(() => {
    if (window.kuciRecaptchaVerifier) {
      return window.kuciRecaptchaVerifier;
    }

    const verifier = new RecaptchaVerifier(auth, PHONE_RECATCHA_ID, {
      size: 'invisible',
    });

    window.kuciRecaptchaVerifier = verifier;
    return verifier;
  }, []);

  React.useEffect(() => {
    if (user) {
      onAuthSuccess();
    }
  }, [onAuthSuccess, user]);

  React.useEffect(() => {
    return () => {
      if (window.kuciRecaptchaVerifier) {
        window.kuciRecaptchaVerifier.clear();
        delete window.kuciRecaptchaVerifier;
      }
    };
  }, []);

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      setLoading(true);
      setError(null);
      const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 768;
      if (isMobileViewport) {
        await signInWithRedirect(auth, provider);
        return;
      }
      await signInWithPopup(auth, provider);
      onAuthSuccess();
    } catch (signInError) {
      console.error('Error signing in with Google:', signInError);
      setError('Google sign-in failed. Please try again.');
      setLoading(false);
    } finally {
      if (!(typeof window !== 'undefined' && window.innerWidth < 768)) {
        setLoading(false);
      }
    }
  };

  const handleSendOtp = async () => {
    if (!phoneNumber.trim()) {
      setError('Enter a phone number in international format.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const verifier = getRecaptchaVerifier();
      const result = await signInWithPhoneNumber(auth, phoneNumber.trim(), verifier);
      setConfirmationResult(result);
      setScreen('otp');
    } catch (phoneError) {
      console.error('Error starting phone sign-in:', phoneError);
      setError('Could not send the verification code. Check the number format or use a Firebase test number.');
      if (window.kuciRecaptchaVerifier) {
        window.kuciRecaptchaVerifier.clear();
        delete window.kuciRecaptchaVerifier;
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmOtp = async () => {
    if (!confirmationResult) {
      setError('Send the verification code first.');
      return;
    }

    if (!otpCode.trim()) {
      setError('Enter the verification code.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await confirmationResult.confirm(otpCode.trim());
      onAuthSuccess();
    } catch (otpError) {
      console.error('Error confirming phone OTP:', otpError);
      setError('Verification failed. Check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto max-w-md min-h-screen px-4 py-6 pb-10 flex flex-col">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </button>

        <div className="mt-6 rounded-[28px] border border-[var(--color-border)] bg-white px-5 py-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-primary)]">KUCI Access</p>
          <h1 className="text-2xl font-serif text-[var(--color-text)] mt-2">
            {screen === 'entry' ? 'Sign in' : screen === 'phone' ? 'Enter phone number' : 'Enter code'}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {screen === 'entry' && 'Choose how you want to continue.'}
            {screen === 'phone' && 'We will send a verification code by SMS.'}
            {screen === 'otp' && 'Enter the code we just sent to your phone.'}
          </p>

          {screen !== 'entry' && (
            <button
              onClick={() => {
                setError(null);
                setLoading(false);
                setScreen(screen === 'otp' ? 'phone' : 'entry');
                if (screen === 'phone') {
                  resetPhoneFlow();
                }
              }}
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          )}

          <div className="mt-5 space-y-4">
            {screen === 'entry' && (
              <div className="space-y-3">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="flex w-full items-center justify-between rounded-[20px] border border-[var(--color-border)] bg-white px-4 py-4 text-left shadow-sm hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5 disabled:opacity-60"
                >
                  <div>
                    <p className="text-base font-semibold text-[var(--color-text)]">Continue with Google</p>
                    <p className="text-sm text-[var(--color-text-muted)]">Fast sign-in for Google account holders.</p>
                  </div>
                  <LogIn className="w-5 h-5 text-[var(--color-primary)]" />
                </button>

                <button
                  onClick={() => {
                    setError(null);
                    setScreen('phone');
                  }}
                  className="flex w-full items-center justify-between rounded-[20px] border border-[var(--color-border)] bg-white px-4 py-4 text-left shadow-sm hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5"
                >
                  <div>
                    <p className="text-base font-semibold text-[var(--color-text)]">Continue with Phone</p>
                    <p className="text-sm text-[var(--color-text-muted)]">Use SMS verification if you do not use Google.</p>
                  </div>
                  <Phone className="w-5 h-5 text-[var(--color-primary)]" />
                </button>
              </div>
            )}

            {screen === 'phone' && (
              <div className="space-y-4">
                <label className="block space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Phone Number</span>
                  <input
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    placeholder="+2507..."
                    className="w-full rounded-[18px] border border-[var(--color-border)] bg-white px-4 py-4 text-base text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10"
                  />
                </label>

                <button
                  onClick={handleSendOtp}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-4 text-sm font-black uppercase tracking-widest text-white disabled:opacity-60"
                >
                  <MessageSquareText className="w-4 h-4" />
                  {loading ? 'Sending...' : 'Send Verification Code'}
                </button>
              </div>
            )}

            {screen === 'otp' && (
              <div className="space-y-4">
                <div className="rounded-[18px] bg-[var(--color-bg-secondary)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
                  Code sent to <span className="font-semibold text-[var(--color-text)]">{phoneNumber}</span>
                </div>

                <label className="block space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Verification Code</span>
                  <input
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value)}
                    placeholder="123456"
                    className="w-full rounded-[18px] border border-[var(--color-border)] bg-white px-4 py-4 text-base text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10"
                  />
                </label>

                <button
                  onClick={handleConfirmOtp}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-4 text-sm font-black uppercase tracking-widest text-white disabled:opacity-60"
                >
                  {loading ? 'Verifying...' : 'Verify & Sign In'}
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <div id={PHONE_RECATCHA_ID} className="hidden" />
        </div>
      </div>
    </div>
  );
};
