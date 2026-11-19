import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import googleLogo from '../assets/Google_logo.png';
import { ensureProfile } from '../utils/profile';
import { getErrorMessage } from '../utils/errors';
import LegalModal from './LegalModal';
import { privacySections, termsSections } from '../data/legalContent';
import {
    PRIVACY_EFFECTIVE_DATE,
    TERMS_EFFECTIVE_DATE
} from '../data/legalVersions';
import {
    buildLegalAcceptanceMetadata,
    recordLegalAcceptance,
    storePendingLegalAcceptance
} from '../utils/legalAcceptance';
import { GOOGLE_AUTH_ENABLED } from '../config/authFeatures';

function isExistingAccountResponse(error) {
    const value = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
    return value.includes('user_already_exists')
        || value.includes('email_exists')
        || value.includes('already registered')
        || value.includes('already exists');
}

export default function SignUp({ onSignInClick }) {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [mobileNumber, setMobileNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [isVerificationSent, setIsVerificationSent] = useState(false);
    const [verificationEmail, setVerificationEmail] = useState('');
    const [resendingVerification, setResendingVerification] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [privacyAccepted, setPrivacyAccepted] = useState(false);
    const [legalDocument, setLegalDocument] = useState(null);

    const { showToast } = useToast();

    useEffect(() => {
        if (resendCooldown <= 0) return undefined;

        const timer = window.setTimeout(() => {
            setResendCooldown((current) => Math.max(0, current - 1));
        }, 1000);

        return () => window.clearTimeout(timer);
    }, [resendCooldown]);

    const clearForm = () => {
        setFirstName('');
        setLastName('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setCompanyName('');
        setMobileNumber('');
        setTermsAccepted(false);
        setPrivacyAccepted(false);
    };

    const passwordChecks = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /\d/.test(password),
        special: /[^A-Za-z0-9]/.test(password),
        matches: Boolean(confirmPassword) && password === confirmPassword
    };
    const passwordIsValid = Object.values(passwordChecks).every(Boolean);
    const legalAcceptanceIsValid = termsAccepted && privacyAccepted;

    const handleRegister = async (e) => {
        e.preventDefault();

        const normalizedEmail = email.trim().toLowerCase();

        if (mobileNumber.length !== 10) {
            showToast('Enter a valid 10-digit Indian mobile number.', 'error');
            return;
        }

        if (!passwordIsValid) {
            showToast('Please meet all password requirements and confirm your password.', 'error');
            return;
        }

        if (!legalAcceptanceIsValid) {
            showToast('Please accept the Terms of Use and Privacy Notice to create an account.', 'error');
            return;
        }

        setLoading(true);

        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/confirm`,
                data: {
                    first_name: firstName,
                    last_name: lastName,
                    company_name: companyName,
                    mobile_number: `+91${mobileNumber}`,
                    role: 'exporter',
                    ...buildLegalAcceptanceMetadata('password')
                }
            }
        });

        setLoading(false);

        if (authError) {
            if (isExistingAccountResponse(authError)) {
                showToast('Please check your email or sign in if you already have an account.', 'info');
                setVerificationEmail(normalizedEmail);
                setIsVerificationSent(true);
                clearForm();
                return;
            }

            showToast(getErrorMessage(authError), 'error');
            return;
        }

        if (authData?.user && !authData?.session) {
            showToast('Please check your email or sign in if you already have an account.', 'info');
            setVerificationEmail(normalizedEmail);
            setIsVerificationSent(true);
            clearForm();
            return;
        }

        if (authData?.session?.user) {
            try {
                await ensureProfile(authData.session.user);
                await recordLegalAcceptance(authData.session.user, 'password');
                showToast('Account created successfully.', 'success');
                clearForm();
            } catch (profileError) {
                showToast(getErrorMessage(profileError), 'error');
            }
        }
    };

    const handleResendVerification = async () => {
        if (!verificationEmail || resendingVerification || resendCooldown > 0) return;

        setResendingVerification(true);
        const { error } = await supabase.auth.resend({
            type: 'signup',
            email: verificationEmail,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/confirm`
            }
        });
        setResendingVerification(false);

        if (error) {
            const errorText = `${error.code || ''} ${error.message || ''}`.toLowerCase();
            if (errorText.includes('rate') || errorText.includes('seconds') || errorText.includes('too many')) {
                setResendCooldown(60);
                showToast('Please wait before requesting another verification email.', 'info');
                return;
            }

            showToast('The verification email could not be resent. Please try again shortly.', 'error');
            return;
        }

        setResendCooldown(60);
        showToast('If this email is awaiting verification, a new verification link has been sent.', 'success');
    };

    const handleGoogleSignUp = async () => {
        if (!GOOGLE_AUTH_ENABLED) return;

        if (!legalAcceptanceIsValid) {
            showToast('Please accept the Terms of Use and Privacy Notice before continuing with Google.', 'error');
            return;
        }

        setLoading(true);
        storePendingLegalAcceptance('google');
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/confirm`
            }
        });

        if (error) {
            setLoading(false);
            showToast(getErrorMessage(error), 'error');
        }
    };

    if (isVerificationSent) {
        return (
            <div className="signup-page-container">
                <div className="signup-card" style={{ textAlign: 'center', padding: '40px' }}>
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#49A8D8" strokeWidth="2" style={{ marginBottom: '20px', margin: '0 auto' }}>
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                    <h2>Verify your email</h2>
                    <p className="subtitle" style={{ marginTop: '10px', fontSize: '14px', lineHeight: '22px' }}>
                        If an account can be created for this email, we have sent a verification link.
                        If you already have an account, please sign in or use password recovery.
                    </p>
                    <button
                        type="button"
                        onClick={handleResendVerification}
                        disabled={resendingVerification || resendCooldown > 0 || !verificationEmail}
                        className="continue-btn"
                        style={{ marginTop: '24px' }}
                    >
                        {resendingVerification
                            ? 'Sending...'
                            : resendCooldown > 0
                                ? `Resend available in ${resendCooldown}s`
                                : 'Resend Verification Email'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="signup-page-container">
            <div className="signup-card">
                <h2>Create your account</h2>
                <p className="subtitle">Get started with DocuCHQ compliance tools</p>
                {GOOGLE_AUTH_ENABLED && (
                    <>
                        <button className="google-btn" type="button" onClick={handleGoogleSignUp} disabled={loading || !legalAcceptanceIsValid}>
                            <img src={googleLogo} alt="Google" /> Sign up with Google
                        </button>
                        <div className="divider"><span>or</span></div>
                    </>
                )}

                <form onSubmit={handleRegister}>
                    <div style={{ display: 'flex', gap: '15px' }}>
                        <div style={{ flex: 1, textAlign: 'left' }}>
                            <label htmlFor="firstName">First Name</label>
                            <input type="text" id="firstName" placeholder="John" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                        </div>
                        <div style={{ flex: 1, textAlign: 'left' }}>
                            <label htmlFor="lastName">Last Name</label>
                            <input type="text" id="lastName" placeholder="Doe" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                        </div>
                    </div>

                    <label htmlFor="companyName">Company Name</label>
                    <input type="text" id="companyName" placeholder="e.g. Delta Exports Ltd." value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />

                    <label htmlFor="email">Work Email</label>
                    <input type="email" id="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />

                    <label htmlFor="mobileNumber">Mobile Number</label>
                    <div className="signup-mobile-field">
                        <span aria-hidden="true">+91</span>
                        <input
                            type="tel"
                            id="mobileNumber"
                            placeholder="10-digit mobile number"
                            value={mobileNumber}
                            onChange={(event) => setMobileNumber(event.target.value.replace(/\D/g, '').slice(0, 10))}
                            inputMode="numeric"
                            autoComplete="tel-national"
                            pattern="[0-9]{10}"
                            maxLength="10"
                            aria-describedby="mobile-number-help"
                            required
                        />
                    </div>
                    <span id="mobile-number-help" className="signup-field-help">Enter exactly 10 digits after +91.</span>

                    <label htmlFor="password">Password</label>
                    <input type="password" id="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} minLength="8" required />

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

                    <label htmlFor="confirmPassword">Confirm Password</label>
                    <input type="password" id="confirmPassword" placeholder="Re-enter your password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                    <div className={passwordChecks.matches ? 'password-match met' : 'password-match'}>
                        <span aria-hidden="true">{passwordChecks.matches ? '✓' : '○'}</span>
                        Passwords match
                    </div>

                    <div className="signup-legal-acceptance">
                        <label>
                            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                            <span>
                                I agree to the{' '}
                                <button type="button" onClick={() => setLegalDocument('terms')}>Terms of Use</button>.
                            </span>
                        </label>
                        <label>
                            <input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} />
                            <span>
                                I acknowledge the{' '}
                                <button type="button" onClick={() => setLegalDocument('privacy')}>Privacy Notice</button>{' '}
                                and consent to the described processing of my personal data.
                            </span>
                        </label>
                    </div>

                    <button type="submit" className="continue-btn" disabled={loading || mobileNumber.length !== 10 || !passwordIsValid || !legalAcceptanceIsValid}>
                        {loading ? 'Sending verification link...' : 'Create Account'}
                    </button>
                </form>

                <p className="signup-text">
                    Already have an account? <a href="#signin" onClick={(e) => { e.preventDefault(); onSignInClick(); }}>Sign in</a>
                </p>
            </div>

            {legalDocument === 'terms' && (
                <LegalModal title="Terms of Use" effectiveDate={TERMS_EFFECTIVE_DATE} sections={termsSections} onClose={() => setLegalDocument(null)} />
            )}
            {legalDocument === 'privacy' && (
                <LegalModal title="Privacy Notice" effectiveDate={PRIVACY_EFFECTIVE_DATE} sections={privacySections} onClose={() => setLegalDocument(null)} />
            )}
        </div>
    );
}
