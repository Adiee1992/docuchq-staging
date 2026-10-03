import { GuideIcon, howItWorksStatusGuide, howItWorksSteps } from './HowItWorks';

const checklist = [
    'Use readable, complete files with meaningful titles.',
    'Confirm names, values, currencies, dates, and reference numbers.',
    'Select the correct destination country and payment method.',
    'Upload only information you are authorised to share.',
    'Retain original records and independent backups.'
];

export default function DashboardHowItWorksModal({ isOpen, onClose }) {
    if (!isOpen) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-how-it-works-title"
            className="dashboard-guide-overlay"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="dashboard-guide-modal">
                <header className="dashboard-guide-header">
                    <div>
                        <p className="guide-eyebrow">Exporter Guide</p>
                        <h2 id="dashboard-how-it-works-title">How it Works</h2>
                        <p>Follow the complete clearance workflow and understand each dashboard status.</p>
                    </div>
                    <button type="button" aria-label="Close How it Works" onClick={onClose}>&times;</button>
                </header>

                <div className="dashboard-guide-body">
                    <section className="dashboard-guide-section">
                        <div className="dashboard-guide-section-heading">
                            <p className="guide-eyebrow">End-to-end workflow</p>
                            <h3>From registration to clearance follow-up</h3>
                            <p>Complete these stages in order for a clean, traceable document-review process.</p>
                        </div>
                        <div className="dashboard-guide-steps">
                            {howItWorksSteps.map((step) => (
                                <article className="dashboard-guide-step" key={step.number}>
                                    <span className="dashboard-guide-number">{step.number}</span>
                                    <span className="dashboard-guide-icon"><GuideIcon type={step.icon} /></span>
                                    <div>
                                        <h4>{step.title}</h4>
                                        <p>{step.summary}</p>
                                        <ul>
                                            {step.details.map((detail) => <li key={detail}>{detail}</li>)}
                                        </ul>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>

                    <section className="dashboard-guide-section dashboard-guide-status">
                        <div className="dashboard-guide-section-heading">
                            <p className="guide-eyebrow">Dashboard language</p>
                            <h3>Understand each status</h3>
                        </div>
                        <div className="guide-status-list">
                            {howItWorksStatusGuide.map((status) => (
                                <div className="guide-status-row" key={status.label}>
                                    <span className={`guide-status-dot ${status.tone}`} />
                                    <strong>{status.label}</strong>
                                    <p>{status.description}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="dashboard-guide-section dashboard-guide-preparation">
                        <div className="dashboard-guide-section-heading">
                            <p className="guide-eyebrow">Before uploading</p>
                            <h3>Prepare a complete file set</h3>
                            <p>Document requirements differ by transaction and bank. Confirm the required list with your AD bank or professional adviser.</p>
                        </div>
                        <div className="guide-checklist">
                            {checklist.map((item) => (
                                <div key={item}><span>✓</span><p>{item}</p></div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
