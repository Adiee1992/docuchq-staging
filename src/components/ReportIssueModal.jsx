import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';

export default function ReportIssueModal({ isOpen, onClose, session, profile }) {
    const { showToast } = useToast();
    const [comments, setComments] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    const fullName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Exporter';
    const companyName = profile?.company_name || '-';
    const email = session?.user?.email || profile?.email || '-';
    const mobileNumber = profile?.mobile_number || '-';

    const closeModal = () => {
        if (submitting) return;
        setComments('');
        onClose();
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!comments.trim()) return;

        setSubmitting(true);
        const { error } = await supabase.from('customer_issues').insert({
            profile_id: profile?.id || session?.user?.id,
            full_name: fullName,
            company_name: companyName,
            email,
            mobile_number: mobileNumber,
            comments: comments.trim()
        });
        setSubmitting(false);

        if (error) {
            showToast(error.message || 'The issue could not be submitted.', 'error');
            return;
        }

        showToast('Your issue has been reported to the support team.', 'success');
        setComments('');
        onClose();
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-issue-title"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeModal();
            }}
            style={{ position: 'fixed', inset: 0, zIndex: 650, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'rgba(15, 23, 42, 0.62)' }}
        >
            <form onSubmit={handleSubmit} style={{ width: 'min(620px, calc(100vw - 48px))', maxHeight: '92vh', overflowY: 'auto', boxSizing: 'border-box', padding: '28px 30px', borderRadius: '8px', background: '#FFFFFF', boxShadow: '0 24px 60px rgba(15,23,42,0.24)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '22px' }}>
                    <div>
                        <h2 id="report-issue-title" style={{ margin: '0 0 6px', color: '#0F172A', fontSize: '22px' }}>Report Issue</h2>
                        <p style={{ margin: 0, color: '#64748B', fontSize: '14px', lineHeight: 1.5 }}>Describe the problem and our team will review it.</p>
                    </div>
                    <button type="button" aria-label="Close Report Issue" onClick={closeModal} style={{ border: 0, padding: '0 2px', background: 'transparent', color: '#64748B', cursor: 'pointer', fontSize: '24px', lineHeight: 1 }}>&times;</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', padding: '14px', marginBottom: '20px', border: '1px solid #E2E8F0', borderRadius: '8px', background: '#F8FAFC' }}>
                    {[
                        ['Customer', fullName],
                        ['Company', companyName],
                        ['Email', email],
                        ['Mobile Number', mobileNumber]
                    ].map(([label, value]) => (
                        <div key={label} style={{ minWidth: 0 }}>
                            <p style={{ margin: '0 0 4px', color: '#64748B', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' }}>{label}</p>
                            <p style={{ margin: 0, color: '#0F172A', fontSize: '13px', fontWeight: '700', overflowWrap: 'anywhere' }}>{value}</p>
                        </div>
                    ))}
                </div>

                <label style={{ display: 'block', marginBottom: '7px', color: '#334155', fontSize: '13px', fontWeight: '800' }}>Describe the Issue *</label>
                <textarea
                    required
                    rows="6"
                    value={comments}
                    onChange={(event) => setComments(event.target.value)}
                    placeholder="Explain what happened, where you encountered it, and any relevant reference number."
                    style={{ width: '100%', minHeight: '140px', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', resize: 'vertical', color: '#0F172A', outline: 'none', fontFamily: 'inherit', fontSize: '14px', lineHeight: 1.5 }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
                    <button type="button" disabled={submitting} onClick={closeModal} style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', borderRadius: '8px', padding: '10px 16px', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: '800' }}>Cancel</button>
                    <button type="submit" disabled={submitting || !comments.trim()} style={{ border: 0, background: '#49A8D8', color: '#FFFFFF', borderRadius: '8px', padding: '10px 18px', cursor: submitting || !comments.trim() ? 'not-allowed' : 'pointer', fontWeight: '800', opacity: submitting || !comments.trim() ? 0.65 : 1 }}>
                        {submitting ? 'Submitting...' : 'Submit Issue'}
                    </button>
                </div>
            </form>
        </div>
    );
}
