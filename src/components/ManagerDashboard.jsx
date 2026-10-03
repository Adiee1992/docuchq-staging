import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import InternalDocumentModal from './InternalDocumentModal';
import CustomerDetailModal from './CustomerDetailModal';
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

const dateFilterTabs = ['All Dates', 'Today', 'This Week', 'This Month', 'This Year'];

function formatDate(value) {
    if (!value) return '-';
    return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).format(new Date(value));
}

function formatDateTime(value) {
    if (!value) return '-';
    return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
        timeZoneName: 'short'
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
    if (documents.length > 0 && documents.every((document) => document.status === 'approved')) return 'approved';
    if (documents.some((document) => document.escalated_to_manager)) return 'clearance_issue';
    if (documents.some((document) => document.status === 'clearance_issue')) return 'clearance_issue';
    if (documents.some((document) => document.status === 'needs_info')) return 'needs_info';
    if (documents.some((document) => document.status === 'pending_review')) return 'pending_review';
    return documents[0]?.status || 'pending_review';
}

function matchesDateFilter(value, filter) {
    if (filter === 'All Dates') return true;
    if (!value) return false;

    const date = new Date(value);
    const now = new Date();
    if (Number.isNaN(date.getTime())) return false;

    if (filter === 'Today') return date.toDateString() === now.toDateString();

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

    if (filter === 'This Year') return date.getFullYear() === now.getFullYear();
    return true;
}

function MetricIcon({ color, type }) {
    const paths = {
        pending: <><circle cx="12" cy="12" r="7" /><path d="M12 8v4l3 2" /></>,
        info: <><circle cx="12" cy="12" r="7" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
        approved: <><circle cx="12" cy="12" r="7" /><path d="m9.5 12.5 1.7 1.7 3.4-4" /></>,
        issue: <><circle cx="12" cy="12" r="7" /><path d="M12 8v5" /><path d="M12 16h.01" /></>,
        escalated: <><circle cx="12" cy="12" r="7" /><path d="M8 12h8" /><path d="m13 9 3 3-3 3" /></>,
        unassigned: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M17 9v6" /><path d="M14 12h6" /></>,
        total: <><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" /><path d="M14 2v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></>
    };

    return (
        <div style={{ width: '42px', height: '42px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}18`, flex: '0 0 42px' }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                {paths[type] || paths.total}
            </svg>
        </div>
    );
}

const trackTableColumns = '44px minmax(150px, 1.3fr) minmax(120px, 1fr) minmax(110px, 0.9fr) minmax(145px, 0.95fr) minmax(190px, 1.1fr) minmax(95px, 0.8fr) minmax(120px, 0.9fr) minmax(105px, 0.8fr) minmax(145px, 0.95fr) 120px 140px 260px';
const trackTableMinWidth = 1860;
const trackScrollableWidth = 1458;
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
    right: '272px',
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
const softBlueButtonStyle = {
    border: '1px solid rgba(73, 168, 216, 0.32)',
    background: 'rgba(73, 168, 216, 0.1)',
    color: '#2789B8',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '800',
    fontSize: '12px'
};

function DataTabIcon({ type }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {type === 'usage' ? (
                <>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8.5 7.5h7M8.5 10.5h7" />
                    <path d="M8.5 7.5h2.7a3 3 0 0 1 0 6H8.5l5 4.5" />
                </>
            ) : type === 'issue' ? (
                <>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v6" />
                    <path d="M12 17h.01" />
                </>
            ) : type === 'lead' ? (
                <>
                    <path d="M4 5h16v12H7l-3 3z" />
                    <path d="M8 9h8" />
                    <path d="M8 13h5" />
                </>
            ) : type === 'verifier' ? (
                <>
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
                    <path d="m16 12 2 2 3-4" />
                </>
            ) : (
                <>
                    <circle cx="8" cy="8" r="3" />
                    <circle cx="17" cy="9" r="2.5" />
                    <path d="M2.5 19a5.5 5.5 0 0 1 11 0" />
                    <path d="M14 19a4 4 0 0 1 7.5-2" />
                </>
            )}
        </svg>
    );
}

export default function ManagerDashboard({ profile, onLogout }) {
    const { showToast } = useToast();
    const tableScrollRef = useRef(null);
    const topTableScrollRef = useRef(null);
    const [documents, setDocuments] = useState([]);
    const [clearanceTracks, setClearanceTracks] = useState([]);
    const [profiles, setProfiles] = useState([]);
    const [leads, setLeads] = useState([]);
    const [customerIssues, setCustomerIssues] = useState([]);
    const [freeCreditGrants, setFreeCreditGrants] = useState([]);
    const [planActivations, setPlanActivations] = useState([]);
    const [customerInvoices, setCustomerInvoices] = useState([]);
    const [clearanceUsage, setClearanceUsage] = useState([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('All');
    const [activeDateFilter, setActiveDateFilter] = useState('All Dates');
    const [searchTerm, setSearchTerm] = useState('');
    const [collapsedTracks, setCollapsedTracks] = useState({});
    const [selectedDocument, setSelectedDocument] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [reassignTrack, setReassignTrack] = useState(null);
    const [reassignVerifierId, setReassignVerifierId] = useState('');
    const [reassigning, setReassigning] = useState(false);
    const [dataView, setDataView] = useState(null);
    const [creditCustomer, setCreditCustomer] = useState(null);
    const [freeCreditAmount, setFreeCreditAmount] = useState(1);
    const [addingFreeCredits, setAddingFreeCredits] = useState(false);
    const [activationCustomer, setActivationCustomer] = useState(null);
    const [activatingPlan, setActivatingPlan] = useState(false);
    const [activationForm, setActivationForm] = useState({ planType: 'standard', amount: '4999', paymentMethod: 'Bank Transfer', paymentReference: '', paymentDate: new Date().toISOString().slice(0, 10), notes: '' });
    const [queryDiagnostics, setQueryDiagnostics] = useState({ count: 0, error: '', checkedAt: '' });

    const verifiers = useMemo(() => profiles.filter((item) => item.role === 'verifier'), [profiles]);
    const customers = useMemo(() => profiles.filter((item) => item.role === 'exporter'), [profiles]);
    const profileById = useMemo(() => {
        const map = new Map();
        profiles.forEach((item) => map.set(item.id, item));
        return map;
    }, [profiles]);

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

    const loadData = async () => {
        setLoading(true);
        const [
            { data: documentData, error: documentsError },
            { data: trackData, error: tracksError },
            { data: profileData, error: profilesError },
            { data: leadData, error: leadsError },
            { data: issueData, error: issuesError },
            { data: grantData, error: grantsError },
            { data: activationData, error: activationsError },
            { data: invoiceData, error: invoicesError },
            { data: usageData, error: usageError }
        ] = await Promise.all([
            supabase.from('documents').select('*').order('submitted_at', { ascending: false }),
            supabase.from('clearance_tracks').select('id, profile_id, reference_id, customer_name, destination_country, invoice_currency, ad_bank_name, payment_method, created_at, updated_at').order('created_at', { ascending: false }),
            supabase.from('profiles').select('id, email, first_name, last_name, company_name, mobile_number, iec_code, address, gstin, pan, account_status, role, available_clearances, created_at, updated_at, deletion_requested_at, deletion_scheduled_for').order('created_at', { ascending: false }),
            supabase.from('sales_leads').select('id, full_name, company_name, email, mobile_number, comments, status, created_at, viewed_at').order('created_at', { ascending: false }),
            supabase.from('customer_issues').select('id, profile_id, full_name, company_name, email, mobile_number, comments, status, created_at, viewed_at').order('created_at', { ascending: false }),
            supabase.from('free_credit_grants').select('id, profile_id, credits, created_at').order('created_at', { ascending: false }),
            supabase.from('customer_plan_activations').select('*').order('created_at', { ascending: false }),
            supabase.from('customer_invoices').select('*').order('created_at', { ascending: false }),
            supabase.from('clearance_transactions').select('*').order('created_at', { ascending: false }).limit(1000)
        ]);
        setLoading(false);

        const error = documentsError || tracksError || profilesError || leadsError || issuesError || grantsError || activationsError || invoicesError || usageError;
        setQueryDiagnostics({
            count: trackData?.length || 0,
            documentCount: documentData?.length || 0,
            error: error?.message || '',
            checkedAt: new Date().toLocaleTimeString()
        });

        if (documentsError) showToast(documentsError.message, 'error');
        else setDocuments(documentData || []);

        if (tracksError) showToast(tracksError.message, 'error');
        else setClearanceTracks(trackData || []);

        if (profilesError) showToast(profilesError.message, 'error');
        else setProfiles(profileData || []);

        if (leadsError) showToast(leadsError.message, 'error');
        else setLeads(leadData || []);

        if (issuesError) showToast(issuesError.message, 'error');
        else setCustomerIssues(issueData || []);

        if (grantsError) showToast(grantsError.message, 'error');
        else setFreeCreditGrants(grantData || []);

        if (activationsError) showToast(activationsError.message, 'error');
        else setPlanActivations(activationData || []);

        if (invoicesError) showToast(invoicesError.message, 'error');
        else setCustomerInvoices(invoiceData || []);

        if (usageError) showToast(usageError.message, 'error');
        else setClearanceUsage(usageData || []);
    };

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const channel = supabase
            .channel('manager-incoming-items')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'sales_leads' },
                (payload) => setLeads((current) => [payload.new, ...current.filter((lead) => lead.id !== payload.new.id)])
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'customer_issues' },
                (payload) => setCustomerIssues((current) => [payload.new, ...current.filter((issue) => issue.id !== payload.new.id)])
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const tracks = useMemo(() => {
        const map = new Map();

        clearanceTracks.forEach((track) => {
            const referenceId = track.reference_id || 'UNREFERENCED';
            const trackKey = `${track.profile_id || 'unknown'}:${referenceId}`;

            map.set(trackKey, {
                trackKey,
                id: track.id,
                referenceId,
                profileId: track.profile_id,
                documents: [],
                submittedAt: track.created_at,
                updatedAt: track.updated_at,
                paymentMethod: track.payment_method || '-',
                adBankName: track.ad_bank_name || '-',
                customerName: track.customer_name || '-',
                destinationCountry: track.destination_country || '-',
                invoiceCurrency: track.invoice_currency || '-'
            });
        });

        documents.forEach((document) => {
            const referenceId = document.reference_id || 'UNREFERENCED';
            const trackKey = `${document.profile_id || 'unknown'}:${referenceId}`;

            if (!map.has(trackKey)) {
                map.set(trackKey, {
                    trackKey,
                    referenceId,
                    profileId: document.profile_id,
                    documents: [],
                    submittedAt: document.submitted_at,
                    paymentMethod: document.payment_method || '-',
                    adBankName: document.ad_bank_name || '-',
                    customerName: document.customer_name || '-',
                    destinationCountry: document.destination_country || '-',
                    invoiceCurrency: document.invoice_currency || '-'
                });
            }

            const track = map.get(trackKey);
            track.documents.push(document);
            if (new Date(document.submitted_at) < new Date(track.submittedAt)) track.submittedAt = document.submitted_at;
            track.paymentMethod = track.paymentMethod === '-' ? (document.payment_method || '-') : track.paymentMethod;
            track.adBankName = track.adBankName === '-' ? (document.ad_bank_name || '-') : track.adBankName;
            track.customerName = track.customerName === '-' ? (document.customer_name || '-') : track.customerName;
            track.destinationCountry = track.destinationCountry === '-' ? (document.destination_country || '-') : track.destinationCountry;
            track.invoiceCurrency = track.invoiceCurrency === '-' ? (document.invoice_currency || '-') : track.invoiceCurrency;
        });

        return Array.from(map.values()).map((track) => {
            const assignedVerifierIds = [...new Set(track.documents.map((document) => document.assigned_verifier_id).filter(Boolean))];

            return {
                ...track,
                status: getTrackStatus(track.documents),
                escalated: track.documents.some((document) => document.escalated_to_manager && document.status !== 'approved'),
                unassigned: track.documents.length === 0 || track.documents.some((document) => !document.assigned_verifier_id),
                assignedVerifierId: assignedVerifierIds.length === 1 ? assignedVerifierIds[0] : null,
                hasMultipleVerifiers: assignedVerifierIds.length > 1
            };
        });
    }, [clearanceTracks, documents]);

    const dateFilteredTracks = useMemo(() => (
        tracks.filter((track) => matchesDateFilter(track.submittedAt, activeDateFilter))
    ), [activeDateFilter, tracks]);

    const filteredTracks = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();

        return dateFilteredTracks.filter((track) => {
            const exporter = profileById.get(track.profileId);
            const assignedVerifier = profileById.get(track.assignedVerifierId);
            const riskLabel = getCountryRiskProfile(track.destinationCountry).label.toLowerCase();
            const tradeReviewLabel = getTradeReviewProfile(track.destinationCountry).label.toLowerCase();
            const matchesTab = activeTab === 'All'
                || (activeTab === 'Unassigned' && track.unassigned)
                || (activeTab === 'Pending Review' && track.status === 'pending_review')
                || (activeTab === 'Needs Info' && track.status === 'needs_info')
                || (activeTab === 'Compliant' && track.status === 'approved')
                || (activeTab === 'Clearance Issue' && track.status === 'clearance_issue')
                || (activeTab === 'Escalated' && track.escalated);
            const matchesSearch = !query
                || track.referenceId.toLowerCase().includes(query)
                || track.customerName.toLowerCase().includes(query)
                || track.destinationCountry.toLowerCase().includes(query)
                || track.paymentMethod.toLowerCase().includes(query)
                || track.adBankName.toLowerCase().includes(query)
                || riskLabel.includes(query)
                || tradeReviewLabel.includes(query)
                || exporter?.company_name?.toLowerCase().includes(query)
                || exporter?.email?.toLowerCase().includes(query)
                || assignedVerifier?.first_name?.toLowerCase().includes(query)
                || assignedVerifier?.last_name?.toLowerCase().includes(query)
                || track.documents.some((document) => {
                    const verifier = profileById.get(document.assigned_verifier_id);
                    return document.title?.toLowerCase().includes(query)
                        || document.file_name?.toLowerCase().includes(query)
                        || verifier?.email?.toLowerCase().includes(query);
                });

            return matchesTab && matchesSearch;
        });
    }, [activeTab, dateFilteredTracks, profileById, searchTerm]);

    const metrics = [
        { label: 'All Tracks', value: dateFilteredTracks.length, color: '#0F172A', icon: 'total' },
        { label: 'Unassigned', value: dateFilteredTracks.filter((track) => track.unassigned).length, color: '#49A8D8', icon: 'unassigned' },
        { label: 'Pending Review', value: dateFilteredTracks.filter((track) => track.status === 'pending_review').length, color: '#49A8D8', icon: 'pending' },
        { label: 'Needs Info', value: dateFilteredTracks.filter((track) => track.status === 'needs_info').length, color: '#A16207', icon: 'info' },
        { label: 'Clearance Issue', value: dateFilteredTracks.filter((track) => track.status === 'clearance_issue').length, color: '#B91C1C', icon: 'issue' },
        { label: 'Escalated', value: dateFilteredTracks.filter((track) => track.escalated).length, color: '#B91C1C', icon: 'escalated' },
        { label: 'Compliant', value: dateFilteredTracks.filter((track) => track.status === 'approved').length, color: '#15803D', icon: 'approved' }
    ];

    const verifierData = useMemo(() => (
        verifiers.map((verifier) => {
            const assignedDocuments = documents.filter((document) => document.assigned_verifier_id === verifier.id);
            const assignedTrackKeys = new Set(assignedDocuments.map((document) => `${document.profile_id}:${document.reference_id || 'UNREFERENCED'}`));
            const activeTrackKeys = new Set(
                assignedDocuments
                    .filter((document) => !['approved', 'clearance_issue', 'rejected', 'cancelled'].includes(document.status))
                    .map((document) => `${document.profile_id}:${document.reference_id || 'UNREFERENCED'}`)
            );

            return {
                ...verifier,
                assignedTracks: assignedTrackKeys.size,
                activeTracks: activeTrackKeys.size,
                pendingDocuments: assignedDocuments.filter((document) => document.status === 'pending_review').length,
                escalatedDocuments: assignedDocuments.filter((document) => document.escalated_to_manager).length
            };
        })
    ), [documents, verifiers]);

    const customerData = useMemo(() => (
        customers.map((customer) => {
            const customerTracks = tracks.filter((track) => track.profileId === customer.id);
            const customerDocuments = documents.filter((document) => document.profile_id === customer.id);
            const activityDates = [
                customer.updated_at,
                ...customerTracks.flatMap((track) => [track.updatedAt, track.submittedAt]),
                ...customerDocuments.flatMap((document) => [document.updated_at, document.reviewed_at, document.submitted_at])
            ].filter(Boolean).map((value) => new Date(value)).filter((value) => !Number.isNaN(value.getTime()));

            const latestPlan = planActivations.find((activation) => activation.profile_id === customer.id) || null;
            const latestPlanExpired = Boolean(latestPlan?.expires_at && new Date(latestPlan.expires_at) <= new Date());

            return {
                ...customer,
                available_clearances: latestPlanExpired ? 0 : customer.available_clearances,
                currentPlan: latestPlanExpired ? { ...latestPlan, status: 'expired' } : latestPlan,
                trackCount: customerTracks.length,
                documentCount: customerDocuments.length,
                pendingTracks: customerTracks.filter((track) => track.status === 'pending_review').length,
                lastActiveAt: activityDates.length ? new Date(Math.max(...activityDates.map((value) => value.getTime()))).toISOString() : customer.created_at,
                monthlyFreeCredits: freeCreditGrants
                    .filter((grant) => grant.profile_id === customer.id && new Date(grant.created_at) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1))
                    .reduce((total, grant) => total + grant.credits, 0)
            };
        })
    ), [customers, documents, freeCreditGrants, planActivations, tracks]);

    const openAddCredits = (customer) => {
        const remaining = Math.max(0, 5 - customer.monthlyFreeCredits);
        setCreditCustomer(customer);
        setFreeCreditAmount(Math.min(1, remaining));
    };

    const closeAddCredits = () => {
        if (addingFreeCredits) return;
        setCreditCustomer(null);
        setFreeCreditAmount(1);
    };

    const confirmAddCredits = async (event) => {
        event.preventDefault();
        if (!creditCustomer || freeCreditAmount < 1) return;

        setAddingFreeCredits(true);
        const { data, error } = await supabase.rpc('grant_manager_plan_credits', {
            customer_id_input: creditCustomer.id,
            credits_input: freeCreditAmount
        });
        setAddingFreeCredits(false);

        if (error) {
            showToast(error.message || 'Free credits could not be added.', 'error');
            return;
        }

        setProfiles((current) => current.map((item) => (
            item.id === creditCustomer.id
                ? { ...item, available_clearances: data?.available_clearances ?? item.available_clearances }
                : item
        )));
        setFreeCreditGrants((current) => [
            ...current,
            {
                id: `local-${Date.now()}`,
                profile_id: creditCustomer.id,
                credits: freeCreditAmount,
                created_at: new Date().toISOString()
            }
        ]);
        showToast(`${freeCreditAmount} free credit${freeCreditAmount === 1 ? '' : 's'} added as a freebie.`, 'success');
        setCreditCustomer(null);
        setFreeCreditAmount(1);
    };

    const openPlanActivation = (customer) => {
        setActivationCustomer(customer);
        setActivationForm({ planType: 'standard', amount: '4999', paymentMethod: 'Bank Transfer', paymentReference: '', paymentDate: new Date().toISOString().slice(0, 10), notes: '' });
    };

    const confirmPlanActivation = async (event) => {
        event.preventDefault();
        if (!activationCustomer) return;
        setActivatingPlan(true);
        const { error } = await supabase.rpc('activate_customer_plan', {
            customer_id_input: activationCustomer.id,
            plan_type_input: activationForm.planType,
            amount_input: Number(activationForm.amount),
            payment_method_input: activationForm.paymentMethod.trim(),
            payment_date_input: activationForm.paymentDate,
            payment_reference_input: activationForm.paymentReference.trim(),
            notes_input: activationForm.notes.trim() || null
        });
        setActivatingPlan(false);
        if (error) {
            showToast(error.message, 'error');
            return;
        }
        showToast(`${activationForm.planType === 'business' ? 'Business' : 'Standard'} plan activated for 30 days.`, 'success');
        setActivationCustomer(null);
        loadData();
    };

    const hasNewLeads = leads.some((lead) => lead.status === 'new');
    const hasNewCustomerIssues = customerIssues.some((issue) => issue.status === 'new');

    const openLeads = async () => {
        setDataView('leads');
        const newLeadIds = leads.filter((lead) => lead.status === 'new').map((lead) => lead.id);
        if (newLeadIds.length === 0) return;

        const viewedAt = new Date().toISOString();
        setLeads((current) => current.map((lead) => (
            newLeadIds.includes(lead.id) ? { ...lead, status: 'viewed', viewed_at: viewedAt } : lead
        )));

        const { error } = await supabase
            .from('sales_leads')
            .update({ status: 'viewed', viewed_at: viewedAt })
            .in('id', newLeadIds);

        if (error) {
            showToast(error.message, 'error');
            loadData();
        }
    };

    const openCustomerIssues = async () => {
        setDataView('issues');
        const newIssueIds = customerIssues.filter((issue) => issue.status === 'new').map((issue) => issue.id);
        if (newIssueIds.length === 0) return;

        const viewedAt = new Date().toISOString();
        setCustomerIssues((current) => current.map((issue) => (
            newIssueIds.includes(issue.id) ? { ...issue, status: 'viewed', viewed_at: viewedAt } : issue
        )));

        const { error } = await supabase
            .from('customer_issues')
            .update({ status: 'viewed', viewed_at: viewedAt })
            .in('id', newIssueIds);

        if (error) {
            showToast(error.message, 'error');
            loadData();
        }
    };

    const openDeleteModal = (type, item) => {
        setDeletePassword('');
        setDeleteTarget({ type, item });
    };

    const closeDeleteModal = () => {
        if (deleting) return;
        setDeleteTarget(null);
        setDeletePassword('');
    };

    const verifyManagerPassword = async () => {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user?.email) throw new Error('The signed-in manager email could not be verified.');

        const { error } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: deletePassword
        });

        if (error) throw new Error('Incorrect profile password.');
    };

    const confirmDelete = async (event) => {
        event.preventDefault();
        if (!deleteTarget || !deletePassword) return;

        setDeleting(true);

        try {
            await verifyManagerPassword();

            if (deleteTarget.type === 'document') {
                const document = deleteTarget.item;
                const { error } = await supabase.from('documents').delete().eq('id', document.id);
                if (error) throw error;

                if (document.storage_path) {
                    await supabase.storage.from('documents').remove([document.storage_path]);
                }

                await supabase.from('audit_logs').insert({
                    actor_id: profile.id,
                    entity_type: 'document',
                    entity_id: document.id,
                    action: 'manager_document_deleted',
                    metadata: { title: document.title, reference_id: document.reference_id }
                });

                showToast('Document deleted by manager.', 'success');
            } else {
                const track = deleteTarget.item;
                const documentIds = track.documents.map((document) => document.id);
                const storagePaths = track.documents.map((document) => document.storage_path).filter(Boolean);

                if (documentIds.length > 0) {
                    const { error: documentError } = await supabase.from('documents').delete().in('id', documentIds);
                    if (documentError) throw documentError;
                }

                if (storagePaths.length > 0) {
                    await supabase.storage.from('documents').remove(storagePaths);
                }

                if (track.id) {
                    const { error: trackError } = await supabase.from('clearance_tracks').delete().eq('id', track.id);
                    if (trackError) throw trackError;
                }

                await supabase.from('audit_logs').insert({
                    actor_id: profile.id,
                    entity_type: 'clearance_track',
                    entity_id: track.id || null,
                    action: 'manager_track_deleted',
                    metadata: {
                        profile_id: track.profileId,
                        reference_id: track.referenceId,
                        deleted_documents: documentIds.length
                    }
                });

                showToast('Track and its files were deleted.', 'success');
            }

            setDeleteTarget(null);
            setDeletePassword('');
            await loadData();
        } catch (error) {
            showToast(error.message || 'Delete could not be completed.', 'error');
        } finally {
            setDeleting(false);
        }
    };

    const openReassignModal = (track) => {
        if (track.documents.length === 0) {
            showToast('Add at least one file before assigning this track to a verifier.', 'error');
            return;
        }

        setReassignTrack(track);
        setReassignVerifierId(track.assignedVerifierId || '');
    };

    const confirmReassignment = async (event) => {
        event.preventDefault();
        if (!reassignTrack || !reassignVerifierId) return;

        setReassigning(true);

        try {
            const changedDocuments = reassignTrack.documents.filter((document) => document.assigned_verifier_id !== reassignVerifierId);
            const documentIds = reassignTrack.documents.map((document) => document.id);
            const now = new Date().toISOString();

            const { error } = await supabase
                .from('documents')
                .update({
                    assigned_verifier_id: reassignVerifierId,
                    assigned_manager_id: profile.id,
                    assigned_at: now,
                    escalated_to_manager: false,
                    updated_at: now
                })
                .in('id', documentIds);

            if (error) throw error;

            if (changedDocuments.length > 0) {
                await supabase.from('document_assignments').insert(
                    changedDocuments.map((document) => ({
                        document_id: document.id,
                        assigned_from: document.assigned_verifier_id || null,
                        assigned_to: reassignVerifierId,
                        assigned_by: profile.id,
                        assignment_type: 'manual',
                        reason: 'Track reassigned by manager'
                    }))
                );
            }

            showToast('Track reassigned successfully.', 'success');
            setReassignTrack(null);
            setReassignVerifierId('');
            await loadData();
        } catch (error) {
            showToast(error.message || 'Track reassignment failed.', 'error');
        } finally {
            setReassigning(false);
        }
    };

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
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '28px', padding: '0 14px', borderRadius: '999px', background: 'rgba(73, 168, 216, 0.14)', color: '#49A8D8', fontSize: '13px', lineHeight: 1, fontWeight: '700', boxSizing: 'border-box' }}>Manager</span>
                    <button onClick={onLogout} style={{ border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#334155', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontWeight: '700', whiteSpace: 'nowrap', minWidth: '76px' }}>Log Out</button>
                </div>
            </header>

            <main className="dashboard-content" style={{ paddingBottom: '40px' }}>
                <div className="content-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '32px 40px 8px 40px' }}>
                    <div>
                        <h1 style={{ fontSize: '28px', color: '#0F172A', margin: '0 0 6px 0', fontWeight: '700' }}>Manager Workspace</h1>
                        <p style={{ margin: 0, color: '#64748B', fontSize: '15px' }}>Manage clearance tracks, assignments, verifier activity, and escalations.</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                        <button type="button" onClick={() => setDataView('usage')} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '38px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 13px', background: '#FFFFFF', color: '#334155', cursor: 'pointer', fontSize: '13px', fontWeight: '800', whiteSpace: 'nowrap' }}>
                            <DataTabIcon type="usage" />
                            Clearance Logs
                        </button>
                        <button type="button" onClick={openCustomerIssues} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '38px', border: hasNewCustomerIssues ? '1px solid #DC2626' : '1px solid #CBD5E1', borderRadius: '8px', padding: '0 13px', background: hasNewCustomerIssues ? '#FEE2E2' : '#FFFFFF', color: hasNewCustomerIssues ? '#991B1B' : '#334155', cursor: 'pointer', fontSize: '13px', fontWeight: '800', whiteSpace: 'nowrap' }}>
                            <DataTabIcon type="issue" />
                            Issues
                            {hasNewCustomerIssues && <span aria-label="New issues" title="New issues" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#DC2626' }} />}
                        </button>
                        <button type="button" onClick={openLeads} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '38px', border: hasNewLeads ? '1px solid #F59E0B' : '1px solid #CBD5E1', borderRadius: '8px', padding: '0 13px', background: hasNewLeads ? '#FEF3C7' : '#FFFFFF', color: hasNewLeads ? '#92400E' : '#334155', cursor: 'pointer', fontSize: '13px', fontWeight: '800', whiteSpace: 'nowrap' }}>
                            <DataTabIcon type="lead" />
                            Leads
                            {hasNewLeads && <span aria-label="New leads" title="New leads" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#F59E0B' }} />}
                        </button>
                        <button type="button" onClick={() => setDataView('verifiers')} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '38px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 13px', background: '#FFFFFF', color: '#334155', cursor: 'pointer', fontSize: '13px', fontWeight: '800', whiteSpace: 'nowrap' }}>
                            <DataTabIcon type="verifier" />
                            Verifier Data
                        </button>
                        <button type="button" onClick={() => setDataView('customers')} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '38px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 13px', background: '#FFFFFF', color: '#334155', cursor: 'pointer', fontSize: '13px', fontWeight: '800', whiteSpace: 'nowrap' }}>
                            <DataTabIcon type="customer" />
                            Customer Data
                        </button>
                    </div>
                </div>

                <div className="manager-metrics-grid">
                    {metrics.map((metric) => (
                        <div key={metric.label} className="manager-metric-card">
                            <MetricIcon color={metric.color} type={metric.icon} />
                            <div className="manager-metric-copy">
                                <p style={{ margin: 0, color: metric.color, fontSize: '24px', lineHeight: 1.05, fontWeight: '800' }}>{metric.value}</p>
                                <p className="manager-metric-label" style={{ color: metric.color }}>{metric.label}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="document-submissions-table" style={{ padding: '20px 40px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
                        <div style={{ color: '#475569', fontSize: '12px', lineHeight: 1.5 }}>
                            <strong style={{ color: '#0F172A' }}>Manager ID:</strong> {profile?.id || '-'}<br />
                            <strong style={{ color: '#0F172A' }}>Tracks returned:</strong> {queryDiagnostics.count}
                            {' · '}
                            <strong style={{ color: '#0F172A' }}>Documents returned:</strong> {queryDiagnostics.documentCount || 0}
                            {queryDiagnostics.checkedAt ? ` at ${queryDiagnostics.checkedAt}` : ''}
                            {queryDiagnostics.error && <span style={{ color: '#B91C1C' }}> · {queryDiagnostics.error}</span>}
                        </div>
                        <button onClick={loadData} style={{ ...softBlueButtonStyle, padding: '8px 12px' }}>Refresh Tracks</button>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid #EEF2F7', paddingBottom: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                        {dateFilterTabs.map((tab) => (
                            <button key={tab} onClick={() => setActiveDateFilter(tab)} style={{ border: 'none', borderRadius: '7px', padding: '6px 12px', cursor: 'pointer', fontWeight: '700', fontSize: '12px', background: activeDateFilter === tab ? '#49A8D8' : 'transparent', color: activeDateFilter === tab ? '#FFFFFF' : '#64748B' }}>{tab}</button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', gap: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {['All', 'Unassigned', 'Pending Review', 'Needs Info', 'Compliant', 'Clearance Issue', 'Escalated'].map((tab) => (
                                <button key={tab} onClick={() => setActiveTab(tab)} style={{ border: 'none', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontWeight: '700', background: activeTab === tab ? '#49A8D8' : 'transparent', color: activeTab === tab ? '#FFFFFF' : '#64748B' }}>{tab}</button>
                            ))}
                        </div>
                        <input type="text" placeholder="Search reference, exporter, verifier..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '14px', width: '280px', height: '36px', boxSizing: 'border-box', outline: 'none', color: '#0F172A' }} />
                    </div>

                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                        <div ref={topTableScrollRef} onScroll={syncTopTableScroll} style={{ overflowX: 'auto', overflowY: 'hidden', marginRight: '412px', height: '13px', borderBottom: '1px solid #E2E8F0', background: '#FFFFFF' }}>
                            <div style={{ width: `${trackScrollableWidth}px`, height: '1px' }} />
                        </div>
                        <div ref={tableScrollRef} className="hide-horizontal-scrollbar" onScroll={syncMainTableScroll} style={{ overflowX: 'auto', overflowY: 'hidden' }}>
                            <div style={{ minWidth: `${trackTableMinWidth}px` }}>
                                <div style={{ display: 'grid', gridTemplateColumns: trackTableColumns, gap: '12px', padding: '14px 20px', background: '#F8FAFC', color: '#475569', fontSize: '13px', fontWeight: '800' }}>
                                    {['', 'Reference Track', 'Customer', 'Country', 'Risk', 'Trade Review', 'Currency', 'Payment Method', 'AD Bank', 'Assigned To', 'Submitted', 'Status', 'Action'].map((heading, index) => (
                                        <span key={heading} style={{ display: 'flex', alignItems: 'center', whiteSpace: heading === 'Payment Method' ? 'normal' : 'nowrap', ...(index === 11 ? stickyHeaderStatusStyle : {}), ...(index === 12 ? stickyHeaderActionStyle : {}) }}>{heading}</span>
                                    ))}
                                </div>

                                {loading ? (
                                    <div style={{ padding: '80px 20px', textAlign: 'center', color: '#64748B' }}>Loading manager tracks...</div>
                                ) : filteredTracks.length === 0 ? (
                                    <div style={{ padding: '80px 20px', textAlign: 'center', color: '#94A3B8' }}>No tracks found for this view.</div>
                                ) : filteredTracks.map((track) => {
                                    const meta = statusMeta[track.status] || statusMeta.pending_review;
                                    const collapsed = collapsedTracks[track.trackKey] !== false;
                                    const assignedVerifier = profileById.get(track.assignedVerifierId);
                                    const assignedTo = track.hasMultipleVerifiers
                                        ? 'Multiple Verifiers'
                                        : assignedVerifier
                                            ? `${assignedVerifier.first_name || ''} ${assignedVerifier.last_name || ''}`.trim() || assignedVerifier.email
                                            : 'Unassigned';

                                    return (
                                        <React.Fragment key={track.trackKey}>
                                            <div style={{ display: 'grid', gridTemplateColumns: trackTableColumns, gap: '12px', padding: '14px 20px', borderTop: '1px solid #E2E8F0', alignItems: 'center' }}>
                                                <button onClick={() => setCollapsedTracks((current) => ({ ...current, [track.trackKey]: !collapsed }))} style={{ border: 'none', background: '#F1F5F9', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', color: '#334155', fontWeight: '800' }}>{collapsed ? '+' : '-'}</button>
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
                                                <span style={{ color: assignedVerifier ? '#475569' : '#A16207', fontSize: '13px', fontWeight: '700' }}>{assignedTo}</span>
                                                <span style={{ color: '#475569', fontSize: '13px' }}>{formatDate(track.submittedAt)}</span>
                                                <div style={stickyStatusStyle}>
                                                    <span style={{ width: 'fit-content', borderRadius: '999px', padding: '5px 10px', fontSize: '12px', fontWeight: '800', color: track.escalated ? '#B91C1C' : meta.color, background: track.escalated ? '#FEE2E2' : meta.background, whiteSpace: 'nowrap' }}>{track.escalated ? 'Escalated' : meta.label}</span>
                                                </div>
                                                <div style={{ ...stickyActionStyle, gap: '7px' }}>
                                                    <button onClick={() => setCollapsedTracks((current) => ({ ...current, [track.trackKey]: false }))} style={{ ...softBlueButtonStyle, width: 'fit-content', padding: '7px 10px' }}>View Files</button>
                                                    <button onClick={() => openReassignModal(track)} style={{ ...softBlueButtonStyle, width: 'fit-content', padding: '7px 10px' }}>Reassign</button>
                                                    <button onClick={() => openDeleteModal('track', track)} style={{ border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', borderRadius: '6px', padding: '7px 10px', cursor: 'pointer', fontWeight: '800', fontSize: '12px' }}>Delete</button>
                                                </div>
                                            </div>

                                            {!collapsed && (
                                                <div style={{ background: '#FBFEFD', borderTop: '1px solid #E2E8F0', padding: '8px 20px 14px 64px' }}>
                                                    {track.documents.length === 0 ? (
                                                        <div style={{ padding: '14px 0', color: '#94A3B8', fontSize: '13px', fontWeight: '700' }}>No files added yet.</div>
                                                    ) : track.documents.map((document) => {
                                                        const documentMeta = statusMeta[document.status] || statusMeta.pending_review;
                                                        const exporter = profileById.get(document.profile_id);
                                                        const verifier = profileById.get(document.assigned_verifier_id);

                                                        return (
                                                            <div key={document.id} style={{ display: 'grid', gridTemplateColumns: '1.25fr 1.15fr .9fr .9fr 1.2fr .75fr', alignItems: 'center', gap: '12px', padding: '10px 0', borderTop: '1px solid #E2E8F0' }}>
                                                                <div>
                                                                    <p style={{ margin: 0, color: '#0F172A', fontWeight: '800', fontSize: '13px', overflowWrap: 'anywhere' }}>{document.file_name}</p>
                                                                    <p style={{ margin: '4px 0 0 0', color: '#94A3B8', fontSize: '12px' }}>{formatBytes(document.file_size)}</p>
                                                                </div>
                                                                <select aria-label={`Document type for ${document.file_name}`} value={document.document_type || 'Other'} onChange={(event) => updateDocumentType(document.id, event.target.value)} style={{ width: '100%', height: '34px', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '0 8px', color: '#334155', background: '#FFFFFF', fontSize: '12px' }}>
                                                                    {documentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                                                                </select>
                                                                <span style={{ color: '#475569', fontSize: '12px' }}>{exporter?.company_name || exporter?.email || '-'}</span>
                                                                <span style={{ color: '#475569', fontSize: '12px' }}>{verifier ? `${verifier.first_name || 'Verifier'} ${verifier.last_name || ''}` : 'Unassigned'}</span>
                                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-start' }}>
                                                                    <button onClick={() => setSelectedDocument(document)} style={{ ...softBlueButtonStyle, padding: '7px 10px' }}>Review</button>
                                                                    <button onClick={() => openDeleteModal('document', document)} style={{ border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', borderRadius: '6px', padding: '7px 10px', cursor: 'pointer', fontWeight: '800', fontSize: '12px' }}>Delete</button>
                                                                </div>
                                                                <span style={{ width: 'fit-content', borderRadius: '999px', padding: '5px 10px', fontSize: '12px', fontWeight: '800', color: document.escalated_to_manager && document.status !== 'approved' ? '#B91C1C' : documentMeta.color, background: document.escalated_to_manager && document.status !== 'approved' ? '#FEE2E2' : documentMeta.background }}>{document.escalated_to_manager && document.status !== 'approved' ? 'Escalated' : documentMeta.label}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {dataView && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="manager-data-title"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setDataView(null);
                    }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.62)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
                >
                    <div style={{ width: 'min(960px, calc(100vw - 48px))', maxHeight: '88vh', background: '#FFFFFF', borderRadius: '8px', boxShadow: '0 24px 60px rgba(15,23,42,0.24)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 26px', borderBottom: '1px solid #E2E8F0' }}>
                            <div>
                                <h2 id="manager-data-title" style={{ margin: '0 0 5px 0', color: '#0F172A', fontSize: '21px' }}>{dataView === 'usage' ? 'Clearance Logs' : dataView === 'issues' ? 'Issues' : dataView === 'leads' ? 'Leads' : dataView === 'verifiers' ? 'Verifier Data' : 'Customer Data'}</h2>
                                <p style={{ margin: 0, color: '#64748B', fontSize: '13px' }}>
                                    {dataView === 'usage' ? `${clearanceUsage.length} clearance events` : dataView === 'issues' ? `${customerIssues.length} reported issues` : dataView === 'leads' ? `${leads.length} customer inquiries` : dataView === 'verifiers' ? `${verifierData.length} verifier accounts` : `${customerData.length} exporter accounts`}
                                </p>
                            </div>
                            <button type="button" aria-label="Close data view" onClick={() => setDataView(null)} style={{ width: '34px', height: '34px', border: '1px solid #E2E8F0', borderRadius: '6px', background: '#FFFFFF', color: '#475569', cursor: 'pointer', fontSize: '22px', lineHeight: 1 }}>&times;</button>
                        </div>

                        <div style={{ padding: '20px 24px 26px', overflow: 'auto' }}>
                            {dataView === 'usage' ? (
                                <div style={{ minWidth: '1050px', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1.2fr 1.35fr 1fr .75fr 1.5fr .55fr .65fr 1.15fr', gap: '12px', padding: '12px 15px', background: '#F8FAFC', color: '#475569', fontSize: '12px', fontWeight: '800' }}>
                                        <span>Customer</span><span>Company</span><span>Email</span><span>Reference</span><span>Plan</span><span>Description</span><span>Change</span><span>Balance</span><span>Date & Time</span>
                                    </div>
                                    {clearanceUsage.length === 0 ? <div style={{ padding: '36px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No clearance usage recorded.</div> : clearanceUsage.map((entry) => {
                                        const customer = profileById.get(entry.profile_id);
                                        return <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '1.15fr 1.2fr 1.35fr 1fr .75fr 1.5fr .55fr .65fr 1.15fr', gap: '12px', padding: '13px 15px', borderTop: '1px solid #E2E8F0', alignItems: 'center', color: '#475569', fontSize: '12px' }}><strong style={{ color: '#0F172A' }}>{entry.customer_name_snapshot || `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim() || 'Deleted customer'}</strong><span>{entry.company_name_snapshot || customer?.company_name || '-'}</span><span style={{ overflowWrap: 'anywhere' }}>{entry.email_snapshot || customer?.email || '-'}</span><strong>{entry.reference_id || '-'}</strong><span style={{ textTransform: 'capitalize' }}>{entry.plan_type || '-'}</span><span>{entry.reason || 'Clearance used'}</span><strong style={{ color: entry.amount < 0 ? '#B91C1C' : '#15803D' }}>{entry.amount > 0 ? '+' : ''}{entry.amount}</strong><strong>{entry.balance_after ?? '-'}</strong><span>{formatDateTime(entry.created_at)}</span></div>;
                                    })}
                                </div>
                            ) : dataView === 'issues' ? (
                                <div style={{ minWidth: '1000px', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1.15fr 1.3fr 1fr 2.2fr 1.15fr', gap: '12px', padding: '12px 15px', background: '#F8FAFC', color: '#475569', fontSize: '12px', fontWeight: '800' }}>
                                        <span>Customer</span>
                                        <span>Company</span>
                                        <span>Email</span>
                                        <span>Mobile Number</span>
                                        <span>Issue</span>
                                        <span>Date & Time</span>
                                    </div>
                                    {customerIssues.length === 0 ? (
                                        <div style={{ padding: '36px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No customer issues reported.</div>
                                    ) : customerIssues.map((issue) => (
                                        <div key={issue.id} style={{ display: 'grid', gridTemplateColumns: '1.05fr 1.15fr 1.3fr 1fr 2.2fr 1.15fr', gap: '12px', padding: '13px 15px', borderTop: '1px solid #E2E8F0', alignItems: 'start', color: '#475569', fontSize: '13px', background: issue.status === 'new' ? '#FEF2F2' : '#FFFFFF' }}>
                                            <strong style={{ color: '#0F172A' }}>{issue.full_name || '-'}</strong>
                                            <span>{issue.company_name || '-'}</span>
                                            <span style={{ overflowWrap: 'anywhere' }}>{issue.email || '-'}</span>
                                            <span>{issue.mobile_number || '-'}</span>
                                            <span style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{issue.comments || '-'}</span>
                                            <span style={{ lineHeight: 1.5 }}>{formatDateTime(issue.created_at)}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : dataView === 'leads' ? (
                                <div style={{ minWidth: '920px', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.15fr 1.35fr 1fr 2fr 0.85fr', gap: '12px', padding: '12px 15px', background: '#F8FAFC', color: '#475569', fontSize: '12px', fontWeight: '800' }}>
                                        <span>Customer</span>
                                        <span>Company</span>
                                        <span>Email</span>
                                        <span>Mobile Number</span>
                                        <span>Comments</span>
                                        <span>Date</span>
                                    </div>
                                    {leads.length === 0 ? (
                                        <div style={{ padding: '36px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No customer inquiries found.</div>
                                    ) : leads.map((lead) => (
                                        <div key={lead.id} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.15fr 1.35fr 1fr 2fr 0.85fr', gap: '12px', padding: '13px 15px', borderTop: '1px solid #E2E8F0', alignItems: 'start', color: '#475569', fontSize: '13px', background: lead.status === 'new' ? '#FFFBEB' : '#FFFFFF' }}>
                                            <strong style={{ color: '#0F172A' }}>{lead.full_name || '-'}</strong>
                                            <span>{lead.company_name || '-'}</span>
                                            <span style={{ overflowWrap: 'anywhere' }}>{lead.email || '-'}</span>
                                            <span>{lead.mobile_number || '-'}</span>
                                            <span style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{lead.comments || '-'}</span>
                                            <span>{formatDate(lead.created_at)}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : dataView === 'verifiers' ? (
                                <div style={{ minWidth: '760px', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1.6fr 0.75fr 0.75fr 0.8fr 0.8fr', gap: '12px', padding: '12px 15px', background: '#F8FAFC', color: '#475569', fontSize: '12px', fontWeight: '800' }}>
                                        <span>Verifier</span>
                                        <span>Email</span>
                                        <span>Assigned</span>
                                        <span>Active</span>
                                        <span>Pending Docs</span>
                                        <span>Escalated</span>
                                    </div>
                                    {verifierData.length === 0 ? (
                                        <div style={{ padding: '36px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No verifier accounts found.</div>
                                    ) : verifierData.map((verifier) => (
                                        <div key={verifier.id} style={{ display: 'grid', gridTemplateColumns: '1.25fr 1.6fr 0.75fr 0.75fr 0.8fr 0.8fr', gap: '12px', padding: '13px 15px', borderTop: '1px solid #E2E8F0', alignItems: 'center', color: '#475569', fontSize: '13px' }}>
                                            <strong style={{ color: '#0F172A' }}>{`${verifier.first_name || ''} ${verifier.last_name || ''}`.trim() || 'Verifier'}</strong>
                                            <span>{verifier.email || '-'}</span>
                                            <span>{verifier.assignedTracks}</span>
                                            <span>{verifier.activeTracks}</span>
                                            <span>{verifier.pendingDocuments}</span>
                                            <strong style={{ color: verifier.escalatedDocuments ? '#B91C1C' : '#475569' }}>{verifier.escalatedDocuments}</strong>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ minWidth: '1240px', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1.15fr 1.4fr 1fr 1fr 0.9fr 0.85fr 1fr', gap: '12px', padding: '12px 15px', background: '#F8FAFC', color: '#475569', fontSize: '12px', fontWeight: '800' }}>
                                        <span>User Name</span>
                                        <span>Company</span>
                                        <span>Email</span>
                                        <span>Phone Number</span>
                                        <span>Current Plan</span>
                                        <span>Activation Status</span>
                                        <span>Created</span>
                                        <span>Last Active</span>
                                    </div>
                                    {customerData.length === 0 ? (
                                        <div style={{ padding: '36px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No customer accounts found.</div>
                                    ) : customerData.map((customer) => (
                                        <button type="button" key={customer.id} onClick={() => setSelectedCustomerId(customer.id)} style={{ width: '100%', display: 'grid', gridTemplateColumns: '1.05fr 1.15fr 1.4fr 1fr 1fr 0.9fr 0.85fr 1fr', gap: '12px', padding: '13px 15px', border: 'none', borderTop: '1px solid #E2E8F0', alignItems: 'center', color: '#475569', fontSize: '13px', background: '#FFFFFF', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                                            <strong style={{ color: '#0F172A' }}>{`${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Exporter'}</strong>
                                            <span>{customer.company_name || '-'}</span>
                                            <span>{customer.email || '-'}</span>
                                            <span>{customer.mobile_number || '-'}</span>
                                            <strong style={{ color: customer.currentPlan?.status === 'active' ? '#15803D' : '#64748B', textTransform: 'capitalize' }}>{customer.currentPlan ? `${customer.currentPlan.plan_type} (${customer.currentPlan.status})` : 'View only'}</strong>
                                            {(() => {
                                                const status = customer.deletion_requested_at ? 'Deleted' : customer.account_status === 'inactive' ? 'Inactive' : 'Active';
                                                const tone = status === 'Deleted' ? { color: '#B91C1C', background: '#FEE2E2' } : status === 'Inactive' ? { color: '#92400E', background: '#FEF3C7' } : { color: '#15803D', background: '#DCFCE7' };
                                                return <strong title={customer.deletion_scheduled_for ? `Permanent deletion scheduled for ${formatDateTime(customer.deletion_scheduled_for)}` : undefined} style={{ width: 'fit-content', padding: '4px 8px', borderRadius: '999px', color: tone.color, background: tone.background, fontSize: '11px' }}>{status}</strong>;
                                            })()}
                                            <span>{customer.created_at ? formatDate(customer.created_at) : '-'}</span>
                                            <span>{customer.lastActiveAt ? formatDateTime(customer.lastActiveAt) : '-'}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {selectedCustomerId && (() => {
                const customer = customerData.find((item) => item.id === selectedCustomerId);
                return customer ? <CustomerDetailModal customer={customer} managerId={profile.id} activations={planActivations.filter((item) => item.profile_id === customer.id)} freebies={freeCreditGrants.filter((item) => item.profile_id === customer.id)} invoices={customerInvoices.filter((item) => item.profile_id === customer.id)} usage={clearanceUsage.filter((item) => item.profile_id === customer.id)} onClose={() => setSelectedCustomerId(null)} onRefresh={loadData} onActivatePlan={openPlanActivation} onAddFreebies={openAddCredits} /> : null;
            })()}

            {activationCustomer && (
                <div role="dialog" aria-modal="true" aria-labelledby="activate-plan-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !activatingPlan) setActivationCustomer(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.62)', zIndex: 780, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    <form onSubmit={confirmPlanActivation} style={{ width: 'min(560px, calc(100vw - 48px))', maxHeight: '92vh', overflowY: 'auto', background: '#FFFFFF', borderRadius: '8px', padding: '28px 30px', boxSizing: 'border-box', boxShadow: '0 24px 60px rgba(15,23,42,0.24)' }}>
                        <h2 id="activate-plan-title" style={{ margin: '0 0 6px', color: '#0F172A', fontSize: '21px' }}>Activate Customer Plan</h2>
                        <p style={{ margin: '0 0 20px', color: '#64748B', fontSize: '14px' }}>{`${activationCustomer.first_name || ''} ${activationCustomer.last_name || ''}`.trim() || activationCustomer.email}</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                            <label style={{ color: '#334155', fontSize: '13px', fontWeight: '800' }}>Plan<select value={activationForm.planType} onChange={(e) => setActivationForm((form) => ({ ...form, planType: e.target.value, amount: e.target.value === 'business' ? '9999' : '4999' }))} style={{ width: '100%', height: '42px', marginTop: '7px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 12px', background: '#FFFFFF' }}><option value="standard">Standard - 10 tracks</option><option value="business">Business - 25 tracks</option></select></label>
                            <label style={{ color: '#334155', fontSize: '13px', fontWeight: '800' }}>Amount (INR)<input required min="0" step="0.01" type="number" value={activationForm.amount} onChange={(e) => setActivationForm((form) => ({ ...form, amount: e.target.value }))} style={{ width: '100%', height: '42px', boxSizing: 'border-box', marginTop: '7px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 12px' }} /></label>
                            <label style={{ color: '#334155', fontSize: '13px', fontWeight: '800' }}>Payment Method<select required value={activationForm.paymentMethod} onChange={(e) => setActivationForm((form) => ({ ...form, paymentMethod: e.target.value }))} style={{ width: '100%', height: '42px', boxSizing: 'border-box', marginTop: '7px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 12px', background: '#FFFFFF' }}><option value="Bank Transfer">Bank Transfer</option><option value="UPI">UPI</option></select></label>
                            <label style={{ color: '#334155', fontSize: '13px', fontWeight: '800' }}>Payment Date<input required type="date" value={activationForm.paymentDate} onChange={(e) => setActivationForm((form) => ({ ...form, paymentDate: e.target.value }))} style={{ width: '100%', height: '42px', boxSizing: 'border-box', marginTop: '7px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 12px' }} /></label>
                        </div>
                        <label style={{ display: 'block', marginTop: '14px', color: '#334155', fontSize: '13px', fontWeight: '800' }}>Payment Reference<input required value={activationForm.paymentReference} onChange={(e) => setActivationForm((form) => ({ ...form, paymentReference: e.target.value }))} placeholder="UTR, bank reference, or receipt number" style={{ width: '100%', height: '42px', boxSizing: 'border-box', marginTop: '7px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 12px' }} /></label>
                        <label style={{ display: 'block', marginTop: '14px', color: '#334155', fontSize: '13px', fontWeight: '800' }}>Notes<textarea value={activationForm.notes} onChange={(e) => setActivationForm((form) => ({ ...form, notes: e.target.value }))} rows="3" style={{ width: '100%', boxSizing: 'border-box', marginTop: '7px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '10px 12px', resize: 'vertical' }} /></label>
                        <p style={{ margin: '14px 0 0', color: '#64748B', fontSize: '12px' }}>Activation replaces the current plan and remains valid for 30 days. The payment is recorded in transactions and audit logs.</p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}><button type="button" disabled={activatingPlan} onClick={() => setActivationCustomer(null)} style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', borderRadius: '8px', padding: '10px 16px', fontWeight: '800' }}>Cancel</button><button type="submit" disabled={activatingPlan} style={{ border: 'none', background: '#49A8D8', color: '#FFFFFF', borderRadius: '8px', padding: '10px 16px', fontWeight: '800', opacity: activatingPlan ? .65 : 1 }}>{activatingPlan ? 'Activating...' : 'Confirm Activation'}</button></div>
                    </form>
                </div>
            )}

            {creditCustomer && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="add-free-credits-title"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) closeAddCredits();
                    }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.62)', zIndex: 780, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
                >
                    <form onSubmit={confirmAddCredits} style={{ width: 'min(500px, calc(100vw - 48px))', background: '#FFFFFF', borderRadius: '8px', padding: '28px 30px', boxSizing: 'border-box', boxShadow: '0 24px 60px rgba(15,23,42,0.24)' }}>
                        <h2 id="add-free-credits-title" style={{ margin: '0 0 6px', color: '#0F172A', fontSize: '21px' }}>Add Free Credits</h2>
                        <p style={{ margin: '0 0 20px', color: '#64748B', fontSize: '14px', lineHeight: 1.55 }}>
                            Add free clearance credits for <strong style={{ color: '#334155' }}>{`${creditCustomer.first_name || ''} ${creditCustomer.last_name || ''}`.trim() || creditCustomer.email}</strong>.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', padding: '14px', marginBottom: '20px', border: '1px solid #E2E8F0', borderRadius: '8px', background: '#F8FAFC' }}>
                            <div>
                                <p style={{ margin: '0 0 4px', color: '#64748B', fontSize: '11px', fontWeight: '800' }}>CURRENT</p>
                                <strong style={{ color: '#0F172A', fontSize: '18px' }}>{creditCustomer.available_clearances ?? 0}</strong>
                            </div>
                            <div>
                                <p style={{ margin: '0 0 4px', color: '#64748B', fontSize: '11px', fontWeight: '800' }}>FREE THIS MONTH</p>
                                <strong style={{ color: '#0F172A', fontSize: '18px' }}>{creditCustomer.monthlyFreeCredits}</strong>
                            </div>
                            <div>
                                <p style={{ margin: '0 0 4px', color: '#64748B', fontSize: '11px', fontWeight: '800' }}>REMAINING</p>
                                <strong style={{ color: '#15803D', fontSize: '18px' }}>{Math.max(0, 5 - creditCustomer.monthlyFreeCredits)}</strong>
                            </div>
                        </div>

                        <label style={{ display: 'block', marginBottom: '7px', color: '#334155', fontSize: '13px', fontWeight: '800' }}>Credits to Add</label>
                        <select
                            required
                            value={freeCreditAmount}
                            onChange={(event) => setFreeCreditAmount(Number(event.target.value))}
                            style={{ width: '100%', height: '42px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 12px', color: '#0F172A', background: '#FFFFFF', outline: 'none' }}
                        >
                            {Array.from({ length: Math.max(0, 5 - creditCustomer.monthlyFreeCredits) }, (_, index) => index + 1).map((amount) => (
                                <option key={amount} value={amount}>{amount}</option>
                            ))}
                        </select>
                        <p style={{ margin: '8px 0 0', color: '#64748B', fontSize: '12px', lineHeight: 1.5 }}>A maximum of 5 free credits can be added to each customer per calendar month.</p>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                            <button type="button" disabled={addingFreeCredits} onClick={closeAddCredits} style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', borderRadius: '8px', padding: '10px 16px', cursor: addingFreeCredits ? 'not-allowed' : 'pointer', fontWeight: '800' }}>Cancel</button>
                            <button type="submit" disabled={addingFreeCredits || freeCreditAmount < 1} style={{ border: 'none', background: '#49A8D8', color: '#FFFFFF', borderRadius: '8px', padding: '10px 16px', cursor: addingFreeCredits || freeCreditAmount < 1 ? 'not-allowed' : 'pointer', fontWeight: '800', opacity: addingFreeCredits || freeCreditAmount < 1 ? 0.65 : 1 }}>
                                {addingFreeCredits ? 'Adding...' : 'Add Credits'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {deleteTarget && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delete-confirmation-title"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) closeDeleteModal();
                    }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.62)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
                >
                    <form onSubmit={confirmDelete} style={{ width: 'min(480px, calc(100vw - 48px))', background: '#FFFFFF', borderRadius: '8px', padding: '28px 30px', boxSizing: 'border-box', boxShadow: '0 24px 60px rgba(15,23,42,0.24)' }}>
                        <h2 id="delete-confirmation-title" style={{ margin: '0 0 8px 0', color: '#0F172A', fontSize: '21px' }}>
                            Delete {deleteTarget.type === 'track' ? 'Track' : 'File'}?
                        </h2>
                        <p style={{ margin: '0 0 20px 0', color: '#64748B', fontSize: '14px', lineHeight: 1.6 }}>
                            {deleteTarget.type === 'track'
                                ? `This permanently deletes track ${deleteTarget.item.referenceId} and all ${deleteTarget.item.documents.length} associated file records and uploads.`
                                : `This permanently deletes ${deleteTarget.item.title} and its uploaded file.`}
                        </p>
                        <label style={{ display: 'block', marginBottom: '7px', color: '#334155', fontSize: '13px', fontWeight: '800' }}>Profile Password</label>
                        <input
                            type="password"
                            required
                            autoComplete="current-password"
                            value={deletePassword}
                            onChange={(event) => setDeletePassword(event.target.value)}
                            placeholder="Enter your password to confirm"
                            style={{ width: '100%', height: '42px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 12px', boxSizing: 'border-box', color: '#0F172A', outline: 'none', margin: 0 }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                            <button type="button" disabled={deleting} onClick={closeDeleteModal} style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', borderRadius: '8px', padding: '10px 16px', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: '800' }}>Cancel</button>
                            <button type="submit" disabled={deleting || !deletePassword} style={{ border: 'none', background: '#DC2626', color: '#FFFFFF', borderRadius: '8px', padding: '10px 16px', cursor: deleting || !deletePassword ? 'not-allowed' : 'pointer', fontWeight: '800', opacity: deleting || !deletePassword ? 0.65 : 1 }}>
                                {deleting ? 'Deleting...' : 'Confirm Delete'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {reassignTrack && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="reassign-track-title"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget && !reassigning) setReassignTrack(null);
                    }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.62)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
                >
                    <form onSubmit={confirmReassignment} style={{ width: 'min(500px, calc(100vw - 48px))', background: '#FFFFFF', borderRadius: '8px', padding: '28px 30px', boxSizing: 'border-box', boxShadow: '0 24px 60px rgba(15,23,42,0.24)' }}>
                        <h2 id="reassign-track-title" style={{ margin: '0 0 6px 0', color: '#0F172A', fontSize: '21px' }}>Reassign Track</h2>
                        <p style={{ margin: '0 0 22px 0', color: '#64748B', fontSize: '14px' }}>Reference: <strong style={{ color: '#334155' }}>{reassignTrack.referenceId}</strong></p>

                        <div style={{ padding: '12px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', marginBottom: '18px' }}>
                            <p style={{ margin: '0 0 5px 0', color: '#64748B', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' }}>Currently Assigned To</p>
                            <p style={{ margin: 0, color: '#0F172A', fontSize: '14px', fontWeight: '800' }}>
                                {reassignTrack.hasMultipleVerifiers
                                    ? 'Multiple Verifiers'
                                    : (() => {
                                        const currentVerifier = profileById.get(reassignTrack.assignedVerifierId);
                                        if (!currentVerifier) return 'Unassigned';
                                        return `${currentVerifier.first_name || ''} ${currentVerifier.last_name || ''}`.trim() || currentVerifier.email;
                                    })()}
                            </p>
                        </div>

                        <label style={{ display: 'block', marginBottom: '7px', color: '#334155', fontSize: '13px', fontWeight: '800' }}>Reassign To</label>
                        <select
                            required
                            value={reassignVerifierId}
                            onChange={(event) => setReassignVerifierId(event.target.value)}
                            style={{ width: '100%', height: '42px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 12px', color: '#0F172A', background: '#FFFFFF', outline: 'none' }}
                        >
                            <option value="">Select verifier...</option>
                            {verifiers.map((verifier) => (
                                <option key={verifier.id} value={verifier.id}>
                                    {`${verifier.first_name || ''} ${verifier.last_name || ''}`.trim() || verifier.email}
                                </option>
                            ))}
                        </select>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                            <button type="button" disabled={reassigning} onClick={() => setReassignTrack(null)} style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', borderRadius: '8px', padding: '10px 16px', cursor: reassigning ? 'not-allowed' : 'pointer', fontWeight: '800' }}>Cancel</button>
                            <button type="submit" disabled={reassigning || !reassignVerifierId} style={{ border: 'none', background: '#49A8D8', color: '#FFFFFF', borderRadius: '8px', padding: '10px 16px', cursor: reassigning || !reassignVerifierId ? 'not-allowed' : 'pointer', fontWeight: '800', opacity: reassigning || !reassignVerifierId ? 0.65 : 1 }}>
                                {reassigning ? 'Reassigning...' : 'Reassign Track'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {selectedDocument && (
                <InternalDocumentModal document={selectedDocument} profile={profile} mode="manager" verifiers={verifiers} onClose={() => setSelectedDocument(null)} onChanged={loadData} />
            )}
        </div>
    );
}
