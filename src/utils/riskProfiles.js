const additionalCheckCountries = new Set([
    'Algeria',
    'Angola',
    'Bolivia',
    'Bulgaria',
    'Cameroon',
    "Cote d'Ivoire (Ivory Coast)",
    'Democratic Republic of the Congo',
    'Haiti',
    'Kenya',
    'Kuwait',
    'Laos',
    'Lebanon',
    'Monaco',
    'Namibia',
    'Nepal',
    'Papua New Guinea',
    'South Sudan',
    'Syria',
    'Venezuela',
    'Vietnam',
    'British Virgin Islands (UK)',
    'Yemen'
]);

const highRiskCountries = new Set(['Iran', 'North Korea', 'Myanmar']);
const reviewNeededCountries = new Set(['Russia', 'Ukraine', 'Syria', 'Cuba']);

export const riskProfiles = {
    normal: {
        label: 'Normal',
        color: '#35C878',
        background: 'rgba(53, 200, 120, 0.12)'
    },
    additional_checks: {
        label: 'Additional Checks',
        color: '#FF7043',
        background: 'rgba(255, 112, 67, 0.12)'
    },
    high_risk: {
        label: 'High Risk',
        color: '#E23352',
        background: 'rgba(226, 51, 82, 0.12)'
    },
    review_needed: {
        label: 'Review Needed',
        color: '#E9B536',
        background: 'rgba(233, 181, 54, 0.14)'
    }
};

export const riskProfileCountries = [
    ...additionalCheckCountries,
    ...highRiskCountries,
    ...reviewNeededCountries
];

export function getCountryRiskProfile(country) {
    const normalizedCountry = (country || '').trim();

    if (highRiskCountries.has(normalizedCountry)) return riskProfiles.high_risk;
    if (reviewNeededCountries.has(normalizedCountry)) return riskProfiles.review_needed;
    if (additionalCheckCountries.has(normalizedCountry)) return riskProfiles.additional_checks;

    return riskProfiles.normal;
}

export function getTradeReviewProfile(country) {
    const risk = getCountryRiskProfile(country);

    if (risk.label === riskProfiles.high_risk.label) {
        return {
            label: 'Restricted',
            color: riskProfiles.high_risk.color,
            background: riskProfiles.high_risk.background
        };
    }

    if (risk.label === riskProfiles.review_needed.label) {
        return {
            label: 'Check Before Proceeding',
            color: riskProfiles.review_needed.color,
            background: riskProfiles.review_needed.background
        };
    }

    return {
        label: 'Clear',
        color: riskProfiles.normal.color,
        background: riskProfiles.normal.background
    };
}

function ProfileBadge({ profile }) {
    const risk = profile;

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#111827', fontSize: '13px', fontWeight: '700', whiteSpace: 'nowrap' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '999px', background: risk.color, boxShadow: `0 0 0 3px ${risk.background}`, flex: '0 0 12px' }} />
            {risk.label}
        </span>
    );
}

export function RiskBadge({ country }) {
    return <ProfileBadge profile={getCountryRiskProfile(country)} />;
}

export function TradeReviewBadge({ country }) {
    return <ProfileBadge profile={getTradeReviewProfile(country)} />;
}
