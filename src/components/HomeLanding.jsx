import { Link } from 'react-router-dom';
import portHero from '../assets/docuchq-port-hero.png';

const Icon = ({ type }) => {
    const paths = {
        upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></>,
        review: <><path d="M6 3h9l3 3v8" /><path d="M15 3v4h4" /><path d="M8.5 11h5M8.5 14h3" /><circle cx="16.5" cy="17" r="3.5" /><path d="m19 19.5 2 2" /></>,
        submit: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m8 12 2.7 2.7L16.5 9" /></>,
        document: <><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4" /><path d="M9 12h6M9 16h6" /></>,
        shield: <><path d="M12 3 5 6v5c0 4.5 2.8 7.8 7 10 4.2-2.2 7-5.5 7-10V6z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
        list: <><path d="M9 6h10M9 12h10M9 18h10" /><circle cx="5" cy="6" r="1" /><circle cx="5" cy="12" r="1" /><circle cx="5" cy="18" r="1" /></>,
        box: <><path d="m4 7 8-4 8 4-8 4z" /><path d="M4 7v10l8 4 8-4V7M12 11v10" /></>
    };

    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            {paths[type]}
        </svg>
    );
};

const StatusDot = ({ tone, children }) => (
    <span className={`home-status home-status-${tone}`}><i />{children}</span>
);

function DashboardPreview() {
    return (
        <div className="home-product-preview" aria-label="DocuCHQ shipment review dashboard preview">
            <aside className="preview-sidebar">
                <span className="preview-mark">D</span>
                <span className="preview-nav-dot active" />
                <span className="preview-nav-dot" />
                <span className="preview-nav-dot" />
                <span className="preview-nav-dot" />
            </aside>
            <div className="preview-main">
                <div className="preview-topbar">
                    <strong><span>Docu</span>CHQ</strong>
                    <div className="preview-search">Search shipments, documents...</div>
                    <span className="preview-avatar">S</span>
                </div>
                <div className="preview-content">
                    <div className="preview-title-row"><div><small>EXPORT WORKSPACE</small><h3>Shipments</h3></div><button type="button">+ New clearance</button></div>
                    <div className="preview-summary">
                        <span><b>12</b> All shipments</span><span><b>4</b> Under review</span><span><b>2</b> Needs attention</span><span><b>6</b> Compliant</span>
                    </div>
                    <div className="preview-table">
                        <div className="preview-table-row preview-table-head"><span>Reference</span><span>Buyer</span><span>Destination</span><span>Status</span></div>
                        <div className="preview-table-row"><b>DCQ-001</b><span>ABC Exports</span><span>USA</span><StatusDot tone="blue">Under Review</StatusDot></div>
                        <div className="preview-table-row"><b>DCQ-002</b><span>XYZ Trades</span><span>UAE</span><StatusDot tone="red">Discrepancy</StatusDot></div>
                        <div className="preview-table-row"><b>DCQ-003</b><span>Global Metals</span><span>Germany</span><StatusDot tone="green">Compliant</StatusDot></div>
                        <div className="preview-table-row"><b>DCQ-004</b><span>Sunrise Textiles</span><span>UK</span><StatusDot tone="amber">Needs Info</StatusDot></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const steps = [
    { icon: 'upload', title: 'Upload Documents', text: 'Upload export documents such as invoice, packing list, shipping bill and bill of lading.' },
    { icon: 'review', title: 'Review Discrepancies', text: 'DocuCHQ identifies errors, mismatches and missing information.' },
    { icon: 'submit', title: 'Submit with Confidence', text: 'Resolve issues and submit your documents to the bank with confidence.' }
];

const features = [
    { icon: 'document', title: 'Document Validation', text: 'Identify discrepancies in your export documents before bank submission.' },
    { icon: 'shield', title: 'Pre-submission Review', text: 'Ensure all documents are complete and aligned with requirements.' },
    { icon: 'list', title: 'Issue Resolution Support', text: 'Get clear insights on what needs to be corrected.' },
    { icon: 'box', title: 'Export Clearance Readiness', text: 'Submit accurate documents and reduce the risk of bank queries.' }
];

export default function HomeLanding({ onTalkToSales }) {
    return (
        <div className="home-landing">
            <section className="home-hero" style={{ '--hero-image': `url(${portHero})` }}>
                <div className="home-section-inner home-hero-inner">
                    <div className="home-hero-copy">
                        <p className="home-eyebrow">Built for Indian exporters</p>
                        <h1>Avoid Bank Queries.<br />Submit Export Documents<br /><span>with Confidence.</span></h1>
                        <p className="home-hero-lead">Built for Indian exporters to identify documentation discrepancies before bank submission.</p>
                        <div className="home-actions">
                            <Link to="/signup" className="home-primary-action">Start Your Free Trial <span aria-hidden="true">→</span></Link>
                            <button type="button" className="home-secondary-action" onClick={onTalkToSales}>Talk to Sales</button>
                        </div>
                    </div>
                    <div className="home-review-card" aria-hidden="true">
                        <div className="home-invoice-sheet"><small>DOCUCHQ</small><strong>Commercial Invoice</strong><i /><i /><i /><i /></div>
                        <div className="home-checklist">
                            <p><b>✓</b> Invoice</p><p><b>✓</b> Packing List</p><p><b>✓</b> Bill of Lading</p><p><b>✓</b> Certificate of Origin</p><p className="issue"><b>!</b> Discrepancy Found</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="home-platform">
                <div className="home-section-inner home-platform-grid">
                    <div className="home-platform-copy">
                        <p className="home-eyebrow">Platform</p>
                        <h2>A simpler way<br />to review your<br />export documents</h2>
                        <p>Upload your export documents and let DocuCHQ identify discrepancies before you submit them to the bank.</p>
                    </div>
                    <DashboardPreview />
                </div>
            </section>

            <section className="home-steps">
                <div className="home-section-inner">
                    <div className="home-section-heading"><p className="home-eyebrow">How it works</p><h2>Get from upload to submission in 3 simple steps</h2></div>
                    <div className="home-steps-grid">
                        {steps.map((step, index) => (
                            <article className="home-step" key={step.title}>
                                <div className="home-step-icon"><Icon type={step.icon} /><span>{index + 1}</span></div>
                                <h3>{step.title}</h3><p>{step.text}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="home-key-features">
                <div className="home-section-inner">
                    <div className="home-section-heading"><p className="home-eyebrow">Key features</p><h2>Everything you need to avoid documentation issues</h2></div>
                    <div className="home-feature-grid">
                        {features.map((feature) => (
                            <article className="home-feature" key={feature.title}>
                                <div className="home-feature-icon"><Icon type={feature.icon} /></div>
                                <h3>{feature.title}</h3><p>{feature.text}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="home-closing" style={{ '--hero-image': `url(${portHero})` }}>
                <div className="home-section-inner">
                    <div className="home-closing-copy">
                        <p className="home-eyebrow">Built for Indian exporters</p>
                        <h2>Submit Export Documents<br />with Greater Confidence</h2>
                        <p>Start using DocuCHQ to identify documentation discrepancies before bank submission.</p>
                        <div className="home-actions">
                            <Link to="/signup" className="home-primary-action">Start Your Free Trial <span aria-hidden="true">→</span></Link>
                            <button type="button" className="home-secondary-action" onClick={onTalkToSales}>Talk to Sales</button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
