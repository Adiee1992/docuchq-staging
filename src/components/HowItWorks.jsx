import { Link } from 'react-router-dom';

export const howItWorksSteps = [
    {
        number: '01',
        title: 'Create a Clearance',
        summary: 'Create one clearance for every export shipment.',
        details: [
            'Enter Buyer Name.',
            'Enter Country.',
            'Enter Payment Method.'
        ],
        icon: 'track'
    },
    {
        number: '02',
        title: 'Upload Documents',
        summary: 'Upload Invoice, Packing List, Shipping Bill, BL/AWB, LC and other supporting documents.',
        details: [
            'Keep each shipment document under the correct clearance.',
            'Upload supporting files so the reviewer can check the full document set.'
        ],
        icon: 'upload'
    },
    {
        number: '03',
        title: 'Get Reviewed',
        summary: 'Our reviewer checks your documents for banking discrepancies and comments on any corrections required.',
        details: [
            'Review comments show what needs correction.',
            'Update or add documents when the reviewer requests clarification.'
        ],
        icon: 'comments'
    },
    {
        number: '04',
        title: 'Submit documents to Bank with Confidence',
        summary: 'Use the reviewed document set to proceed with bank submission.',
        details: [
            'Track the final review status before sharing documents with the bank.',
            'Keep the review trail available for future follow-up.'
        ],
        icon: 'status'
    }
];

export const howItWorksStatusGuide = [
    { label: 'Pending Review', tone: 'blue', description: 'Files are waiting for or undergoing verification.' },
    { label: 'Needs Info', tone: 'amber', description: 'Action or additional information is required from you.' },
    { label: 'Compliant', tone: 'green', description: 'The file review action has been completed successfully.' },
    { label: 'Clearance Issue', tone: 'red', description: 'The track requires intervention or payment follow-up.' }
];

export function GuideIcon({ type }) {
    const paths = {
        account: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M17 8h4" /><path d="M19 6v4" /></>,
        profile: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /><path d="m16.5 12.5 1.5 1.5 3-3" /></>,
        track: <><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4" /><path d="M9 12h6" /><path d="M9 16h6" /></>,
        upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></>,
        status: <><circle cx="12" cy="12" r="8" /><path d="M8.5 12.5 11 15l4.5-6" /></>,
        comments: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8" /><path d="M8 12h5" /></>,
        payment: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></>
    };

    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {paths[type]}
        </svg>
    );
}

export default function HowItWorks({ onSignInClick }) {
    return (
        <div className="how-it-works-page">
            <section className="guide-intro">
                <div className="guide-intro-inner">
                    <p className="guide-eyebrow">Exporter Guide</p>
                    <h1>How DocuCHQ works</h1>
                    <p className="guide-intro-copy">
                        A practical workflow for Indian exporters to organise clearance documents,
                        collaborate with reviewers, and track banking-compliance progress.
                    </p>
                    <div className="guide-intro-actions">
                        <Link to="/signup" className="primary-btn">Create an Account</Link>
                        <button type="button" className="guide-signin-button" onClick={onSignInClick}>Sign In</button>
                    </div>
                </div>
            </section>

            <section className="guide-overview">
                <div className="guide-section-inner">
                    <div className="guide-section-heading">
                        <p className="guide-eyebrow">End-to-end workflow</p>
                        <h2>From registration to clearance follow-up</h2>
                        <p>Complete these stages in order for a clean, traceable document-review process.</p>
                    </div>

                    <div className="guide-steps">
                        {howItWorksSteps.map((step) => (
                            <article className="guide-step" key={step.number}>
                                <div className="guide-step-marker">
                                    <span>{step.number}</span>
                                </div>
                                <div className="guide-step-icon"><GuideIcon type={step.icon} /></div>
                                <div className="guide-step-content">
                                    <h3>{step.title}</h3>
                                    <p className="guide-step-summary">{step.summary}</p>
                                    <ul>
                                        {step.details.map((detail) => <li key={detail}>{detail}</li>)}
                                    </ul>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="guide-final-cta">
                <div className="guide-section-inner">
                    <h2>Ready to organise your first clearance?</h2>
                    <p>Create an exporter account, verify your email, and begin with one complete transaction.</p>
                    <Link to="/signup" className="primary-btn">Start with DocuCHQ</Link>
                </div>
            </section>
        </div>
    );
}
