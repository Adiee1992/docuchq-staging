import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ children, allowedRoles, session, profile, loading }) {
    if (loading) {
        return (
            <div style={{ padding: '150px 40px', textAlign: 'center' }}>
                Loading secure workspace...
            </div>
        );
    }

    if (!session) {
        return <Navigate to="/" replace />;
    }

    const userRole = profile?.role || 'exporter';

    if (userRole === 'exporter' && profile?.account_status === 'inactive') {
        return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '32px', background: '#F8FAFC', textAlign: 'center' }}><div><h2 style={{ margin: '0 0 8px', color: '#0F172A' }}>Account inactive</h2><p style={{ margin: 0, color: '#64748B' }}>Please contact customer support to reactivate your DocuCHQ account.</p></div></div>;
    }

    if (allowedRoles && !allowedRoles.includes(userRole)) {
        return <Navigate to="/" replace />;
    }

    return children;
}
