import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { termsSections, privacySections } from '../data/legalContent';
import {
    PRIVACY_DOCUMENT_HASH,
    PRIVACY_EFFECTIVE_DATE,
    PRIVACY_VERSION,
    TERMS_DOCUMENT_HASH,
    TERMS_EFFECTIVE_DATE,
    TERMS_VERSION
} from '../data/legalVersions';
import { acceptCurrentLegalDocuments } from '../utils/legalAcceptance';
import { getErrorMessage } from '../utils/errors';
import LegalModal from './LegalModal';

export default function LegalAcceptanceGate({ session, onLogout, children }) {
    const [status, setStatus] = useState('checking');
    const [errorMessage, setErrorMessage] = useState('');
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [privacyAccepted, setPrivacyAccepted] = useState(false);
    const [openDocument, setOpenDocument] = useState(null);

    const checkAcceptance = useCallback(async () => {
        if (!session?.user?.id) {
            setStatus('checking');
            return;
        }

        setStatus('checking');
        setErrorMessage('');

        const { data, error } = await supabase
            .from('user_legal_acceptances')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('terms_version', TERMS_VERSION)
            .eq('privacy_version', PRIVACY_VERSION)
            .eq('terms_document_hash', TERMS_DOCUMENT_HASH)
            .eq('privacy_document_hash', PRIVACY_DOCUMENT_HASH)
            .maybeSingle();

        if (error) {
            setErrorMessage(getErrorMessage(error, 'We could not verify your legal acceptance.'));
            setStatus('error');
            return;
        }

        setStatus(data ? 'accepted' : 'required');
    }, [session?.user?.id]);

    useEffect(() => {
        checkAcceptance();
    }, [checkAcceptance]);

    useEffect(() => {
        if (status === 'accepted') return undefined;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [status]);

    const handleAccept = async () => {
        if (!termsAccepted || !privacyAccepted || status === 'saving') return;

        setStatus('saving');
        setErrorMessage('');

        try {
            await acceptCurrentLegalDocuments(session.user);
            await checkAcceptance();
        } catch (error) {
            setErrorMessage(getErrorMessage(error, 'Your acceptance could not be saved. Please try again.'));
            setStatus('required');
        }
    };

    if (status === 'accepted') return children;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-acceptance-title"
            style={{ position: 'fixed', inset: 0, zIndex: 9500, display: 'grid', placeItems: 'center', padding: '24px', background: 'rgba(15, 23, 42, 0.72)' }}
        >
            <section style={{ width: 'min(620px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', padding: '30px', border: '1px solid #DCE6EE', borderRadius: '8px', background: '#FFFFFF', boxShadow: '0 24px 70px rgba(15, 23, 42, 0.3)' }}>
                <div style={{ marginBottom: '22px' }}>
                    <p style={{ margin: '0 0 8px', color: '#269BD3', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>Legal update</p>
                    <h2 id="legal-acceptance-title" style={{ margin: '0 0 10px', color: '#0F172A', fontSize: '24px', lineHeight: 1.25 }}>Review and accept the current terms</h2>
                    <p style={{ margin: 0, color: '#64748B', fontSize: '14px', lineHeight: 1.65 }}>
                        Please review the current Terms of Use and Privacy Notice before continuing to your workspace.
                    </p>
                </div>

                {status === 'checking' ? (
                    <p style={{ margin: '24px 0', color: '#475569', textAlign: 'center' }}>Checking your acceptance status...</p>
                ) : status === 'error' ? (
                    <div>
                        <p role="alert" style={{ margin: '0 0 18px', padding: '12px 14px', border: '1px solid #FECACA', borderRadius: '6px', background: '#FEF2F2', color: '#B91C1C', fontSize: '13px' }}>{errorMessage}</p>
                        <button type="button" onClick={checkAcceptance} style={primaryButtonStyle}>Retry</button>
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'grid', gap: '12px', marginBottom: '20px' }}>
                            <label style={acceptanceRowStyle}>
                                <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} style={{ width: '17px', height: '17px', margin: '2px 0 0', accentColor: '#269BD3' }} />
                                <span style={{ color: '#334155', fontSize: '13px', lineHeight: 1.55 }}>
                                    I agree to the{' '}
                                    <button type="button" onClick={() => setOpenDocument('terms')} style={linkButtonStyle}>Terms of Use</button>
                                    <span style={{ display: 'block', color: '#94A3B8', fontSize: '11px' }}>Version {TERMS_VERSION} · effective {TERMS_EFFECTIVE_DATE}</span>
                                </span>
                            </label>

                            <label style={acceptanceRowStyle}>
                                <input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} style={{ width: '17px', height: '17px', margin: '2px 0 0', accentColor: '#269BD3' }} />
                                <span style={{ color: '#334155', fontSize: '13px', lineHeight: 1.55 }}>
                                    I acknowledge the{' '}
                                    <button type="button" onClick={() => setOpenDocument('privacy')} style={linkButtonStyle}>Privacy Notice</button>{' '}
                                    and consent to the described processing of my personal data.
                                    <span style={{ display: 'block', color: '#94A3B8', fontSize: '11px' }}>Version {PRIVACY_VERSION} · effective {PRIVACY_EFFECTIVE_DATE}</span>
                                </span>
                            </label>
                        </div>

                        {errorMessage && <p role="alert" style={{ margin: '0 0 16px', padding: '12px 14px', border: '1px solid #FECACA', borderRadius: '6px', background: '#FEF2F2', color: '#B91C1C', fontSize: '13px' }}>{errorMessage}</p>}

                        <button type="button" onClick={handleAccept} disabled={!termsAccepted || !privacyAccepted || status === 'saving'} style={{ ...primaryButtonStyle, opacity: !termsAccepted || !privacyAccepted || status === 'saving' ? 0.55 : 1, cursor: !termsAccepted || !privacyAccepted || status === 'saving' ? 'not-allowed' : 'pointer' }}>
                            {status === 'saving' ? 'Saving acceptance...' : 'Accept and Continue'}
                        </button>
                    </>
                )}

                <button type="button" onClick={onLogout} style={{ display: 'block', margin: '16px auto 0', padding: 0, border: 0, background: 'transparent', color: '#64748B', fontSize: '13px', cursor: 'pointer' }}>Sign out</button>
            </section>

            {openDocument === 'terms' && (
                <LegalModal title="Terms of Use" effectiveDate={TERMS_EFFECTIVE_DATE} sections={termsSections} onClose={() => setOpenDocument(null)} />
            )}
            {openDocument === 'privacy' && (
                <LegalModal title="Privacy Notice" effectiveDate={PRIVACY_EFFECTIVE_DATE} sections={privacySections} onClose={() => setOpenDocument(null)} />
            )}
        </div>
    );
}

const acceptanceRowStyle = {
    display: 'grid',
    gridTemplateColumns: '18px minmax(0, 1fr)',
    gap: '11px',
    alignItems: 'start',
    padding: '14px',
    border: '1px solid #DCE6EE',
    borderRadius: '7px',
    background: '#F8FAFC'
};

const linkButtonStyle = {
    padding: 0,
    border: 0,
    background: 'transparent',
    color: '#168CC4',
    font: 'inherit',
    fontWeight: 700,
    cursor: 'pointer'
};

const primaryButtonStyle = {
    width: '100%',
    minHeight: '44px',
    padding: '11px 18px',
    border: 0,
    borderRadius: '7px',
    background: '#49A8D8',
    color: '#FFFFFF',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer'
};
