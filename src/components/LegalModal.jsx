import { useEffect } from 'react';

export default function LegalModal({ title, effectiveDate, sections, onClose }) {
    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-modal-title"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
            style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15, 23, 42, 0.68)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
        >
            <article style={{ width: 'min(880px, calc(100vw - 48px))', maxHeight: '90vh', background: '#FFFFFF', borderRadius: '8px', boxShadow: '0 24px 70px rgba(15, 23, 42, 0.3)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <header style={{ position: 'relative', display: 'block', width: 'auto', padding: '24px 68px 20px 28px', background: '#FFFFFF', borderBottom: '1px solid #E2E8F0', opacity: 1, backdropFilter: 'none' }}>
                    <h2 id="legal-modal-title" style={{ margin: '0 0 6px 0', color: '#0F172A', fontSize: '24px', lineHeight: 1.2 }}>{title}</h2>
                    <p style={{ margin: 0, color: '#64748B', fontSize: '13px' }}>Effective date: {effectiveDate}</p>
                    <button type="button" aria-label={`Close ${title}`} onClick={onClose} style={{ position: 'absolute', top: '20px', right: '24px', width: '34px', height: '34px', border: '1px solid #E2E8F0', borderRadius: '6px', background: '#FFFFFF', color: '#475569', cursor: 'pointer', fontSize: '22px', lineHeight: 1 }}>&times;</button>
                </header>

                <div style={{ padding: '24px 28px 30px', overflowY: 'auto', color: '#334155' }}>
                    <div style={{ marginBottom: '24px', padding: '14px 16px', background: '#F8FAFC', borderLeft: '4px solid #49A8D8', fontSize: '13px', lineHeight: 1.6 }}>
                        This document is an operational legal template for an India-only B2B service. It must be reviewed and completed by qualified Indian legal counsel before production use.
                    </div>

                    {sections.map((section) => (
                        <section key={section.title} style={{ marginBottom: '22px' }}>
                            <h3 style={{ margin: '0 0 9px 0', color: '#0F172A', fontSize: '15px', lineHeight: 1.4 }}>{section.title}</h3>
                            {section.paragraphs.map((paragraph) => (
                                <p key={paragraph} style={{ margin: '0 0 9px 0', color: '#475569', fontSize: '13px', lineHeight: 1.7 }}>{paragraph}</p>
                            ))}
                        </section>
                    ))}
                </div>
            </article>
        </div>
    );
}

