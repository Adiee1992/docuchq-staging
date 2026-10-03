import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';

const initialForm = {
    fullName: '',
    companyName: '',
    email: '',
    mobileNumber: '',
    comments: ''
};

const fieldStyle = {
    width: '100%',
    height: '42px',
    boxSizing: 'border-box',
    border: '1px solid #CBD5E1',
    borderRadius: '8px',
    padding: '0 12px',
    color: '#0F172A',
    background: '#FFFFFF',
    outline: 'none',
    fontFamily: 'inherit',
    fontSize: '14px'
};

const labelStyle = {
    display: 'block',
    marginBottom: '7px',
    color: '#334155',
    fontSize: '13px',
    fontWeight: '800'
};

export default function SalesLeadModal({ isOpen, onClose }) {
    const { showToast } = useToast();
    const [form, setForm] = useState(initialForm);
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    const closeModal = () => {
        if (submitting) return;
        setForm(initialForm);
        onClose();
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (form.mobileNumber.length !== 10) {
            showToast('Enter a valid 10-digit Indian mobile number.', 'error');
            return;
        }

        setSubmitting(true);
        const { error } = await supabase.from('sales_leads').insert({
            full_name: form.fullName.trim(),
            company_name: form.companyName.trim(),
            email: form.email.trim().toLowerCase(),
            mobile_number: `+91${form.mobileNumber}`,
            comments: form.comments.trim() || null
        });
        setSubmitting(false);

        if (error) {
            showToast(error.message || 'Your inquiry could not be submitted.', 'error');
            return;
        }

        showToast('Thank you. Our sales team will contact you shortly.', 'success');
        setForm(initialForm);
        onClose();
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sales-inquiry-title"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeModal();
            }}
            style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'rgba(15, 23, 42, 0.62)' }}
        >
            <form onSubmit={handleSubmit} style={{ width: 'min(620px, calc(100vw - 48px))', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', padding: '28px 30px', borderRadius: '8px', background: '#FFFFFF', boxShadow: '0 24px 60px rgba(15,23,42,0.24)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '24px' }}>
                    <div>
                        <h2 id="sales-inquiry-title" style={{ margin: '0 0 6px', color: '#0F172A', fontSize: '22px' }}>Talk to Sales</h2>
                        <p style={{ margin: 0, color: '#64748B', fontSize: '14px', lineHeight: 1.5 }}>Tell us about your business and how we can help.</p>
                    </div>
                    <button type="button" aria-label="Close sales inquiry" onClick={closeModal} style={{ border: 0, padding: '0 2px', background: 'transparent', color: '#64748B', cursor: 'pointer', fontSize: '24px', lineHeight: 1 }}>&times;</button>
                </div>

                <div className="sales-lead-form-grid">
                    <div>
                        <label style={labelStyle}>Full Name *</label>
                        <input required autoComplete="name" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} style={fieldStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Company Name *</label>
                        <input required autoComplete="organization" value={form.companyName} onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))} style={fieldStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Work Email *</label>
                        <input type="email" required autoComplete="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} style={fieldStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Mobile Number *</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '62px minmax(0, 1fr)', gap: '8px' }}>
                            <input readOnly aria-label="India country code" value="+91" style={{ ...fieldStyle, padding: 0, textAlign: 'center', fontWeight: '800', background: '#F1F5F9' }} />
                            <input
                                required
                                inputMode="numeric"
                                autoComplete="tel-national"
                                maxLength="10"
                                value={form.mobileNumber}
                                onChange={(event) => setForm((current) => ({ ...current, mobileNumber: event.target.value.replace(/\D/g, '').slice(0, 10) }))}
                                placeholder="10-digit number"
                                style={fieldStyle}
                            />
                        </div>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={labelStyle}>Comments</label>
                        <textarea
                            value={form.comments}
                            onChange={(event) => setForm((current) => ({ ...current, comments: event.target.value }))}
                            placeholder="Tell us about your requirements, expected document volume, or questions."
                            rows="5"
                            style={{ ...fieldStyle, height: '120px', paddingTop: '11px', resize: 'vertical' }}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                    <button type="button" disabled={submitting} onClick={closeModal} style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', borderRadius: '8px', padding: '10px 16px', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: '800' }}>Cancel</button>
                    <button type="submit" disabled={submitting} style={{ border: 0, background: '#49A8D8', color: '#FFFFFF', borderRadius: '8px', padding: '10px 18px', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: '800', opacity: submitting ? 0.7 : 1 }}>
                        {submitting ? 'Submitting...' : 'Submit Inquiry'}
                    </button>
                </div>
            </form>
        </div>
    );
}
