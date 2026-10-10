import { useEffect, useLayoutEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Header from './components/Header';
import HomeLanding from './components/HomeLanding';
import HowItWorks from './components/HowItWorks';
import SignUp from './components/SignUp';
import Footer from './components/Footer';
import SignInModal from './components/SignInModal';
import ProtectedRoute from './components/ProtectedRoute';
import ExporterDashboard from './components/ExporterDashboard';
import VerifierDashboard from './components/VerifierDashboard';
import ManagerDashboard from './components/ManagerDashboard';
import AuthConfirm from './components/AuthConfirm';
import ResetPassword from './components/ResetPassword';
import SalesLeadModal from './components/SalesLeadModal';
import { supabase } from './supabaseClient';
import { ensureProfile } from './utils/profile';
import { getErrorMessage } from './utils/errors';
import './index.css';

const AdminPanel = () => <div style={{ padding: '150px 40px' }}><h2>Global System Controls</h2><p>Manage API integrations, system users, and global compliance rule setups.</p></div>;

function ScrollToTop() {
    const { pathname } = useLocation();

    useLayoutEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }, [pathname]);

    return null;
}

function getDashboardPath(role) {
    if (role === 'verifier') return '/dashboard/verifier';
    if (role === 'manager') return '/dashboard/manager';
    if (role === 'admin') return '/dashboard/admin';
    return '/dashboard/exporter';
}

function AppContent() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [salesModalOpen, setSalesModalOpen] = useState(false);
    const [session, setSession] = useState(null);
    const [profile, setProfile] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        let isMounted = true;

        const loadProfile = async (currentSession) => {
            if (!currentSession?.user) {
                setProfile(null);
                return;
            }

            try {
                const userProfile = await ensureProfile(currentSession.user);
                if (isMounted) {
                    setProfile(userProfile);
                }
            } catch (error) {
                console.error('Profile load error:', getErrorMessage(error));
                if (isMounted) {
                    setProfile(null);
                }
            }
        };

        supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
            if (!isMounted) return;
            setSession(currentSession);
            await loadProfile(currentSession);
            setAuthLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
            if (!isMounted) return;
            setSession(currentSession);

            setTimeout(async () => {
                if (!isMounted) return;
                await loadProfile(currentSession);
                setAuthLoading(false);
            }, 0);
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const handleSignInSuccess = async () => {
        setIsModalOpen(false);
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        setSession(currentSession);

        if (currentSession?.user) {
            try {
                const userProfile = await ensureProfile(currentSession.user);
                setProfile(userProfile);
                navigate(getDashboardPath(userProfile?.role));
            } catch (error) {
                console.error('Post sign-in profile error:', getErrorMessage(error));
                setProfile({
                    id: currentSession.user.id,
                    email: currentSession.user.email,
                    role: 'exporter'
                });
                navigate('/dashboard/exporter');
                throw error;
            }
            return;
        }

        navigate('/dashboard/exporter');
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        navigate('/');
    };

    return (
        <>
            <ScrollToTop />
            <main>
                <Routes>
                    <Route
                        path="/"
                        element={
                            <div className="home-page-shell">
                                <Header onSignInClick={() => setIsModalOpen(true)} />
                                <HomeLanding onTalkToSales={() => setSalesModalOpen(true)} />
                            </div>
                        }
                    />

                    <Route
                        path="/how-it-works"
                        element={
                            <>
                                <Header onSignInClick={() => setIsModalOpen(true)} />
                                <HowItWorks onSignInClick={() => setIsModalOpen(true)} />
                            </>
                        }
                    />

                    <Route path="/pricing" element={<Navigate to="/" replace />} />

                    <Route
                        path="/signup"
                        element={
                            <>
                                <Header onSignInClick={() => setIsModalOpen(true)} />
                                <SignUp onSignInClick={() => setIsModalOpen(true)} />
                            </>
                        }
                    />

                    <Route path="/auth/confirm" element={<AuthConfirm />} />
                    <Route path="/auth/reset-password" element={<ResetPassword />} />

                    <Route
                        path="/dashboard/exporter"
                        element={
                            <ProtectedRoute allowedRoles={['exporter', 'manager', 'admin']} session={session} profile={profile} loading={authLoading}>
                                <ExporterDashboard
                                    session={session}
                                    userProfile={profile}
                                    onProfileUpdated={setProfile}
                                    onLogout={handleLogout}
                                />
                            </ProtectedRoute>
                        }
                    />

                    <Route
                        path="/dashboard/verifier"
                        element={
                            <ProtectedRoute allowedRoles={['verifier', 'manager', 'admin']} session={session} profile={profile} loading={authLoading}>
                                <VerifierDashboard
                                    profile={profile}
                                    onLogout={handleLogout}
                                />
                            </ProtectedRoute>
                        }
                    />

                    <Route
                        path="/dashboard/manager"
                        element={
                            <ProtectedRoute allowedRoles={['manager', 'admin']} session={session} profile={profile} loading={authLoading}>
                                <ManagerDashboard
                                    profile={profile}
                                    onLogout={handleLogout}
                                />
                            </ProtectedRoute>
                        }
                    />

                    <Route
                        path="/dashboard/admin"
                        element={
                            <ProtectedRoute allowedRoles={['admin']} session={session} profile={profile} loading={authLoading}>
                                <AdminPanel />
                            </ProtectedRoute>
                        }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>

            <Footer />

            <SignInModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSignInSuccess={handleSignInSuccess}
            />
            <SalesLeadModal isOpen={salesModalOpen} onClose={() => setSalesModalOpen(false)} />
        </>
    );
}

export default function App() {
    return (
        <Router>
            <AppContent />
        </Router>
    );
}
