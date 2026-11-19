import logoIcon from '../assets/Logo_Header-Trans.png';

const resultCopy = {
    email_verified: {
        title: 'Email verified',
        message: 'Your email address has been verified successfully. You can now sign in to your DocuCHQ account.'
    },
    email_changed: {
        title: 'Email address updated',
        message: 'Your new email address has been confirmed successfully. Sign in using your new email address.'
    },
    email_change_pending: {
        title: 'One confirmation completed',
        message: 'Your email change is still pending. For security, confirmation is required from both your current and new email addresses. Please open the confirmation link sent to the other address.'
    }
};

export default function AuthResultModal({ result, onSignIn, onClose }) {
    const copy = resultCopy[result];
    if (!copy) return null;

    return (
        <div className="auth-result-overlay" role="presentation">
            <section className="auth-result-modal" role="dialog" aria-modal="true" aria-labelledby="auth-result-title">
                <button type="button" className="auth-result-close" aria-label="Close" onClick={onClose}>&times;</button>
                <div className="auth-result-brand" aria-label="DocuCHQ">
                    <img src={logoIcon} alt="" aria-hidden="true" />
                    <span><span className="brand-docu">Docu</span><span className="brand-chq">CHQ</span></span>
                </div>
                <div className="auth-result-check" aria-hidden="true">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                        <path d="M5 12.5L9.5 17L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>
                <h2 id="auth-result-title">{copy.title}</h2>
                <p>{copy.message}</p>
                <button type="button" className="continue-btn" onClick={onSignIn}>Sign In</button>
            </section>
        </div>
    );
}
