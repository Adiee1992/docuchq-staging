const featureData = [
    {
        icon: "discrepancy",
        title: "Detect document discrepancies",
        desc: "Spot missing details, mismatches, and avoidable documentation gaps before files reach the bank."
    },
    {
        icon: "shipment",
        title: "Organize shipments",
        desc: "Keep each shipment's documents, references, comments, and review trail together."
    },
    {
        icon: "clock",
        title: "Track review status",
        desc: "See whether documents are pending review, compliant, need action, or have a clearance issue."
    },
    {
        icon: "delay",
        title: "Reduce delays",
        desc: "Resolve preventable issues earlier so payment follow-up is not slowed by document queries."
    }
];

function FeatureIcon({ type }) {
    if (type === 'clock') {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="8.25" />
                <path d="M12 7.5v5l3.3 2" />
            </svg>
        );
    }

    if (type === 'shipment') {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M3.75 8.25h6.6l1.65 2h8.25v8H3.75z" />
                <path d="M3.75 8.25V6.5h6.15l1.35 1.75" />
                <path d="M7 13.25h10M7 16h6" />
            </svg>
        );
    }

    if (type === 'delay') {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6.75 4.5h10.5M6.75 19.5h10.5" />
                <path d="M8 4.5c0 3.35 2.1 4.8 4 6 1.9-1.2 4-2.65 4-6" />
                <path d="M8 19.5c0-3.35 2.1-4.8 4-6 1.9 1.2 4 2.65 4 6" />
                <path d="M12 8.4v.1M12 15.5v.1" />
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7 3.75h6.6L17 7.15v13.1H7z" />
            <path d="M13.5 3.95V7.3h3.3" />
            <path d="M9.35 12.1l1.55 1.55 3.85-4.1" />
            <path d="M9.4 17.1h5.2" />
        </svg>
    );
}

export default function Features() {
    return (
        <section className="features">
            <div className="features-header">
                <h2>Get Started</h2>
                <p>Why DocuCHQ?</p>
            </div>

            <div className="features-grid">
                {featureData.map((feature, idx) => (
                    <div className="feature-card" key={idx}>
                        <div className="icon"><FeatureIcon type={feature.icon} /></div>
                        <h3>{feature.title}</h3>
                        <p>{feature.desc}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}
