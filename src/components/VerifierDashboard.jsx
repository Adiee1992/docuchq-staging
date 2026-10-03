import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import InternalDocumentModal from './InternalDocumentModal';
import { getCountryRiskProfile, getTradeReviewProfile, RiskBadge, TradeReviewBadge } from '../utils/riskProfiles';
import { documentTypes } from '../data/documentTypes';
import logoIcon from '../assets/Logo_Header-Trans.png';
import logoFallback from '../assets/Logo_Header.JPG';

const statusMeta = {
    pending_review: { label: 'Pending Review', color: '#49A8D8', background: 'rgba(29, 78, 216, 0.1)' },
    needs_info: { label: 'Needs Info', color: '#A16207', background: 'rgba(161, 98, 7, 0.1)' },
    approved: { label: 'Compliant', color: '#15803D', background: 'rgba(21, 128, 61, 0.1)' },
    clearance_issue: { label: 'Clearance Issue', color: '#B91C1C', background: 'rgba(185, 28, 28, 0.1)' },
    rejected: { label: 'Rejected', color: '#64748B', background: '#F1F5F9' },
    cancelled: { label: 'Cancelled', color: '#64748B', background: '#F1F5F9' }
};

function formatDate(value) {
    if (!value) return '-';
    return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).format(new Date(value));
}

function formatBytes(bytes) {
    if (!bytes) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function getTrackStatus(documents) {
    if (documents.some((document) => document.escalated_to_manager)) return 'clearance_issue';
    if (documents.some((document) => document.status === 'clearance_issue')) return 'clearance_issue';
    if (documents.some((document) => document.status === 'needs_info')) return 'needs_info';
    if (documents.some((document) => document.status === 'pending_review')) return 'pending_review';
    if (documents.every((document) => document.status === 'approved')) return 'approved';
    return documents[0]?.status || 'pending_review';
}

function statusFromTab(tab) {
    if (tab === 'Compliant') return 'approved';
    return tab.toLowerCase().replace(/\s+/g, '_');
}

const dateFilterTabs = ['All Dates', 'Today', 'This Week', 'This Month', 'This Year'];

function matchesDateFilter(value, filter) {
    if (filter === 'All Dates') return true;
    if (!value) return false;

    const date = new Date(value);
    const now = new Date();
    if (Number.isNaN(date.getTime())) return false;

    if (filter === 'Today') {
        return date.toDateString() === now.toDateString();
    }

    if (filter === 'This Week') {
        const startOfWeek = new Date(now);
        const daysSinceMonday = (startOfWeek.getDay() + 6) % 7;
        startOfWeek.setDate(startOfWeek.getDate() - daysSinceMonday);
        startOfWeek.setHours(0, 0, 0, 0);
        return date >= startOfWeek && date <= now;
    }

    if (filter === 'This Month') {
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    }

    if (filter === 'This Year') {
        return date.getFullYear() === now.getFullYear();
    }

    return true;
}

function MetricIcon({ color, type }) {
    const iconPath = {
        pending: (
            <>
                <circle cx="12" cy="12" r="7"></circle>
                <path d="M12 8v4l3 2"></path>
            </>
        ),
        info: (
            <>
                <circle cx="12" cy="12" r="7"></circle>
                <path d="M12 11v5"></path>
                <path d="M12 8h.01"></path>
            </>
        ),
        approved: (
            <>
                <circle cx="12" cy="12" r="7"></circle>
                <path d="m9.5 12.5 1.7 1.7 3.4-4"></path>
            </>
        ),
        issue: (
            <>
                <circle cx="12" cy="12" r="7"></circle>
                <path d="M12 8v5"></path>
                <path d="M12 16h.01"></path>
            </>
        ),
        escalated: (
            <>
                <circle cx="12" cy="12" r="7"></circle>
                <path d="M8 12h8"></path>
                <path d="m13 9 3 3-3 3"></path>
            </>
        ),
        total: (
            <>
                <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"></path>
                <path d="M14 2v5h5"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h4"></path>
            </>
        )
    };

    return (
        <div style={{ width: '42px', height: '42px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}18`, flex: '0 0 42px' }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                {iconPath[type] || iconPath.total}
            </svg>
        </div>
    );
}

const trackTableColumns = '44px minmax(150px, 1.3fr) minmax(120px, 1fr) minmax(110px, 0.9fr) minmax(145px, 0.95fr) minmax(190px, 1.1fr) minmax(95px, 0.8fr) minmax(120px, 0.9fr) minmax(105px, 0.8fr) 120px 140px 170px';
const trackTableMinWidth = 1610;
const trackScrollableWidth = 1298;
const stickyActionStyle = {
    position: 'sticky',
    right: 0,
    zIndex: 4,
    background: '#FFFFFF',
    boxShadow: '-12px 0 0 #FFFFFF',
    minHeight: '44px',
    display: 'flex',
    alignItems: 'center'
};
const stickyStatusStyle = {
    position: 'sticky',
    right: '182px',
    zIndex: 4,
    background: '#FFFFFF',
    boxShadow: '-12px 0 0 #FFFFFF, 12px 0 0 #FFFFFF',
    minHeight: '44px',
    display: 'flex',
    alignItems: 'center'
};
const stickyHeaderActionStyle = {
    ...stickyActionStyle,
    zIndex: 5,
    background: '#F8FAFC',
    boxShadow: '-12px 0 0 #F8FAFC'
};
const stickyHeaderStatusStyle = {
    ...stickyStatusStyle,
    zIndex: 5,
    background: '#F8FAFC',
    boxShadow: '-12px 0 0 #F8FAFC, 12px 0 0 #F8FAFC'
};
const stickyFileActionStyle = {
    ...stickyActionStyle,
    background: '#FBFEFD',
    boxShadow: '-12px 0 0 #FBFEFD',
    minHeight: '36px'
};

const softBlueButtonStyle = {
    border: '1px solid rgba(73, 168, 216, 0.32)',
    background: 'rgba(73, 168, 216, 0.1)',
    color: '#2789B8',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '800',
    fontSize: '12px'
};

export default function VerifierDashboard({ profile, onLogout }) {
    const { showToast } = useToast();
    const tableScrollRef = useRef(null);
    const topTableScrollRef = useRef(null);
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('All');
    const [activeDateFilter, setActiveDateFilter] = useState('All Dates');
    const [searchTerm, setSearchTerm] = useState('');
    const [collapsedTracks, setCollapsedTracks] = useState({});
    const [selectedDocument, setSelectedDocument] = useState(null);
    const [queryDiagnostics, setQueryDiagnostics] = useState({
        count: 0,
        error: '',
        checkedAt: ''
    });

    const syncTopTableScroll = (event) => {
        if (tableScrollRef.current && tableScrollRef.current.scrollLeft !== event.currentTarget.scrollLeft) {
            tableScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }
    };

    const syncMainTableScroll = (event) => {
        if (topTableScrollRef.current && topTableScrollRef.current.scrollLeft !== event.currentTarget.scrollLeft) {
            topTableScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }
    };

    const loadDocuments = async () => {
        if (!profile?.id) return;

        setLoading(true);
        const { data, error } = await supabase
            .from('documents')
            .select('*')
            .eq('assigned_verifier_id', profile.id)
            .order('submitted_at', { ascending: false });
        setLoading(false);

        if (error) {
            setQueryDiagnostics({
                count: 0,
                error: error.message,
                checkedAt: new Date().toLocaleTimeString()
            });
            showToast(error.message, 'error');
            return;
        }

        setQueryDiagnostics({
            count: data?.length || 0,
            error: '',
            checkedAt: new Date().toLocaleTimeString()
        });
        setDocuments(data || []);
    };

    useEffect(() => {
        loadDocuments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile?.id]);

    const tracks = useMemo(() => {
        const map = new Map();

        documents.forEach((document) => {
            const referenceId = document.reference_id || 'UNREFERENCED';
            if (!map.has(referenceId)) {
                map.set(referenceId, {
                    referenceId,
                    documents: [],
                    submittedAt: document.submitted_at,
                    paymentMethod: document.payment_method || '-',
                    adBankName: document.ad_bank_name || '-',
                    customerName: document.customer_name || '-',
                    destinationCountry: document.destination_country || '-',
                    invoiceCurrency: document.invoice_currency || '-'
                });
            }

            const track = map.get(referenceId);
            track.documents.push(document);
            if (new Date(document.submitted_at) < new Date(track.submittedAt)) {
                track.submittedAt = document.submitted_at;
            }
        });

        return Array.from(map.values()).map((track) => ({
            ...track,
            status: getTrackStatus(track.documents)
        }));
    }, [documents]);

    const dateFilteredTracks = useMemo(() => (
        tracks.filter((track) => matchesDateFilter(track.submittedAt, activeDateFilter))
    ), [activeDateFilter, tracks]);

    const filteredTracks = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        const statusFilter = activeTab === 'All' || activeTab === 'Escalated' ? null : statusFromTab(activeTab);

        return dateFilteredTracks.filter((track) => {
            const riskLabel = getCountryRiskProfile(track.destinationCountry).label.toLowerCase();
            const tradeReviewLabel = getTradeReviewProfile(track.destinationCountry).label.toLowerCase();
            const matchesTab = activeTab === 'All'
                || (activeTab === 'Escalated' && track.documents.some((document) => document.escalated_to_manager))
                || (!statusFilter || track.status === statusFilter);

            const matchesSearch = !query
                || track.referenceId.toLowerCase().includes(query)
                || track.paymentMethod.toLowerCase().includes(query)
                || track.adBankName.toLowerCase().includes(query)
                || track.customerName.toLowerCase().includes(query)
                || track.destinationCountry.toLowerCase().includes(query)
                || riskLabel.includes(query)
                || tradeReviewLabel.includes(query)
                || track.invoiceCurrency.toLowerCase().includes(query)
                || track.documents.some((document) => (
                    document.title?.toLowerCase().includes(query)
                    || document.file_name?.toLowerCase().includes(query)
                    || document.document_type?.toLowerCase().includes(query)
                ));

            return matchesTab && matchesSearch;
        });
    }, [activeTab, dateFilteredTracks, searchTerm]);

    const metrics = [
        { label: 'Assigned Tracks', value: dateFilteredTracks.length, color: '#0F172A', icon: 'total' },
        { label: 'Pending Review', value: dateFilteredTracks.filter((track) => track.status === 'pending_review').length, color: '#49A8D8', icon: 'pending' },
        { label: 'Needs Info', value: dateFilteredTracks.filter((track) => track.status === 'needs_info').length, color: '#A16207', icon: 'info' },
        { label: 'Clearance Issue', value: dateFilteredTracks.filter((track) => track.status === 'clearance_issue').length, color: '#B91C1C', icon: 'issue' },
        { label: 'Escalated', value: dateFilteredTracks.filter((track) => track.documents.some((document) => document.escalated_to_manager)).length, color: '#B91C1C', icon: 'escalated' },
        { label: 'Compliant', value: dateFilteredTracks.filter((track) => track.status === 'approved').length, color: '#15803D', icon: 'approved' }
    ];

    const updateDocumentType = async (documentId, documentType) => {
        const previousType = documents.find((document) => document.id === documentId)?.document_type || 'Other';
        setDocuments((current) => current.map((document) => document.id === documentId ? { ...document, document_type: documentType } : document));
        const { data, error } = await supabase.rpc('classify_document_type', { document_id_input: documentId, document_type_input: documentType });
        if (error || data !== documentType) {
            setDocuments((current) => current.map((document) => document.id === documentId ? { ...document, document_type: previousType } : document));
            showToast(error?.message || 'The document type could not be saved.', 'error');
            return;
        }
        showToast('Document type updated.', 'success');
    };

    return (
        <div className="dashboard-container" style={{ background: '#F8FAFC', minHeight: '100vh', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 40px', background: '#fff', borderBottom: '1px solid #E2E8F0' }}>
                <div className="header-logo" style={{ display: 'flex', alignItems: 'center' }}>
                    <span className="dashboard-brand">
                        <img src={logoIcon} alt="" aria-hidden="true" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = logoFallback; }} style={{ display: 'block', width: '44px', height: '44px', objectFit: 'contain', flex: '0 0 44px' }} />
                        <span className="brand-wordmark"><span className="brand-docu">Docu</span><span className="brand-chq">CHQ</span></span>
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '28px', padding: '0 14px', borderRadius: '999px', background: 'rgba(73, 168, 216, 0.14)', color: '#49A8D8', fontSize: '13px', lineHeight: 1, fontWeight: '700', letterSpacing: 0, boxSizing: 'border-box' }}>Verifier</span>
                    <button onClick={onLogout} style={{ border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#334155', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontWeight: '700', whiteSpace: 'nowrap', minWidth: '76px' }}>Log Out</button>
                </div>
            </header>

            <main className="dashboard-content" style={{ paddingBottom: '40px' }}>
                <div className="content-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '32px 40px 8px 40px' }}>
                    <div>
                        <h1 style={{ fontSize: '28px', color: '#0F172A', margin: '0 0 6px 0', fontWeight: '700' }}>Verifier Workspace</h1>
                        <p style={{ margin: 0, color: '#64748B', fontSize: '15px' }}>Review assigned clearance tracks, files, comments, and escalation context.</p>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(135px, 1fr))', gap: '12px', padding: '20px 40px 18px 40px' }}>
                    {metrics.map((metric) => (
                        <div key={metric.label} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', minHeight: '74px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <MetricIcon color={metric.color} type={metric.icon} />
                            <div style={{ minWidth: 0 }}>
                                <p style={{ margin: 0, color: metric.color, fontSize: '24px', lineHeight: 1.05, fontWeight: '800' }}>{metric.value}</p>
                                <p style={{ margin: '5px 0 0 0', color: metric.color, fontSize: '12px', lineHeight: 1.2, fontWeight: '700', whiteSpace: 'nowrap' }}>{metric.label}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="document-submissions-table" style={{ padding: '20px 40px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
                        <div style={{ color: '#475569', fontSize: '12px', lineHeight: 1.5 }}>
                            <strong style={{ color: '#0F172A' }}>Verifier ID:</strong> {profile?.id || '-'}<br />
                            <strong style={{ color: '#0F172A' }}>Rows returned:</strong> {queryDiagnostics.count}
                            {queryDiagnostics.checkedAt ? ` at ${queryDiagnostics.checkedAt}` : ''}
                            {queryDiagnostics.error && <span style={{ color: '#B91C1C' }}> · {queryDiagnostics.error}</span>}
                        </div>
                        <button onClick={loadDocuments} style={{ ...softBlueButtonStyle, padding: '8px 12px' }}>Refresh Assigned Tracks</button>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid #EEF2F7', paddingBottom: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                        {dateFilterTabs.map((tab) => {
                            const isActive = activeDateFilter === tab;
                            return (
                                <button key={tab} onClick={() => setActiveDateFilter(tab)} style={{ border: 'none', borderRadius: '7px', padding: '6px 12px', cursor: 'pointer', fontWeight: '700', fontSize: '12px', background: isActive ? '#49A8D8' : 'transparent', color: isActive ? '#FFFFFF' : '#64748B' }}>{tab}</button>
                            );
                        })}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', gap: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {['All', 'Pending Review', 'Needs Info', 'Compliant', 'Clearance Issue', 'Escalated'].map((tab) => (
                                <button key={tab} onClick={() => setActiveTab(tab)} style={{ border: 'none', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontWeight: '700', background: activeTab === tab ? '#49A8D8' : 'transparent', color: activeTab === tab ? '#FFFFFF' : '#64748B' }}>{tab}</button>
                            ))}
                        </div>

                        <input
                            type="text"
                            placeholder="Search reference, bank, file..."
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '14px', width: '260px', height: '36px', boxSizing: 'border-box', outline: 'none', color: '#0F172A' }}
                        />
                    </div>

                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                        <div
                            ref={topTableScrollRef}
                            onScroll={syncTopTableScroll}
                            style={{ overflowX: 'auto', overflowY: 'hidden', marginRight: '322px', height: '13px', borderBottom: '1px solid #E2E8F0', background: '#FFFFFF' }}
                        >
                            <div style={{ width: `${trackScrollableWidth}px`, height: '1px' }} />
                        </div>

                        <div ref={tableScrollRef} className="hide-horizontal-scrollbar" onScroll={syncMainTableScroll} style={{ overflowX: 'auto', overflowY: 'hidden' }}>
                            <div style={{ minWidth: `${trackTableMinWidth}px` }}>
                                <div style={{ display: 'grid', gridTemplateColumns: trackTableColumns, gap: '12px', padding: '14px 20px', background: '#F8FAFC', color: '#475569', fontSize: '13px', fontWeight: '800' }}>
                                    {['', 'Reference Track', 'Customer', 'Country', 'Risk', 'Trade Review', 'Currency', 'Payment Method', 'AD Bank', 'Submitted', 'Status', 'Action'].map((heading, index) => (
                                        <span
                                            key={heading}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                whiteSpace: heading === 'Payment Method' ? 'normal' : 'nowrap',
                                                ...(index === 10 ? stickyHeaderStatusStyle : {}),
                                                ...(index === 11 ? stickyHeaderActionStyle : {})
                                            }}
                                        >
                                            {heading}
                                        </span>
                                    ))}
                                </div>

                                {loading ? (
                                    <div style={{ padding: '80px 20px', textAlign: 'center', color: '#64748B' }}>Loading assigned tracks...</div>
                                ) : filteredTracks.length === 0 ? (
                                    <div style={{ padding: '80px 20px', textAlign: 'center', color: '#94A3B8' }}>No assigned tracks found for this view.</div>
                                ) : (
                                    filteredTracks.map((track) => {
                                        const meta = statusMeta[track.status] || statusMeta.pending_review;
                                        const collapsed = collapsedTracks[track.referenceId] !== false;

                                        return (
                                            <React.Fragment key={track.referenceId}>
                                                <div style={{ display: 'grid', gridTemplateColumns: trackTableColumns, gap: '12px', padding: '14px 20px', borderTop: '1px solid #E2E8F0', alignItems: 'center' }}>
                                            <button onClick={() => setCollapsedTracks((current) => ({ ...current, [track.referenceId]: !collapsed }))} style={{ border: 'none', background: '#F1F5F9', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', color: '#334155', fontWeight: '800' }}>{collapsed ? '+' : '-'}</button>
                                            <div>
                                                <p style={{ margin: 0, color: '#0F172A', fontWeight: '800', fontSize: '14px' }}>{track.referenceId}</p>
                                                <p style={{ margin: '4px 0 0 0', color: '#94A3B8', fontSize: '12px' }}>{track.documents.length} file{track.documents.length === 1 ? '' : 's'}</p>
                                            </div>
                                            <span style={{ color: '#475569', fontSize: '13px' }}>{track.customerName}</span>
                                            <span style={{ color: '#475569', fontSize: '13px' }}>{track.destinationCountry}</span>
                                            <RiskBadge country={track.destinationCountry} />
                                            <TradeReviewBadge country={track.destinationCountry} />
                                            <span style={{ color: '#475569', fontSize: '13px', fontWeight: '700' }}>{track.invoiceCurrency}</span>
                                            <span style={{ color: '#475569', fontSize: '13px', fontWeight: '700' }}>{track.paymentMethod}</span>
                                            <span style={{ color: '#475569', fontSize: '13px' }}>{track.adBankName}</span>
                                            <span style={{ color: '#475569', fontSize: '13px' }}>{formatDate(track.submittedAt)}</span>
                                            <div style={stickyStatusStyle}>
                                                <span style={{ width: 'fit-content', borderRadius: '999px', padding: '5px 10px', fontSize: '12px', fontWeight: '800', color: meta.color, background: meta.background, whiteSpace: 'nowrap' }}>{track.documents.some((document) => document.escalated_to_manager) ? 'Escalated' : meta.label}</span>
                                            </div>
                                            <div style={stickyActionStyle}>
                                                <button onClick={() => setCollapsedTracks((current) => ({ ...current, [track.referenceId]: false }))} style={{ ...softBlueButtonStyle, width: 'fit-content', padding: '7px 10px' }}>View Files</button>
                                            </div>
                                        </div>

                                        {!collapsed && (
                                            <div style={{ background: '#FBFEFD', borderTop: '1px solid #E2E8F0', padding: '8px 20px 14px 64px' }}>
                                                {track.documents.map((document) => {
                                                    const documentMeta = statusMeta[document.status] || statusMeta.pending_review;
                                                    return (
                                                        <div key={document.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.1fr 1.1fr 1fr 1.2fr', alignItems: 'center', gap: '12px', padding: '10px 0', borderTop: '1px solid #E2E8F0' }}>
                                                            <div>
                                                                <p style={{ margin: 0, color: '#0F172A', fontWeight: '800', fontSize: '13px', overflowWrap: 'anywhere' }}>{document.file_name}</p>
                                                                <p style={{ margin: '4px 0 0 0', color: '#94A3B8', fontSize: '12px' }}>{formatBytes(document.file_size)}</p>
                                                            </div>
                                                            <select aria-label={`Document type for ${document.file_name}`} value={document.document_type || 'Other'} onChange={(event) => updateDocumentType(document.id, event.target.value)} style={{ width: '100%', height: '34px', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '0 8px', color: '#334155', background: '#FFFFFF', fontSize: '12px' }}>
                                                                {documentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                                                            </select>
                                                            <span style={{ color: '#475569', fontSize: '13px' }}>{formatDate(document.submitted_at)}</span>
                                                            <span style={{ width: 'fit-content', borderRadius: '999px', padding: '5px 10px', fontSize: '12px', fontWeight: '800', color: document.escalated_to_manager ? '#B91C1C' : documentMeta.color, background: document.escalated_to_manager ? '#FEE2E2' : documentMeta.background }}>{document.escalated_to_manager ? 'Escalated' : documentMeta.label}</span>
                                                            <div style={stickyFileActionStyle}>
                                                                <button onClick={() => setSelectedDocument(document)} style={{ ...softBlueButtonStyle, width: 'fit-content', padding: '7px 10px' }}>Review</button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                            </React.Fragment>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {selectedDocument && (
                <InternalDocumentModal
                    document={selectedDocument}
                    profile={profile}
                    mode="verifier"
                    onClose={() => setSelectedDocument(null)}
                    onChanged={loadDocuments}
                />
            )}
        </div>
    );
}
