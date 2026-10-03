import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ensureProfile } from '../utils/profile';
import { getErrorMessage } from '../utils/errors';
import { recordLegalAcceptance } from '../utils/legalAcceptance';

function getDashboardPath(role) {
    if (role === 'verifier') return '/dashboard/verifier';
    if (role === 'manager') return '/dashboard/manager';
    if (role === 'admin') return '/dashboard/admin';
    return '/dashboard/exporter';
}

export default function AuthConfirm() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [statusMessage, setStatusMessage] = useState('Verifying your credentials...');

    useEffect(() => {
        const token_hash = searchParams.get('token_hash');
        const code = searchParams.get('code');
        const type = searchParams.get('type') || 'signup';

        const completeVerification = async () => {
            if (code) {
                const { data, error } = await supabase.auth.exchangeCodeForSession(code);
                if (error) throw error;

                const profile = await ensureProfile(data.session?.user);
                await recordLegalAcceptance(data.session?.user, data.session?.user?.app_metadata?.provider === 'google' ? 'google' : 'password');
                setStatusMessage('Email verified successfully! Opening workspace...');
                setTimeout(() => navigate(getDashboardPath(profile?.role)), 1500);
                return;
            }

            if (token_hash) {
                const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
                if (error) throw error;

                const profile = await ensureProfile(data.user);
                await recordLegalAcceptance(data.user, data.user?.app_metadata?.provider === 'google' ? 'google' : 'password');
                setStatusMessage('Email verified successfully! Opening workspace...');
                setTimeout(() => navigate(getDashboardPath(profile?.role)), 1500);
                return;
            }

            const { data: { session: existingSession } } = await supabase.auth.getSession();

            if (existingSession) {
                const profile = await ensureProfile(existingSession.user);
                await recordLegalAcceptance(existingSession.user, existingSession.user?.app_metadata?.provider === 'google' ? 'google' : 'password');
                setStatusMessage('Welcome back! Opening workspace...');
                setTimeout(() => navigate(getDashboardPath(profile?.role)), 1000);
                return;
            }

            setStatusMessage('No verification parameters detected.');
            setTimeout(() => navigate('/'), 2000);
        };

        completeVerification().catch((error) => {
            console.error('Verification error:', getErrorMessage(error));
            setStatusMessage('Verification could not be completed. Please sign in again.');
            setTimeout(() => navigate('/'), 2500);
        });
    }, [searchParams, navigate]);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'sans-serif' }}>
            <div style={{ textAlign: 'center', padding: '30px', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                <div className="spinner" style={{ border: '4px solid #f3f3f3', borderTop: '4px solid #49A8D8', borderRadius: '50%', width: '30px', height: '30px', animation: 'spin 1s linear infinite', margin: '0 auto 15px' }}></div>
                <p style={{ color: '#334155', fontSize: '15px', fontWeight: '500' }}>{statusMessage}</p>
                <style>{`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        </div>
    );
}
