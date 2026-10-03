import { Link } from 'react-router-dom';
import { pricingPlans } from '../data/pricingPlans';

export default function Pricing() {
    return (
        <section className="pricing-section" id="pricing">
            <div className="pricing-header">
                <h2>Simple, transparent pricing built to scale</h2>
                <p>Choose the plan that fits your monthly export shipment volume</p>
            </div>

            <div className="pricing-grid">
                {pricingPlans.map((plan, idx) => (
                    <div className={`pricing-card ${plan.popular ? 'popular-card' : ''}`} key={idx}>
                        {plan.popular && <span className="badge">Most Popular</span>}
                        <h3>{plan.name}</h3>
                        <p className="plan-desc">{plan.desc}</p>

                        <div className="price-container">
                            <span className="price-amt">{plan.price}</span>
                            <span className="price-period">{plan.period}</span>
                        </div>

                        <Link to="/signup" className={`pricing-btn ${plan.popular ? 'btn-filled' : 'btn-outline'}`}>
                            {plan.cta}
                        </Link>

                        <ul className="features-list">
                            {plan.features.map((feature, fIdx) => (
                                <li key={fIdx}>
                                    <span className="checkmark">✓</span> {feature}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </section>
    );
}
