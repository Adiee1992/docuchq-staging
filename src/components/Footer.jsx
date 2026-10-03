import { useState } from 'react';
import footerLogo from '../assets/Footer_Logo_BW.png';
import LegalModal from './LegalModal';
import { privacySections, termsSections } from '../data/legalContent';
import { PRIVACY_EFFECTIVE_DATE, TERMS_EFFECTIVE_DATE } from '../data/legalVersions';

export default function Footer() {
    const [legalDocument, setLegalDocument] = useState(null);

    return (
        <>
            <footer className="footer">
                <div className="footer-content">
                    <div className="footer-left">
                        <span className="footer-brand">
                            <img className="footer-brand-mark" src={footerLogo} alt="" aria-hidden="true" />
                            <span className="brand-wordmark"><span className="brand-docu">Docu</span><span className="brand-chq">CHQ</span></span>
                        </span>
                    </div>
                    <div className="footer-right">
                        <button type="button" onClick={() => setLegalDocument('terms')} className="footer-legal-button">Terms</button>
                        <button type="button" onClick={() => setLegalDocument('privacy')} className="footer-legal-button">Privacy</button>
                        <span>© 2026 DocuCHQ. All rights reserved.</span>
                    </div>
                </div>
            </footer>

            {legalDocument === 'terms' && (
                <LegalModal title="Terms of Use" effectiveDate={TERMS_EFFECTIVE_DATE} sections={termsSections} onClose={() => setLegalDocument(null)} />
            )}
            {legalDocument === 'privacy' && (
                <LegalModal title="Privacy Notice" effectiveDate={PRIVACY_EFFECTIVE_DATE} sections={privacySections} onClose={() => setLegalDocument(null)} />
            )}
        </>
    );
}
