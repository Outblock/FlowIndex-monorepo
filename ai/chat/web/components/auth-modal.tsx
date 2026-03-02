"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { AnimatePresence, motion } from "motion/react";

/* ─── OTP Input (6 slots) ────────────────────────────────────── */

function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function handleKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const arr = value.split("");
      if (arr[i]) {
        arr[i] = "";
        onChange(arr.join(""));
      } else if (i > 0) {
        arr[i - 1] = "";
        onChange(arr.join(""));
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < 5) {
      refs.current[i + 1]?.focus();
    }
  }

  function handleInput(i: number, e: React.FormEvent<HTMLInputElement>) {
    const char = (e.nativeEvent as InputEvent).data;
    if (!char || !/^\d$/.test(char)) return;
    const arr = value.padEnd(6, " ").split("");
    arr[i] = char;
    const next = arr.join("").replace(/ /g, "");
    onChange(next);
    if (i < 5) refs.current[i + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      onChange(pasted);
      refs.current[Math.min(pasted.length, 5)]?.focus();
    }
  }

  return (
    <div className="flex items-center gap-2 justify-center" onPaste={handlePaste}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={value[i] ?? ""}
          autoFocus={i === 0}
          onKeyDown={(e) => handleKey(i, e)}
          onInput={(e) => handleInput(i, e)}
          className="w-11 h-12 text-center text-lg font-bold bg-neutral-800 border border-neutral-700 rounded-lg text-[#00ef8b] focus:outline-none focus:border-[#00ef8b]/50 focus:ring-1 focus:ring-[#00ef8b]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        />
      ))}
    </div>
  );
}

/* ─── Auth Modal ─────────────────────────────────────────────── */

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

export function AuthModal({ open, onClose }: AuthModalProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [verifying, setVerifying] = useState(false);

  const supabase = createClient();

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setEmail("");
      setLoading(false);
      setError(null);
      setOtpSent(false);
      setOtpValue("");
      setVerifying(false);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (err) throw err;
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send magic link");
    } finally {
      setLoading(false);
    }
  }

  const handleVerifyOtp = useCallback(
    async (code: string) => {
      setError(null);
      setVerifying(true);
      try {
        const { error: err } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code,
          type: "email",
        });
        if (err) throw err;
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid code. Please try again.");
        setOtpValue("");
      } finally {
        setVerifying(false);
      }
    },
    [email, supabase, onClose]
  );

  function handleOtpChange(value: string) {
    setOtpValue(value);
    if (value.length === 6) {
      handleVerifyOtp(value);
    }
  }

  async function handleResend() {
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (err) throw err;
      setOtpValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="relative w-full max-w-md"
          >
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8">
              {otpSent ? (
                /* ── OTP Screen ── */
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-[#00ef8b]/10 flex items-center justify-center mx-auto mb-6">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00ef8b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="16" x="2" y="4" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-semibold text-white mb-2">Check your email</h2>
                  <p className="text-neutral-400 mb-1 text-sm">
                    We sent a sign-in link and code to
                  </p>
                  <p className="text-white font-medium mb-6">{email}</p>

                  <p className="text-sm text-neutral-400 mb-4">Enter the 6-digit code:</p>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
                    >
                      {error}
                    </motion.div>
                  )}

                  <div className="mb-6">
                    <OtpInput value={otpValue} onChange={handleOtpChange} disabled={verifying} />
                  </div>

                  {verifying && (
                    <div className="flex items-center justify-center gap-2 text-neutral-400 text-sm mb-4">
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      Verifying...
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-xs text-neutral-500">Or click the magic link in your email</p>
                    <div className="flex items-center justify-center gap-4 text-sm">
                      <button
                        onClick={() => { setOtpSent(false); setOtpValue(""); setError(null); }}
                        className="text-[#00ef8b] hover:text-[#00ef8b]/80 transition-colors"
                        type="button"
                      >
                        Use a different email
                      </button>
                      <span className="text-neutral-700">|</span>
                      <button
                        onClick={handleResend}
                        disabled={loading}
                        className="text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
                        type="button"
                      >
                        {loading ? "Sending..." : "Resend code"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Email Screen ── */
                <>
                  <div className="text-center mb-8">
                    <div className="w-12 h-12 rounded-lg bg-[#00ef8b]/10 flex items-center justify-center mx-auto mb-4">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00ef8b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
                      </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white">Flow AI</h1>
                    <p className="text-sm text-neutral-400 mt-1">Sign in to save your conversations</p>
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
                    >
                      {error}
                    </motion.div>
                  )}

                  <form onSubmit={handleSendLink} className="space-y-4">
                    <div>
                      <label htmlFor="auth-email" className="block text-sm font-medium text-neutral-300 mb-1.5">
                        Email
                      </label>
                      <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="20" height="16" x="2" y="4" rx="2" />
                          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                        </svg>
                        <input
                          id="auth-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          autoFocus
                          className="w-full pl-10 pr-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#00ef8b]/50 focus:ring-1 focus:ring-[#00ef8b]/20 transition-colors text-sm"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#00ef8b] hover:bg-[#00ef8b]/90 text-black font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {loading ? (
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                      ) : (
                        <>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="20" height="16" x="2" y="4" rx="2" />
                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                          </svg>
                          Continue with Email
                        </>
                      )}
                    </button>
                  </form>

                  <p className="mt-6 text-center text-xs text-neutral-500">
                    We&apos;ll send you a magic link and verification code
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
