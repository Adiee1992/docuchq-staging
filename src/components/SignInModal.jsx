import googleLogo from '../assets/Google_logo.png';
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../utils/errors';
import { GOOGLE_AUTH_ENABLED } from '../config/authFeatures';

export default function SignInModal({ isOpen, onClose, onSignInSuccess }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [resetLoading, setResetLoading] = useState(false);
    const { showToast } = useToast();

    if (!isOpen) return null;

    const closeModal = () => {
        setForgotPasswordOpen(false);
        setResetEmail('');
        onClose();
    };

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            closeModal();
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            setLoading(false);
            showToast(getErrorMessage(error), 'error');
            return;
        }

        try {
            if (onSignInSuccess) {
                await onSignInSuccess();
            }
            showToast('Signed in successfully.', 'success');
        } catch (successError) {
            showToast(getErrorMessage(successError, 'Signed in, but the dashboard could not be opened.'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async (event) => {
        event.preventDefault();
        setResetLoading(true);

        const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
            redirectTo: `${window.location.origin}/auth/reset-password`
        });

        setResetLoading(false);

        if (error) {
            showToast(getErrorMessage(error), 'error');
            return;
        }

        showToast('If an account exists for that email, a password reset link has been sent.', 'success');
        setForgotPasswordOpen(false);
        setResetEmail('');
    };

    return (
        <div className="modal" style={{ display: 'flex' }} onClick={handleOverlayClick}>
            <div className="modal-content">
                <button type="button" className="close modal-close-button" aria-label="Close sign in" onClick={closeModal}>&times;</button>

                <div className="container">
                    {forgotPasswordOpen ? (
                        <>
                            <h2>Reset your password</h2>
                            <p className="subtitle">Enter your account email and we will send you a secure reset link.</p>

                            <form onSubmit={handleForgotPassword}>
                                <label className="modal-field-label" htmlFor="reset-email">Email address</label>
                                <input
                                    type="email"
                                    id="reset-email"
                                    placeholder="you@company.com"
                                    value={resetEmail}
                                    onChange={(event) => setResetEmail(event.target.value)}
                                    autoComplete="email"
                                    required
                                />
                                <button type="submit" className="continue-btn" disabled={resetLoading}>
                                    {resetLoading ? 'Sending reset link...' : 'Send Reset Link'}
                                </button>
                            </form>

                            <button type="button" className="modal-text-button" onClick={() => setForgotPasswordOpen(false)}>
                                Back to Sign In
                            </button>
                        </>
                    ) : (
                        <>
                            <h2>Welcome back</h2>
                            <p className="subtitle">Sign in to manage your documents</p>

                            {GOOGLE_AUTH_ENABLED && (
                                <>
                                    <button className="google-btn" type="button">
                                        <img src={googleLogo} alt="Google Logo" />
                                        Continue with Google
                                    </button>

                                    <div className="divider">
                                        <span>or</span>
                                    </div>
                                </>
                            )}

                            <form onSubmit={handleSubmit}>
                                <input type="email" id="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                                <input type="password" id="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                                <button type="submit" className="continue-btn" disabled={loading}>
                                    {loading ? 'Signing in...' : 'Continue'}
                                </button>
                            </form>

                            <p className="signup-text">
                                <button type="button" className="modal-link-button" onClick={() => {
                                    setResetEmail(email);
                                    setForgotPasswordOpen(true);
                                }}>
                                    Forgot Password
                                </button>
                            </p>
                            <p className="signup-text">Don&apos;t have an account? <a href="/signup">Sign up</a></p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
