import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../utils/errors';

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [checkingLink, setCheckingLink] = useState(true);
    const [linkValid, setLinkValid] = useState(false);
    const [saving, setSaving] = useState(false);

    const passwordChecks = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /\d/.test(password),
        special: /[^A-Za-z0-9]/.test(password),
        matches: Boolean(confirmPassword) && password === confirmPassword
    };
    const passwordIsValid = Object.values(passwordChecks).every(Boolean);

    useEffect(() => {
        let active = true;

        const prepareRecovery = async () => {
            const code = searchParams.get('code');

            if (code) {
                const { error } = await supabase.auth.exchangeCodeForSession(code);
                if (error) throw error;
            }

            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) throw error;
            if (!session) throw new Error('This password reset link is invalid or has expired.');

            if (active) setLinkValid(true);
        };

        prepareRecovery()
            .catch(() => {
                if (active) setLinkValid(false);
            })
            .finally(() => {
                if (active) setCheckingLink(false);
            });

        return () => {
            active = false;
        };
    }, [searchParams]);

    const handleUpdatePassword = async (event) => {
        event.preventDefault();

        if (!passwordIsValid) {
            showToast('Please meet all password requirements and confirm your password.', 'error');
            return;
        }

        setSaving(true);
        const { error } = await supabase.auth.updateUser({ password });
        setSaving(false);

        if (error) {
            showToast(getErrorMessage(error), 'error');
            return;
        }

        showToast('Your password has been updated. Please sign in with your new password.', 'success');
        await supabase.auth.signOut();
        navigate('/');
    };

    return (
        <div className="password-reset-page">
            <section className="password-reset-card">
                {checkingLink ? (
                    <>
                        <h2>Checking reset link</h2>
                        <p className="subtitle">Please wait while we verify your password recovery request.</p>
                    </>
                ) : linkValid ? (
                    <>
                        <h2>Create a new password</h2>
                        <p className="subtitle">Choose a strong password for your DocuCHQ account.</p>
                        <form onSubmit={handleUpdatePassword}>
                            <label htmlFor="new-password">New Password</label>
                            <input
                                type="password"
                                id="new-password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                autoComplete="new-password"
                                required
                            />
                            <div className="password-requirements" aria-live="polite">
                                {[
                                    ['length', 'At least 8 characters'],
                                    ['uppercase', 'One uppercase letter'],
                                    ['lowercase', 'One lowercase letter'],
                                    ['number', 'One number'],
                                    ['special', 'One special character']
                                ].map(([key, label]) => (
                                    <span key={key} className={passwordChecks[key] ? 'password-rule met' : 'password-rule'}>
                                        <span aria-hidden="true">{passwordChecks[key] ? '✓' : '○'}</span>
                                        {label}
                                    </span>
                                ))}
                            </div>

                            <label htmlFor="confirm-new-password">Confirm New Password</label>
                            <input
                                type="password"
                                id="confirm-new-password"
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                autoComplete="new-password"
                                required
                            />
                            <div className={passwordChecks.matches ? 'password-match met' : 'password-match'}>
                                <span aria-hidden="true">{passwordChecks.matches ? '✓' : '○'}</span>
                                Passwords match
                            </div>

                            <button type="submit" className="continue-btn" disabled={saving || !passwordIsValid}>
                                {saving ? 'Updating password...' : 'Update Password'}
                            </button>
                        </form>
                    </>
                ) : (
                    <>
                        <h2>Reset link unavailable</h2>
                        <p className="subtitle">This password reset link is invalid or has expired. Request a new link from the sign-in window.</p>
                        <button type="button" className="continue-btn" onClick={() => navigate('/')}>Return to Home</button>
                    </>
                )}
            </section>
        </div>
    );
}
