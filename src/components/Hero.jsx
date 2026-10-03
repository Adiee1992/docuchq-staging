import { Link } from 'react-router-dom';

export default function Hero({ onTalkToSales }) {
    return (
        <section className="hero">
            <h1>Avoid Bank Queries.<br />Submit Export Documents with Confidence.</h1>
            <p>
                Built for Indian exporters to identify documentation discrepancies before bank submission.
            </p>
            <div className="hero-buttons">
                <Link to="/signup" className="primary-btn">
                    Start Your Free Trial
                </Link>
                <button type="button" className="secondary-btn" onClick={onTalkToSales}>Talk to Sales</button>
            </div>
        </section>
    );
}
