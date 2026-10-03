import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import { getCountryRiskProfile, getTradeReviewProfile, RiskBadge, riskProfileCountries, TradeReviewBadge } from '../utils/riskProfiles';
import { getErrorMessage } from '../utils/errors';
import { pricingPlans } from '../data/pricingPlans';
import { documentTypes } from '../data/documentTypes';
import { createDocumentSignedUrl } from '../utils/documentPreview';
import DocumentPreviewViewer from './DocumentPreviewViewer';
import DashboardHowItWorksModal from './DashboardHowItWorksModal';
import ReportIssueModal from './ReportIssueModal';
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

const baseCountries = [
    'Afghanistan',
    'Australia',
    'Bangladesh',
    'Belgium',
    'Brazil',
    'Canada',
    'China',
    'France',
    'Germany',
    'Hong Kong',
    'India',
    'Indonesia',
    'Italy',
    'Japan',
    'Malaysia',
    'Nepal',
    'Netherlands',
    'Singapore',
    'South Africa',
    'South Korea',
    'Sri Lanka',
    'Thailand',
    'United Arab Emirates',
    'United Kingdom',
    'United States',
    'Vietnam',
    'Other'
];

const countries = Array.from(new Set([...baseCountries.filter((country) => country !== 'Other'), ...riskProfileCountries])).sort((a, b) => a.localeCompare(b)).concat('Other');
const currencies = [
    'INR',
    'USD',
    'EUR',
    'GBP',
    'AED',
    'AUD',
    'BDT',
    'CAD',
    'CHF',
    'CNY',
    'HKD',
    'IDR',
    'JPY',
    'KRW',
    'LKR',
    'MYR',
    'NPR',
    'SGD',
    'THB',
    'VND',
    'ZAR',
    'Other'
];

const paymentMethods = ['LC', 'Non-LC', 'Both'];
const adBanks = [
    'State Bank of India',
    'HDFC Bank',
    'ICICI Bank',
    'Axis Bank',
    'Kotak Mahindra Bank',
    'Bank of Baroda',
    'Punjab National Bank',
    'Canara Bank',
    'Union Bank of India',
    'Bank of India',
    'IDFC FIRST Bank',
    'IndusInd Bank',
    'Yes Bank',
    'Federal Bank',
    'IDBI Bank',
    'Indian Bank',
    'Central Bank of India',
    'UCO Bank',
    'HSBC India',
    'Standard Chartered Bank',
    'Citibank India',
    'Deutsche Bank India',
    'DBS Bank India',
    'Other'
];
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const filterTabs = ['All', 'Pending Review', 'Needs Info', 'Compliant', 'Clearance Issue'];
const dateFilterTabs = ['All Dates', 'Today', 'This Week', 'This Month', 'This Year'];
const lockedDeleteStatuses = ['needs_info', 'approved', 'clearance_issue'];

function makeSafeFileName(fileName) {
    const extension = fileName.includes('.') ? fileName.split('.').pop() : 'file';
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    const safeBaseName = baseName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return `${safeBaseName || 'document'}.${extension.toLowerCase()}`;
}

function formatDate(value) {
    if (!value) return '-';
    return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).format(new Date(value));
}

function formatTransactionDescription(transaction) {
    const description = (transaction.description || '').toLowerCase();
    if (description.includes('freebie')) return 'Freebies Credited';
    if (description.includes('business') && description.includes('plan')) return 'Business Plan Activated';
    if (description.includes('standard') && description.includes('plan')) return 'Standard Plan Activated';
    return transaction.description || transaction.transaction_type.replaceAll('_', ' ');
}

function formatDateTimeIST(value) {
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

function statusFromTab(tab) {
    if (tab === 'Compliant') return 'approved';
    return tab.toLowerCase().replace(/\s+/g, '_');
}

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
        <div style={{ width: '44px', height: '44px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}18`, flex: '0 0 44px' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                {iconPath[type] || iconPath.total}
            </svg>
        </div>
    );
}

function getTrackStatus(documents) {
    if (documents.some((document) => document.status === 'clearance_issue')) return 'clearance_issue';
    if (documents.some((document) => document.status === 'needs_info')) return 'needs_info';
    if (documents.some((document) => document.status === 'pending_review')) return 'pending_review';
    if (documents.every((document) => document.status === 'approved')) return 'approved';
    return documents[0]?.status || 'pending_review';
}

function makeReferenceNumber() {
    return `CLR-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

const fieldStyle = {
    width: '100%',
    height: '44px',
    border: '1px solid #CBDDD8',
    borderRadius: '8px',
    padding: '0 18px',
    fontFamily: 'inherit',
    fontSize: '14px',
    lineHeight: '1.4',
    color: '#0F2D27',
    background: '#FFFFFF',
    boxSizing: 'border-box',
    outline: 'none'
};

const selectFieldStyle = {
    ...fieldStyle,
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    lineHeight: '44px',
    padding: '0 40px 0 20px',
    backgroundImage: 'linear-gradient(45deg, transparent 50%, #557D71 50%), linear-gradient(135deg, #557D71 50%, transparent 50%)',
    backgroundPosition: 'calc(100% - 18px) 19px, calc(100% - 13px) 19px',
    backgroundSize: '5px 5px, 5px 5px',
    backgroundRepeat: 'no-repeat'
};

const labelStyle = {
    display: 'block',
    color: '#0F2D27',
    fontWeight: '700',
    marginBottom: '7px',
    fontSize: '13px',
    lineHeight: '1.3'
};

const clearanceLabelStyle = {
    ...labelStyle,
    marginBottom: '10px',
    paddingBottom: '0'
};

const disabledFieldStyle = {
    ...fieldStyle,
    border: '1px solid #D4D9DE',
    background: '#F1F3F5',
    color: '#7A8691',
    cursor: 'not-allowed'
};

const uploadGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
    columnGap: '18px',
    rowGap: '18px',
    alignItems: 'start'
};

const uploadFieldStyle = {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start'
};

const clearanceFieldStyle = {
    ...uploadFieldStyle,
    gap: 0
};

const clearanceFieldsStackStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px'
};

const clearanceFieldRowStyle = {
    display: 'flex',
    gap: '22px',
    alignItems: 'flex-start'
};

const clearanceFieldColumnStyle = {
    ...clearanceFieldStyle,
    flex: '1 1 0',
    
    maxWidth: '420px'
};

const uploadFullSpan = {
    gridColumn: '1 / -1',
    ...uploadFieldStyle
};

const trackTableColumns = '44px minmax(150px, 1.3fr) minmax(120px, 1fr) minmax(110px, 0.9fr) minmax(145px, 0.95fr) minmax(190px, 1.1fr) minmax(95px, 0.8fr) minmax(120px, 0.9fr) 120px 140px 250px';
const trackTableMinWidth = 1570;
const trackScrollableWidth = 1180;
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
    right: '262px',
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

const modalCloseButtonStyle = {
    border: 'none',
    background: 'transparent',
    color: '#888888',
    cursor: 'pointer',
    fontSize: '24px',
    lineHeight: 1,
    fontWeight: '600',
    padding: '0 2px'
};

const dropdownMenuButtonStyle = {
    width: '100%',
    padding: '8px 10px',
    background: 'none',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#334155',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '9px'
};

function getIndianMobileDigits(value) {
    const digits = String(value || '').replace(/\D/g, '');
    const withoutCountryCode = digits.length > 10 && digits.startsWith('91')
        ? digits.slice(2)
        : digits;

    return withoutCountryCode.slice(-10);
}

function DropdownIcon({ type }) {
    const paths = {
        profile: (
            <>
                <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                <path d="M4 21a8 8 0 0 1 16 0" />
            </>
        ),
        payments: (
            <>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 10h18" />
                <path d="M7 15h4" />
            </>
        ),
        guide: (
            <>
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9a2.7 2.7 0 0 1 5.1 1.2c0 1.8-2.6 2.1-2.6 3.8" />
                <path d="M12 17h.01" />
            </>
        ),
        issue: (
            <>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v6" />
                <path d="M12 17h.01" />
            </>
        ),
        contact: (
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.33 1.84.56 2.8.69A2 2 0 0 1 22 16.92z" />
        ),
        logout: (
            <>
                <path d="M10 17l5-5-5-5" />
                <path d="M15 12H3" />
                <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
            </>
        )
    };

    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: '0 0 15px' }}>
            {paths[type]}
        </svg>
    );
}

function CreditsIcon({ size = 17 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: `0 0 ${size}px` }}>
            <circle cx="12" cy="12" r="8" />
            <path d="M8.5 7.5h7" />
            <path d="M8.5 10.5h7" />
            <path d="M8.5 7.5h2.7a3 3 0 0 1 0 6H8.5l5 4.5" />
        </svg>
    );
}

function PlanIcon({ planType, size = 16 }) {
    const icon = planType === 'business' ? (
        <>
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M3 12h18" />
            <path d="M10 12v2h4v-2" />
        </>
    ) : planType === 'trial' ? (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
        </>
    ) : (
        <path d="m12 2.8 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9L6.4 20l1.1-6.2L3 9.4l6.2-.9L12 2.8z" />
    );

    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: `0 0 ${size}px` }}>
            {icon}
        </svg>
    );
}

export default function ExporterDashboard({ session, userProfile, onProfileUpdated, onLogout }) {
    const { showToast } = useToast();
    const userId = session?.user?.id || userProfile?.id;
    const tableScrollRef = useRef(null);
    const topTableScrollRef = useRef(null);
    const profileMenuRef = useRef(null);

    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [editProfileOpen, setEditProfileOpen] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);
    const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
    const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
    const [deletingAccount, setDeletingAccount] = useState(false);
    const [paymentsOpen, setPaymentsOpen] = useState(false);
    const [paymentInstructionsOpen, setPaymentInstructionsOpen] = useState(false);
    const [howItWorksOpen, setHowItWorksOpen] = useState(false);
    const [reportIssueOpen, setReportIssueOpen] = useState(false);
    const [contactOpen, setContactOpen] = useState(false);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [transactions, setTransactions] = useState([]);
    const [customerInvoices, setCustomerInvoices] = useState([]);
    const [editProfileForm, setEditProfileForm] = useState({
        firstName: '',
        lastName: '',
        companyName: '',
        iec: '',
        mobileNumber: '',
        email: '',
        address: '',
        gstin: '',
        pan: ''
    });
    const [documents, setDocuments] = useState([]);
    const [formattedVersions, setFormattedVersions] = useState([]);
    const [clearanceTracks, setClearanceTracks] = useState([]);
    const [availableClearances, setAvailableClearances] = useState(userProfile?.available_clearances ?? 0);
    const [currentPlan, setCurrentPlan] = useState(null);
    const [activeTab, setActiveTab] = useState('All');
    const [activeDateFilter, setActiveDateFilter] = useState('All Dates');
    const [searchTerm, setSearchTerm] = useState('');
    const [loadingDocuments, setLoadingDocuments] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [creatingClearance, setCreatingClearance] = useState(false);
    const [clearanceModalOpen, setClearanceModalOpen] = useState(false);
    const [clearanceFiles, setClearanceFiles] = useState([]);
    const [collapsedTracks, setCollapsedTracks] = useState({});
    const [selectedDocument, setSelectedDocument] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [previewingFile, setPreviewingFile] = useState(null);
    const [comments, setComments] = useState([]);
    const [statusHistory, setStatusHistory] = useState([]);
    const [commentText, setCommentText] = useState('');
    const [modalLoading, setModalLoading] = useState(false);
    const [commentSubmitting, setCommentSubmitting] = useState(false);
    const [statusSubmitting, setStatusSubmitting] = useState(false);
    const [deletingTrackId, setDeletingTrackId] = useState(null);
    const [deleteTrackTarget, setDeleteTrackTarget] = useState(null);
    const [deleteTrackPassword, setDeleteTrackPassword] = useState('');

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

    useEffect(() => {
        if (!isProfileMenuOpen) return undefined;

        const handlePointerDown = (event) => {
            if (profileMenuRef.current?.contains(event.target)) return;
            setIsProfileMenuOpen(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
        };
    }, [isProfileMenuOpen]);

    const openEditProfile = () => {
        const metadata = session?.user?.user_metadata || {};

        setEditProfileForm({
            firstName: userProfile?.first_name || metadata.first_name || '',
            lastName: userProfile?.last_name || metadata.last_name || '',
            companyName: userProfile?.company_name || metadata.company_name || '',
            iec: userProfile?.iec_code || metadata.iec_code || '',
            mobileNumber: getIndianMobileDigits(userProfile?.mobile_number || metadata.mobile_number),
            email: session?.user?.email || userProfile?.email || '',
            address: userProfile?.address || metadata.address || '',
            gstin: userProfile?.gstin || metadata.gstin || '',
            pan: userProfile?.pan || metadata.pan || ''
        });
        setIsProfileMenuOpen(false);
        setEditProfileOpen(true);
    };

    const openPayments = async () => {
        setIsProfileMenuOpen(false);
        setPaymentsOpen(true);
        setLoadingTransactions(true);

        const [{ data, error }, { data: invoiceData, error: invoiceError }] = await Promise.all([
            supabase.from('credit_transactions').select('id, transaction_type, credits, amount, currency, description, status, created_at').eq('profile_id', userId).order('created_at', { ascending: false }).limit(20),
            supabase.from('customer_invoices').select('*').eq('profile_id', userId).order('created_at', { ascending: false })
        ]);

        setLoadingTransactions(false);

        if (error) {
            setTransactions([]);
            return;
        }

        setTransactions(data || []);
        if (invoiceError) showToast(invoiceError.message, 'error');
        else setCustomerInvoices(invoiceData || []);
    };

    const openUploadedInvoice = async (invoice) => {
        try {
            const response = await fetch(await createDocumentSignedUrl(supabase, invoice));
            if (!response.ok) throw new Error('Invoice download failed.');
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement('a'); link.href = url; link.download = invoice.file_name; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
        }
        catch (error) { showToast(error.message, 'error'); }
    };

    const handleProfileSubmit = async (event) => {
        event.preventDefault();
        if (!userId) return;

        const firstName = editProfileForm.firstName.trim();
        const lastName = editProfileForm.lastName.trim();
        const companyName = editProfileForm.companyName.trim();
        const mobileDigits = getIndianMobileDigits(editProfileForm.mobileNumber);
        const mobileNumber = mobileDigits ? `+91${mobileDigits}` : '';
        const email = editProfileForm.email.trim().toLowerCase();
        const address = editProfileForm.address.trim();
        const gstin = editProfileForm.gstin.trim().toUpperCase();
        const pan = editProfileForm.pan.trim().toUpperCase();
        const currentEmail = (session?.user?.email || userProfile?.email || '').trim().toLowerCase();

        if (!firstName || !lastName || !companyName || !email) {
            showToast('Please complete all required profile fields.', 'error');
            return;
        }

        if (mobileDigits && mobileDigits.length !== 10) {
            showToast('Enter a valid 10-digit Indian mobile number.', 'error');
            return;
        }

        if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
            showToast('Enter a valid GSTIN or leave it blank.', 'error');
            return;
        }

        if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
            showToast('Enter a valid PAN or leave it blank.', 'error');
            return;
        }

        setSavingProfile(true);

        try {
            const profilePayload = {
                first_name: firstName,
                last_name: lastName,
                company_name: companyName,
                mobile_number: mobileNumber || null,
                address: address || null,
                gstin: gstin || null,
                pan: pan || null,
                updated_at: new Date().toISOString()
            };

            const { data: updatedProfile, error: profileError } = await supabase
                .from('profiles')
                .update(profilePayload)
                .eq('id', userId)
                .select()
                .single();

            if (profileError?.message?.includes('mobile_number')) {
                throw new Error('Mobile number could not be saved because the profiles.mobile_number database column is missing. Run add_profile_mobile_number.sql in Supabase, then save the profile again.');
            }

            if (profileError?.message?.includes('address') || profileError?.message?.includes('gstin') || profileError?.message?.includes('pan')) {
                throw new Error('Business details could not be saved because the profiles address/GSTIN/PAN columns are missing. Run supabase/add_profile_business_details.sql in Supabase, then save the profile again.');
            }

            if (profileError) throw profileError;

            const authAttributes = {
                data: {
                    ...(session?.user?.user_metadata || {}),
                    first_name: firstName,
                    last_name: lastName,
                    company_name: companyName,
                    mobile_number: mobileNumber,
                    address,
                    gstin,
                    pan
                }
            };

            if (email !== currentEmail) {
                authAttributes.email = email;
            }

            const { error: authError } = await supabase.auth.updateUser(
                authAttributes,
                { emailRedirectTo: `${window.location.origin}/auth/confirm` }
            );

            if (authError) throw authError;

            onProfileUpdated?.({
                ...userProfile,
                ...updatedProfile
            });
            setEditProfileOpen(false);

            if (email !== currentEmail) {
                showToast(`Profile saved. Verify the email sent to ${email} to complete the email change.`, 'success');
            } else {
                showToast('Profile updated successfully.', 'success');
            }
        } catch (error) {
            showToast(getErrorMessage(error), 'error');
        } finally {
            setSavingProfile(false);
        }
    };

    const requestAccountDeletion = async (event) => {
        event.preventDefault();
        if (!deleteAccountPassword || !session?.user?.email) return;
        setDeletingAccount(true);
        const { error: passwordError } = await supabase.auth.signInWithPassword({ email: session.user.email, password: deleteAccountPassword });
        if (passwordError) {
            setDeletingAccount(false);
            showToast('The password is incorrect.', 'error');
            return;
        }
        const { error } = await supabase.rpc('request_own_account_deletion');
        setDeletingAccount(false);
        if (error) {
            showToast(error.message, 'error');
            return;
        }
        setDeleteAccountOpen(false);
        setEditProfileOpen(false);
        setDeleteAccountPassword('');
        showToast('Account deletion scheduled. Sign in within 14 days to restore it.', 'success');
        await onLogout();
    };

    const [uploadForm, setUploadForm] = useState({
        title: '',
        documentType: 'Commercial Invoice',
        referenceId: '',
        adBankName: '',
        paymentMethod: 'LC',
        customerName: '',
        destinationCountry: '',
        invoiceCurrency: 'INR',
        notes: '',
        file: null
    });
    const [clearanceForm, setClearanceForm] = useState({
        referenceId: '',
        adBankName: '',
        paymentMethod: 'LC',
        customerName: '',
        destinationCountry: '',
        invoiceCurrency: 'INR'
    });

    const loadDocuments = async () => {
        if (!userId) return;

        setLoadingDocuments(true);
        const [{ data, error }, { data: trackData, error: trackError }, { data: profileData, error: profileError }, { data: planData, error: planError }, { data: versionData, error: versionError }] = await Promise.all([
            supabase
            .from('documents')
            .select('id, title, document_type, reference_id, storage_bucket, storage_path, file_name, file_size, mime_type, status, submitted_at, approved_at, updated_at, payment_method, ad_bank_name, customer_name, destination_country, invoice_currency, notes')
            .eq('profile_id', userId)
                .order('submitted_at', { ascending: false }),
            supabase
                .from('clearance_tracks')
                .select('id, reference_id, customer_name, destination_country, invoice_currency, ad_bank_name, payment_method, created_at, updated_at')
                .eq('profile_id', userId)
                .order('created_at', { ascending: false }),
            supabase
                .from('profiles')
                .select('available_clearances')
                .eq('id', userId)
                .single(),
            supabase
                .from('customer_plan_activations')
                .select('id, plan_type, status, starts_at, expires_at, track_limit, tracks_used, amount, currency, payment_reference, created_at')
                .eq('profile_id', userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
            supabase.from('document_formatted_versions').select('*').order('created_at', { ascending: false })
        ]);

        setLoadingDocuments(false);

        if (error) {
            showToast(error.message, 'error');
            return;
        }
        if (trackError) {
            showToast(trackError.message, 'error');
            return;
        }
        if (profileError) {
            showToast(profileError.message, 'error');
            return;
        }
        if (versionError) {
            showToast(versionError.message, 'error');
            return;
        }

        setDocuments(data || []);
        setClearanceTracks(trackData || []);
        setFormattedVersions(versionData || []);
        const fallbackCredits = profileData?.available_clearances ?? 0;
        const resolvedPlan = planError
            ? { plan_type: 'trial', status: fallbackCredits > 0 ? 'active' : 'exhausted', track_limit: fallbackCredits, tracks_used: 0, legacyFallback: true }
            : planData;
        setCurrentPlan(resolvedPlan || null);
        const resolvedPlanExpired = Boolean(resolvedPlan?.expires_at && new Date(resolvedPlan.expires_at) <= new Date());
        const resolvedPlanActive = resolvedPlan?.status === 'active' && !resolvedPlanExpired;
        setAvailableClearances(resolvedPlanActive ? Math.max(0, (resolvedPlan?.track_limit ?? fallbackCredits) - (resolvedPlan?.tracks_used ?? 0)) : 0);
    };

    useEffect(() => {
        loadDocuments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    const tracks = useMemo(() => {
        const map = new Map();

        clearanceTracks.forEach((track) => {
            const referenceId = track.reference_id || 'UNREFERENCED';
            map.set(referenceId, {
                id: track.id,
                referenceId,
                documents: [],
                submittedAt: track.created_at,
                paymentMethod: track.payment_method || '-',
                adBankName: track.ad_bank_name || '-',
                customerName: track.customer_name || '-',
                destinationCountry: track.destination_country || '-',
                invoiceCurrency: track.invoice_currency || '-',
                createdAt: track.created_at
            });
        });

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
            track.paymentMethod = track.paymentMethod === '-' ? (document.payment_method || '-') : track.paymentMethod;
            track.adBankName = track.adBankName === '-' ? (document.ad_bank_name || '-') : track.adBankName;
            track.customerName = track.customerName === '-' ? (document.customer_name || '-') : track.customerName;
            track.destinationCountry = track.destinationCountry === '-' ? (document.destination_country || '-') : track.destinationCountry;
            track.invoiceCurrency = track.invoiceCurrency === '-' ? (document.invoice_currency || '-') : track.invoiceCurrency;
        });

        return Array.from(map.values()).map((track) => ({
            ...track,
            status: track.documents.length > 0 ? getTrackStatus(track.documents) : 'pending_review',
            title: track.documents[0]?.title || 'Clearance Track'
        }));
    }, [clearanceTracks, documents]);

    const dateFilteredTracks = useMemo(() => (
        tracks.filter((track) => matchesDateFilter(track.submittedAt, activeDateFilter))
    ), [activeDateFilter, tracks]);

    const filteredTracks = useMemo(() => {
        const statusFilter = activeTab === 'All' ? null : statusFromTab(activeTab);
        const query = searchTerm.trim().toLowerCase();

        return dateFilteredTracks.filter((track) => {
            const riskLabel = getCountryRiskProfile(track.destinationCountry).label.toLowerCase();
            const tradeReviewLabel = getTradeReviewProfile(track.destinationCountry).label.toLowerCase();
            const matchesStatus = !statusFilter || track.status === statusFilter;
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

            return matchesStatus && matchesSearch;
        });
    }, [activeTab, dateFilteredTracks, searchTerm]);

    const metrics = useMemo(() => ({
        pending_review: dateFilteredTracks.filter((track) => track.status === 'pending_review').length,
        needs_info: dateFilteredTracks.filter((track) => track.status === 'needs_info').length,
        clearance_issue: dateFilteredTracks.filter((track) => track.status === 'clearance_issue').length,
        approved: dateFilteredTracks.filter((track) => track.status === 'approved').length,
        total: dateFilteredTracks.length
    }), [dateFilteredTracks]);

    const planExpired = Boolean(currentPlan?.expires_at && new Date(currentPlan.expires_at) <= new Date());
    const planActive = currentPlan?.status === 'active' && !planExpired;
    const canCreateClearance = planActive && (availableClearances ?? 0) > 0;
    const planName = currentPlan?.plan_type
        ? `${currentPlan.plan_type.charAt(0).toUpperCase()}${currentPlan.plan_type.slice(1)}`
        : 'No Plan';
    const clearanceDisplay = planActive ? (availableClearances ?? 0) : 0;
    const planDaysRemaining = currentPlan?.expires_at
        ? Math.max(0, Math.ceil((new Date(currentPlan.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
        : null;

    const openUploadModal = (track = null) => {
        setUploadForm({
            title: '',
            documentType: 'Commercial Invoice',
            referenceId: track?.referenceId || '',
            adBankName: track?.adBankName === '-' ? '' : track?.adBankName || '',
            paymentMethod: paymentMethods.includes(track?.paymentMethod) ? track.paymentMethod : 'LC',
            customerName: track?.customerName === '-' ? '' : track?.customerName || '',
            destinationCountry: track?.destinationCountry === '-' ? '' : track?.destinationCountry || '',
            invoiceCurrency: track?.invoiceCurrency === '-' ? 'INR' : track?.invoiceCurrency || 'INR',
            notes: '',
            file: null
        });
        setUploadModalOpen(true);
    };

    const openClearanceModal = () => {
        if (!canCreateClearance) {
            showToast('Your account is view-only. Please complete payment and ask a manager to activate a plan.', 'error');
            openPayments();
            return;
        }

        setClearanceForm({
            referenceId: '',
            adBankName: '',
            paymentMethod: 'LC',
            customerName: '',
            destinationCountry: '',
            invoiceCurrency: 'INR'
        });
        setClearanceFiles([]);
        setClearanceModalOpen(true);
    };

    const handleCreateClearance = async (event) => {
        event.preventDefault();

        if (!userId) {
            showToast('Please sign in before creating a clearance.', 'error');
            return;
        }
        if (!canCreateClearance) {
            showToast('Your plan is inactive or has reached its clearance limit.', 'error');
            return;
        }

        const referenceId = clearanceForm.referenceId.trim();
        if (
            !clearanceForm.customerName.trim()
            || !referenceId
            || !clearanceForm.destinationCountry.trim()
            || !clearanceForm.invoiceCurrency
            || !clearanceForm.adBankName.trim()
            || !clearanceForm.paymentMethod
        ) {
            showToast('Please complete all clearance fields.', 'error');
            return;
        }

        const totalFileSize = clearanceFiles.reduce((total, file) => total + file.size, 0);
        if (totalFileSize > 20 * 1024 * 1024) {
            showToast('The combined file size must not exceed 20 MB.', 'error');
            return;
        }

        setCreatingClearance(true);
        const { error } = await supabase
            .from('clearance_tracks')
            .insert({
                profile_id: userId,
                reference_id: referenceId,
                customer_name: clearanceForm.customerName.trim(),
                destination_country: clearanceForm.destinationCountry.trim(),
                invoice_currency: clearanceForm.invoiceCurrency,
                ad_bank_name: clearanceForm.adBankName.trim(),
                payment_method: clearanceForm.paymentMethod
            });
        if (error) {
            setCreatingClearance(false);
            showToast(error.message, 'error');
            return;
        }

        let uploadedCount = 0;
        for (const file of clearanceFiles) {
            const documentId = crypto.randomUUID();
            const storagePath = `${userId}/${documentId}/${makeSafeFileName(file.name)}`;
            const { error: uploadError } = await supabase.storage.from('documents').upload(storagePath, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type || undefined
            });
            if (uploadError) {
                showToast(`${file.name}: ${uploadError.message}`, 'error');
                continue;
            }

            const { error: documentError } = await supabase.from('documents').insert({
                id: documentId,
                profile_id: userId,
                title: file.name.replace(/\.[^.]+$/, ''),
                document_type: 'Other',
                reference_id: referenceId,
                storage_bucket: 'documents',
                storage_path: storagePath,
                file_name: file.name,
                file_size: file.size,
                mime_type: file.type || 'application/octet-stream',
                payment_method: clearanceForm.paymentMethod,
                ad_bank_name: clearanceForm.adBankName.trim(),
                customer_name: clearanceForm.customerName.trim(),
                destination_country: clearanceForm.destinationCountry.trim(),
                invoice_currency: clearanceForm.invoiceCurrency,
                status: 'pending_review'
            });
            if (documentError) {
                await supabase.storage.from('documents').remove([storagePath]);
                showToast(`${file.name}: ${documentError.message}`, 'error');
                continue;
            }
            uploadedCount += 1;
            await supabase.from('document_status_history').insert({ document_id: documentId, changed_by: userId, old_status: null, new_status: 'pending_review', reason: 'Document uploaded with clearance' });
        }

        setCreatingClearance(false);

        setClearanceModalOpen(false);
        showToast(clearanceFiles.length ? `Clearance created with ${uploadedCount} of ${clearanceFiles.length} files uploaded.` : 'Clearance created. Files can be added later.', 'success');
        loadDocuments();
    };

    const handleUploadSubmit = async (event) => {
        event.preventDefault();

        if (!uploadForm.file || !userId) {
            showToast('Please choose a file to upload.', 'error');
            return;
        }

        if (uploadForm.file.size > MAX_UPLOAD_SIZE_BYTES) {
            showToast('File size must not exceed 5 MB.', 'error');
            setUploadForm((current) => ({ ...current, file: null }));
            return;
        }

        setUploading(true);

        const documentId = crypto.randomUUID();
        const safeFileName = makeSafeFileName(uploadForm.file.name);
        const referenceId = uploadForm.referenceId.trim() || makeReferenceNumber();
        const storagePath = `${userId}/${documentId}/${safeFileName}`;

        await supabase
            .from('clearance_tracks')
            .upsert({
                profile_id: userId,
                reference_id: referenceId,
                customer_name: uploadForm.customerName.trim() || null,
                destination_country: uploadForm.destinationCountry.trim() || null,
                invoice_currency: uploadForm.invoiceCurrency,
                ad_bank_name: uploadForm.adBankName.trim() || null,
                payment_method: uploadForm.paymentMethod
            }, { onConflict: 'profile_id,reference_id' });

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storagePath, uploadForm.file, {
                cacheControl: '3600',
                upsert: false,
                contentType: uploadForm.file.type || undefined
            });

        if (uploadError) {
            setUploading(false);
            showToast(uploadError.message, 'error');
            return;
        }

        const { error: insertError } = await supabase
            .from('documents')
            .insert({
                id: documentId,
                profile_id: userId,
                title: uploadForm.file.name,
                document_type: uploadForm.documentType,
                reference_id: referenceId,
                storage_bucket: 'documents',
                storage_path: storagePath,
                file_name: uploadForm.file.name,
                file_size: uploadForm.file.size,
                mime_type: uploadForm.file.type || 'application/octet-stream',
                payment_method: uploadForm.paymentMethod,
                ad_bank_name: uploadForm.adBankName.trim() || null,
                customer_name: uploadForm.customerName.trim() || null,
                destination_country: uploadForm.destinationCountry.trim() || null,
                invoice_currency: uploadForm.invoiceCurrency.trim() || null,
                notes: uploadForm.notes.trim() || null,
                status: 'pending_review'
            });

        if (insertError) {
            setUploading(false);
            await supabase.storage.from('documents').remove([storagePath]);
            showToast(insertError.message, 'error');
            return;
        }

        await supabase.from('document_status_history').insert({
            document_id: documentId,
            changed_by: userId,
            old_status: null,
            new_status: 'pending_review',
            reason: 'Document uploaded'
        });

        setUploading(false);
        setUploadModalOpen(false);
        showToast('Document uploaded successfully.', 'success');
        loadDocuments();
    };

    const loadPreview = async (document) => {
        setSelectedDocument(document);
        setPreviewingFile(document);
        setPreviewUrl('');
        setComments([]);
        setStatusHistory([]);
        setCommentText('');
        setModalLoading(true);

        const [signedUrlResult, { data: commentData, error: commentsError }, { data: historyData, error: historyError }] = await Promise.all([
            createDocumentSignedUrl(supabase, document)
                .then((signedUrl) => ({ signedUrl, error: null }))
                .catch((error) => ({ signedUrl: '', error })),
            supabase
                .from('document_comments')
                .select('id, author_id, comment, is_internal, created_at')
                .eq('document_id', document.id)
                .order('created_at', { ascending: true }),
            supabase
                .from('document_status_history')
                .select('id, old_status, new_status, reason, created_at')
                .eq('document_id', document.id)
                .order('created_at', { ascending: false })
        ]);

        setModalLoading(false);

        if (signedUrlResult.error) {
            showToast(signedUrlResult.error.message, 'error');
        } else {
            setPreviewUrl(signedUrlResult.signedUrl);
        }

        if (commentsError) {
            showToast(commentsError.message, 'error');
        } else {
            setComments(commentData || []);
        }

        if (historyError) {
            showToast(historyError.message, 'error');
        } else {
            setStatusHistory(historyData || []);
        }
    };

    const switchPreviewFile = async (file) => {
        setModalLoading(true);
        try {
            const signedUrl = await createDocumentSignedUrl(supabase, file);
            setPreviewingFile(file);
            setPreviewUrl(signedUrl);
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setModalLoading(false);
        }
    };

    const downloadFormattedVersion = async (version) => {
        try {
            const signedUrl = await createDocumentSignedUrl(supabase, version);
            const response = await fetch(signedUrl);
            if (!response.ok) throw new Error('The formatted document could not be downloaded.');
            const blobUrl = URL.createObjectURL(await response.blob());
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = version.file_name || 'formatted-document';
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(blobUrl);
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

    const handleAddComment = async (event) => {
        event.preventDefault();

        if (!selectedDocument || !userId || !commentText.trim()) return;

        setCommentSubmitting(true);
        const { data, error } = await supabase
            .from('document_comments')
            .insert({
                document_id: selectedDocument.id,
                author_id: userId,
                comment: commentText.trim(),
                is_internal: false
            })
            .select('id, author_id, comment, is_internal, created_at')
            .single();

        setCommentSubmitting(false);

        if (error) {
            showToast(error.message, 'error');
            return;
        }

        setComments((currentComments) => [...currentComments, data]);
        setCommentText('');
    };

    const markTrackClearanceIssue = async (track) => {
        const approvedDocuments = track.documents.filter((document) => document.status === 'approved');

        if (approvedDocuments.length !== track.documents.length) {
            showToast('Payment stuck can be marked only after every document in this track is compliant.', 'error');
            return;
        }

        const confirmed = window.confirm('Mark this clearance track as a clearance issue because payment is stuck?');
        if (!confirmed) return;

        setStatusSubmitting(true);
        const approvedIds = approvedDocuments.map((document) => document.id);

        const { error } = await supabase
            .from('documents')
            .update({
                status: 'clearance_issue',
                updated_at: new Date().toISOString()
            })
            .in('id', approvedIds)
            .eq('profile_id', userId);

        if (error) {
            setStatusSubmitting(false);
            showToast(error.message, 'error');
            return;
        }

        await supabase.from('document_status_history').insert(
            approvedDocuments.map((document) => ({
                document_id: document.id,
                changed_by: userId,
                old_status: document.status,
                new_status: 'clearance_issue',
                reason: 'Exporter marked payment as stuck'
            }))
        );

        setStatusSubmitting(false);
        showToast('Clearance issue marked for this track.', 'success');
        loadDocuments();
    };

    const handleDeleteDocument = async (document) => {
        if (lockedDeleteStatuses.includes(document.status)) {
            showToast('This document is locked once review action has started.', 'error');
            return;
        }

        const confirmed = window.confirm('Delete this document entry and uploaded file?');
        if (!confirmed) return;

        const { data: deletedDocument, error: deleteError } = await supabase
            .from('documents')
            .delete()
            .eq('id', document.id)
            .eq('profile_id', userId)
            .select('id, storage_path')
            .maybeSingle();

        if (deleteError) {
            showToast(deleteError.message, 'error');
            return;
        }

        if (!deletedDocument) {
            showToast('Delete was blocked by database policy.', 'error');
            return;
        }

        const { error: storageError } = await supabase.storage
            .from('documents')
            .remove([document.storage_path]);

        if (storageError) {
            showToast('Entry deleted, but the uploaded file could not be removed from storage.', 'error');
        }

        showToast('Document deleted.', 'success');
        setDocuments((currentDocuments) => currentDocuments.filter((item) => item.id !== document.id));
    };

    const openDeleteTrackModal = (track) => {
        if (track.status !== 'pending_review' || track.documents.some((document) => document.status !== 'pending_review')) {
            showToast('Only a track whose files are all pending review can be deleted.', 'error');
            return;
        }

        setDeleteTrackPassword('');
        setDeleteTrackTarget(track);
    };

    const closeDeleteTrackModal = () => {
        if (deletingTrackId) return;
        setDeleteTrackTarget(null);
        setDeleteTrackPassword('');
    };

    const confirmDeleteTrack = async (event) => {
        event.preventDefault();
        const track = deleteTrackTarget;
        if (!track || !deleteTrackPassword) return;

        setDeletingTrackId(track.id);

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user?.email) {
            setDeletingTrackId(null);
            showToast(userError?.message || 'The signed-in profile email could not be verified.', 'error');
            return;
        }

        const { error: passwordError } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: deleteTrackPassword
        });

        if (passwordError) {
            setDeletingTrackId(null);
            showToast('Incorrect profile password.', 'error');
            return;
        }

        const { data: storedObjects, error } = await supabase.rpc('delete_pending_clearance_track', {
            track_id_input: track.id
        });

        if (error) {
            setDeletingTrackId(null);
            showToast(error.message || 'The pending review track could not be deleted.', 'error');
            return;
        }

        const objectsByBucket = (Array.isArray(storedObjects) ? storedObjects : []).reduce((groups, item) => {
            if (!item?.path) return groups;
            const bucket = item.bucket || 'documents';
            groups[bucket] = [...(groups[bucket] || []), item.path];
            return groups;
        }, {});

        const cleanupResults = await Promise.all(
            Object.entries(objectsByBucket).map(([bucket, paths]) => supabase.storage.from(bucket).remove(paths))
        );
        const storageCleanupFailed = cleanupResults.some((result) => result.error);

        setDeletingTrackId(null);
        setDeleteTrackTarget(null);
        setDeleteTrackPassword('');
        setCollapsedTracks((current) => {
            const updated = { ...current };
            delete updated[track.referenceId];
            return updated;
        });
        showToast(
            storageCleanupFailed
                ? 'Track deleted, but one or more uploaded files could not be removed from storage.'
                : 'Pending review track deleted.',
            storageCleanupFailed ? 'error' : 'success'
        );
        loadDocuments();
    };

    const metricCards = [
        { label: 'Pending Review', value: metrics.pending_review, color: '#49A8D8', icon: 'pending' },
        { label: 'Needs Info', value: metrics.needs_info, color: '#A16207', icon: 'info' },
        { label: 'Clearance Issue', value: metrics.clearance_issue, color: '#B91C1C', icon: 'issue' },
        { label: 'Compliant', value: metrics.approved, color: '#15803D', icon: 'approved' },
        { label: 'Total Tracks', value: metrics.total, color: '#0F172A', icon: 'total' }
    ];

    return (
        <div className="dashboard-container" style={{ background: '#F8FAFC', minHeight: '100vh', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 40px', background: '#fff', borderBottom: '1px solid #E2E8F0' }}>
                <div className="header-logo" style={{ display: 'flex', alignItems: 'center' }}>
                    <span className="dashboard-brand">
                        <img src={logoIcon} alt="" aria-hidden="true" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = logoFallback; }} style={{ display: 'block', width: '44px', height: '44px', objectFit: 'contain', flex: '0 0 44px' }} />
                        <span className="brand-wordmark"><span className="brand-docu">Docu</span><span className="brand-chq">CHQ</span></span>
                    </span>
                </div>

                <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {planDaysRemaining !== null && (
                        <span aria-label={`${planDaysRemaining} days remaining on the current plan`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: '34px', padding: '7px 13px', border: '1px solid rgba(73, 168, 216, 0.34)', borderRadius: '20px', background: 'rgba(73, 168, 216, 0.08)', color: '#2789B8', boxSizing: 'border-box', whiteSpace: 'nowrap', fontSize: '13px', fontWeight: '800' }}>
                            {planDaysRemaining} Day{planDaysRemaining === 1 ? '' : 's'} Left
                        </span>
                    )}
                    <button type="button" onClick={openPayments} aria-label={`Open ${planName} account details`} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', padding: '8px 14px', borderRadius: '20px', whiteSpace: 'nowrap', boxSizing: 'border-box', cursor: 'pointer', fontFamily: 'inherit', color: '#475569' }}>
                        <PlanIcon planType={currentPlan?.plan_type} />
                        <span style={{ fontSize: '13px', fontWeight: '700' }}>{planName} Account</span>
                    </button>
                    <button type="button" className="credits-counter" onClick={openPayments} aria-label="Open payments and subscriptions" style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(73, 168, 216, 0.1)', border: '1px solid rgba(73, 168, 216, 0.32)', padding: '8px 14px', borderRadius: '20px', whiteSpace: 'nowrap', boxSizing: 'border-box', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <span style={{ display: 'flex', color: '#2789B8' }}><CreditsIcon /></span>
                        <span className="credits-label" style={{ fontSize: '13px', fontWeight: '600', color: '#2789B8' }}>
                            Clearances: <span className="credits-value" style={{ fontWeight: '800', fontSize: '14px', marginLeft: '2px' }}>{clearanceDisplay}</span>
                        </span>
                    </button>

                    <div ref={profileMenuRef} className="profile-menu-container" style={{ position: 'relative' }}>
                        <button
                            className="profile-avatar-btn"
                            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                            aria-label="Toggle Profile Options"
                            style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#E2E8F0', border: 'none', cursor: 'pointer', fontWeight: 'bold', color: '#475569', fontSize: '16px' }}
                        >
                            {userProfile?.first_name ? userProfile.first_name[0].toUpperCase() : 'E'}
                        </button>

                        {isProfileMenuOpen && (
                            <div className="profile-dropdown" style={{ position: 'absolute', right: 0, top: '50px', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(10px)', border: '1px solid #E2E8F0', borderRadius: '8px', width: '220px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.14)', padding: '12px', zIndex: 100 }}>
                                <div className="dropdown-user-info">
                                    <p className="user-name" style={{ margin: '0 0 4px 0', fontWeight: 'bold', color: '#0F172A', fontSize: '14px' }}>
                                        {userProfile?.first_name || 'Exporter'} {userProfile?.last_name || 'User'}
                                    </p>
                                    <p className="user-company" style={{ margin: '0 0 12px 0', color: '#64748B', fontSize: '12px' }}>
                                        {userProfile?.company_name || 'Global Trade Inc.'}
                                    </p>
                                </div>
                                <hr style={{ border: 'none', borderTop: '1px solid #E2E8F0', margin: '8px 0' }} />
                                <button
                                    onClick={openEditProfile}
                                    style={dropdownMenuButtonStyle}
                                >
                                    <DropdownIcon type="profile" />
                                    Edit Profile
                                </button>
                                <button
                                    onClick={openPayments}
                                    style={dropdownMenuButtonStyle}
                                >
                                    <DropdownIcon type="payments" />
                                    Payments & Subscriptions
                                </button>
                                <button
                                    onClick={() => {
                                        setIsProfileMenuOpen(false);
                                        setHowItWorksOpen(true);
                                    }}
                                    style={dropdownMenuButtonStyle}
                                >
                                    <DropdownIcon type="guide" />
                                    How it Works
                                </button>
                                <button
                                    onClick={() => {
                                        setIsProfileMenuOpen(false);
                                        setReportIssueOpen(true);
                                    }}
                                    style={dropdownMenuButtonStyle}
                                >
                                    <DropdownIcon type="issue" />
                                    Report Issue
                                </button>
                                <button
                                    onClick={() => {
                                        setIsProfileMenuOpen(false);
                                        setContactOpen(true);
                                    }}
                                    style={dropdownMenuButtonStyle}
                                >
                                    <DropdownIcon type="contact" />
                                    Contact
                                </button>
                                <hr style={{ border: 'none', borderTop: '1px solid #E2E8F0', margin: '8px 0' }} />
                                <button
                                    onClick={onLogout}
                                    style={dropdownMenuButtonStyle}
                                >
                                    <DropdownIcon type="logout" />
                                    Log Out
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main className="dashboard-content" style={{ paddingBottom: '40px' }}>
                <div className="content-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '32px 40px 8px 40px' }}>
                    <div>
                        <h1 style={{ fontSize: '28px', color: '#0F172A', margin: '0 0 6px 0', fontWeight: '700' }}>Compliance Documents</h1>
                        <p style={{ margin: 0, color: '#64748B', fontSize: '15px' }}>Manage clearance tracks, uploaded files, comments, and bank/payment context.</p>
                    </div>
                    <button onClick={openClearanceModal} disabled={creatingClearance} style={{ backgroundColor: '#49A8D8', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: '700', cursor: creatingClearance ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', opacity: creatingClearance ? 0.7 : 1 }}>
                        <span style={{ fontSize: '16px', fontWeight: 'bold' }}>+</span> Create Clearance
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', padding: '24px 40px' }}>
                    {metricCards.map((card) => (
                        <div key={card.label} style={{ padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <MetricIcon color={card.color} type={card.icon} />
                            <div>
                                <h3 style={{ fontSize: '26px', fontWeight: '800', margin: 0, color: card.color }}>{card.value}</h3>
                                <p style={{ fontSize: '13px', margin: 0, fontWeight: '700', color: card.color }}>{card.label}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="document-submissions-table" style={{ padding: '20px 40px' }}>
                    <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid #EEF2F7', paddingBottom: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                        {dateFilterTabs.map((tab) => {
                            const isActive = activeDateFilter === tab;
                            return (
                                <button key={tab} onClick={() => setActiveDateFilter(tab)} style={{ padding: '6px 12px', borderRadius: '7px', border: 'none', backgroundColor: isActive ? '#49A8D8' : 'transparent', color: isActive ? '#FFFFFF' : '#64748B', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}>
                                    {tab}
                                </button>
                            );
                        })}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {filterTabs.map((tab) => {
                                const isActive = activeTab === tab;
                                return (
                                    <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: isActive ? '#49A8D8' : 'transparent', color: isActive ? '#FFFFFF' : '#64748B', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>
                                        {tab}
                                    </button>
                                );
                            })}
                        </div>

                        <input
                            type="text"
                            placeholder="Search reference, bank, file..."
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '14px', width: '260px', height: '36px', boxSizing: 'border-box', outline: 'none', color: '#0F172A' }}
                        />
                    </div>

                    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', width: '100%', overflow: 'hidden' }}>
                        <div
                            ref={topTableScrollRef}
                            onScroll={syncTopTableScroll}
                            style={{ overflowX: 'auto', overflowY: 'hidden', marginRight: '402px', height: '13px', borderBottom: '1px solid #E2E8F0', background: '#FFFFFF' }}
                        >
                            <div style={{ width: `${trackScrollableWidth}px`, height: '1px' }} />
                        </div>
                        <div ref={tableScrollRef} className="hide-horizontal-scrollbar" onScroll={syncMainTableScroll} style={{ overflowX: 'auto', overflowY: 'hidden' }}>
                        <div style={{ minWidth: `${trackTableMinWidth}px` }}>
                            <div style={{ display: 'grid', gridTemplateColumns: trackTableColumns, padding: '14px 20px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', gap: '12px' }}>
                                {['', 'Reference Track', 'Customer', 'Country', 'Risk', 'Trade Review', 'Currency', 'Payment Method', 'Submitted', 'Status', 'Action'].map((heading, index) => (
                                    <span
                                        key={heading}
                                        style={{
                                            fontSize: '13px',
                                            fontWeight: '800',
                                            color: '#475569',
                                            display: 'flex',
                                            alignItems: 'center',
                                            whiteSpace: heading === 'Payment Method' ? 'normal' : 'nowrap',
                                            ...(index === 9 ? stickyHeaderStatusStyle : {}),
                                            ...(index === 10 ? stickyHeaderActionStyle : {})
                                        }}
                                    >
                                        {heading}
                                    </span>
                                ))}
                            </div>

                            {loadingDocuments ? (
                                <div style={{ padding: '80px 20px', textAlign: 'center', color: '#64748B' }}>Loading your clearance tracks...</div>
                            ) : filteredTracks.length === 0 ? (
                                <div style={{ padding: '80px 20px', textAlign: 'center', color: '#94A3B8' }}>No clearance tracks found.</div>
                            ) : (
                                filteredTracks.map((track) => {
                                    const meta = statusMeta[track.status] || statusMeta.pending_review;
                                    const collapsed = collapsedTracks[track.referenceId] !== false;
                                    const canDeleteTrack = Boolean(track.id)
                                        && track.status === 'pending_review'
                                        && track.documents.every((document) => document.status === 'pending_review');

                                    return (
                                        <React.Fragment key={track.referenceId}>
                                            <div style={{ display: 'grid', gridTemplateColumns: trackTableColumns, padding: '14px 20px', borderTop: '1px solid #E2E8F0', alignItems: 'center', gap: '12px' }}>
                                            <button onClick={() => setCollapsedTracks((current) => ({ ...current, [track.referenceId]: !collapsed }))} style={{ border: 'none', background: '#F1F5F9', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', color: '#334155', fontWeight: '800' }}>
                                                {collapsed ? '+' : '-'}
                                            </button>
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
                                            <span style={{ color: '#475569', fontSize: '13px' }}>{formatDate(track.submittedAt)}</span>
                                            <div style={stickyStatusStyle}>
                                                <span style={{ width: 'fit-content', borderRadius: '999px', padding: '5px 10px', fontSize: '12px', fontWeight: '800', color: meta.color, background: meta.background, whiteSpace: 'nowrap' }}>{meta.label}</span>
                                            </div>
                                            <div style={{ ...stickyActionStyle, gap: '8px', flexWrap: 'wrap' }}>
                                                <button onClick={() => openUploadModal(track)} style={{ ...softBlueButtonStyle, padding: '7px 10px' }}>Add File</button>
                                                {canDeleteTrack && (
                                                    <button
                                                        disabled={deletingTrackId === track.id}
                                                        onClick={() => openDeleteTrackModal(track)}
                                                        style={{ border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', borderRadius: '6px', padding: '7px 10px', cursor: deletingTrackId === track.id ? 'not-allowed' : 'pointer', fontWeight: '800', fontSize: '12px', opacity: deletingTrackId === track.id ? 0.65 : 1 }}
                                                    >
                                                        {deletingTrackId === track.id ? 'Deleting...' : 'Delete Track'}
                                                    </button>
                                                )}
                                                {track.documents.length > 0 && track.documents.every((document) => document.status === 'approved') && (
                                                    <button disabled={statusSubmitting} onClick={() => markTrackClearanceIssue(track)} style={{ border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', borderRadius: '6px', padding: '7px 10px', cursor: statusSubmitting ? 'not-allowed' : 'pointer', fontWeight: '800', fontSize: '12px' }}>Need Help</button>
                                                )}
                                            </div>
                                        </div>

                                        {!collapsed && (
                                            <div style={{ background: '#FBFEFD', borderTop: '1px solid #E2E8F0', padding: '8px 20px 14px 64px' }}>
                                                {track.documents.length === 0 ? (
                                                    <div style={{ padding: '14px 0', color: '#94A3B8', fontSize: '13px', fontWeight: '700' }}>No files added yet.</div>
                                                ) : track.documents.map((document) => {
                                                    const documentMeta = statusMeta[document.status] || statusMeta.pending_review;
                                                    const canDelete = !lockedDeleteStatuses.includes(document.status);
                                                    const formattedVersion = formattedVersions.find((version) => version.document_id === document.id);
                                                    return (
                                                        <div key={document.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.1fr 1.1fr 1fr 1.2fr', alignItems: 'center', gap: '12px', padding: '10px 0', borderTop: '1px solid #E2E8F0' }}>
                                                            <div>
                                                                <p style={{ margin: 0, color: '#0F172A', fontSize: '13px', fontWeight: '800', overflowWrap: 'anywhere' }}>{document.file_name}</p>
                                                                <p style={{ margin: '4px 0 0 0', color: '#94A3B8', fontSize: '12px' }}>{formatBytes(document.file_size)}</p>
                                                            </div>
                                                            <span style={{ color: '#475569', fontSize: '13px' }}>{document.document_type || '-'}</span>
                                                            <span style={{ color: '#475569', fontSize: '13px' }}>{formatDate(document.submitted_at)}</span>
                                                            <span style={{ width: 'fit-content', borderRadius: '999px', padding: '5px 10px', fontSize: '12px', fontWeight: '800', color: documentMeta.color, background: documentMeta.background }}>{documentMeta.label}</span>
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                <button onClick={() => loadPreview(document)} style={{ ...softBlueButtonStyle, padding: '7px 10px' }}>Preview</button>
                                                                {formattedVersion && <button type="button" onClick={() => downloadFormattedVersion(formattedVersion)} aria-label={`Download formatted version of ${document.file_name}`} title="Download formatted document" style={{ ...softBlueButtonStyle, width: '32px', height: '32px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg></button>}
                                                                <button onClick={() => handleDeleteDocument(document)} disabled={!canDelete} style={{ border: '1px solid #FECACA', background: canDelete ? '#FEF2F2' : '#F8FAFC', color: canDelete ? '#B91C1C' : '#94A3B8', borderRadius: '6px', padding: '7px 10px', cursor: canDelete ? 'pointer' : 'not-allowed', fontWeight: '800', fontSize: '12px' }}>Delete</button>
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

            {paymentsOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="payments-title"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setPaymentsOpen(false);
                    }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.62)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
                >
                    <div style={{ width: 'min(1080px, calc(100vw - 48px))', maxHeight: '92vh', overflowY: 'auto', background: '#FFFFFF', borderRadius: '8px', padding: '28px 32px', boxSizing: 'border-box', boxShadow: '0 24px 60px rgba(15,23,42,0.24)', fontFamily: 'inherit' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '24px' }}>
                            <div>
                                <h2 id="payments-title" style={{ margin: '0 0 6px 0', color: '#0F172A', fontSize: '22px', lineHeight: 1.2 }}>Payments & Subscriptions</h2>
                                <p style={{ margin: 0, color: '#64748B', fontSize: '14px', lineHeight: 1.5 }}>Manage clearance credits, review transactions, and compare plans.</p>
                            </div>
                            <button type="button" aria-label="Close payments and subscriptions" onClick={() => setPaymentsOpen(false)} style={modalCloseButtonStyle}>&times;</button>
                        </div>

                        <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', padding: '20px 22px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', marginBottom: '26px', flexWrap: 'wrap' }}>
                            <div>
                                <p style={{ margin: '0 0 7px 0', color: '#64748B', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase' }}>Clearances</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#0F172A' }}>
                                    <CreditsIcon size={28} />
                                    <p style={{ margin: 0, fontSize: '34px', lineHeight: 1, fontWeight: '800' }}>{clearanceDisplay}</p>
                                    {currentPlan?.plan_type !== 'trial' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: '4px', padding: '6px 10px', border: '1px solid #CBD5E1', borderRadius: '999px', background: '#FFFFFF', color: '#475569', fontSize: '12px', fontWeight: '800', whiteSpace: 'nowrap' }}><PlanIcon planType={currentPlan?.plan_type} size={14} />{planName} Account</span>}
                                </div>
                                {currentPlan?.expires_at && <p style={{ margin: '8px 0 0', color: '#64748B', fontSize: '12px' }}>Valid until {new Date(currentPlan.expires_at).toLocaleDateString('en-IN')}</p>}
                            </div>
                            <button type="button" onClick={() => setPaymentInstructionsOpen(true)} style={{ border: 'none', background: '#49A8D8', color: '#FFFFFF', borderRadius: '8px', padding: '11px 18px', cursor: 'pointer', fontWeight: '800', fontFamily: 'inherit' }}>
                                Payment Instructions
                            </button>
                        </section>

                        <section style={{ marginBottom: '28px' }}>
                            <h3 style={{ margin: '0 0 14px 0', color: '#0F172A', fontSize: '16px' }}>Pricing</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '14px' }}>
                                {pricingPlans.map((plan) => (
                                    <div key={plan.name} style={{ position: 'relative', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px', background: '#FFFFFF', minWidth: 0 }}>
                                        <h4 style={{ margin: '0 0 8px 0', color: '#0F172A', fontSize: '17px' }}>{plan.name}</h4>
                                        <p style={{ margin: '0 0 15px 0', color: '#64748B', fontSize: '12px', lineHeight: 1.5, minHeight: '36px' }}>{plan.desc}</p>
                                        <div style={{ marginBottom: '16px' }}>
                                            <strong style={{ color: '#0F172A', fontSize: '24px' }}>{plan.price}</strong>
                                            <span style={{ color: '#64748B', fontSize: '11px' }}>{plan.period}</span>
                                        </div>
                                        <ul style={{ display: 'grid', gap: '8px', listStyle: 'none', padding: 0, margin: 0, color: '#475569', fontSize: '12px' }}>
                                            {plan.features.map((feature) => (
                                                <li key={feature} style={{ display: 'flex', gap: '7px', lineHeight: 1.4 }}>
                                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#49A8D8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: '0 0 15px', marginTop: '1px' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h5" /></svg>
                                                    <span>{feature}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section>
                            <h3 style={{ margin: '0 0 12px 0', color: '#0F172A', fontSize: '16px' }}>Transactions</h3>
                            <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflowX: 'auto' }}>
                                <div style={{ minWidth: '680px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 0.7fr 0.9fr 0.8fr', gap: '14px', padding: '11px 16px', background: '#F8FAFC', color: '#475569', fontSize: '12px', fontWeight: '800' }}>
                                        <span>Date</span>
                                        <span>Description</span>
                                        <span>Credits</span>
                                        <span>Amount</span>
                                        <span>Status</span>
                                    </div>
                                    {loadingTransactions ? (
                                        <div style={{ padding: '28px 16px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>Loading transactions...</div>
                                    ) : transactions.length === 0 ? (
                                        <div style={{ padding: '28px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No transactions yet.</div>
                                    ) : (
                                        transactions.map((transaction) => (
                                            <div key={transaction.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 0.7fr 0.9fr 0.8fr', gap: '14px', padding: '12px 16px', borderTop: '1px solid #E2E8F0', alignItems: 'center', color: '#475569', fontSize: '13px' }}>
                                                <span>{formatDate(transaction.created_at)}</span>
                                                <span>{formatTransactionDescription(transaction)}</span>
                                                <strong style={{ color: transaction.credits >= 0 ? '#15803D' : '#B91C1C' }}>{transaction.credits >= 0 ? '+' : ''}{transaction.credits}</strong>
                                                <span>{transaction.amount == null ? '-' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: transaction.currency || 'INR' }).format(transaction.amount)}</span>
                                                <span style={{ width: 'fit-content', padding: '4px 8px', borderRadius: '999px', background: transaction.status === 'completed' ? '#DCFCE7' : '#FEF3C7', color: transaction.status === 'completed' ? '#166534' : '#92400E', fontSize: '11px', fontWeight: '800', textTransform: 'capitalize' }}>{transaction.status}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </section>

                        <section style={{ marginTop: '24px' }}>
                            <h3 style={{ margin: '0 0 12px', color: '#0F172A', fontSize: '16px' }}>Invoices</h3>
                            <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr .7fr', gap: '12px', padding: '11px 16px', background: '#F8FAFC', color: '#475569', fontSize: '12px', fontWeight: '800' }}><span>Invoice</span><span>Date</span><span>Download</span></div>
                                {customerInvoices.length === 0 ? <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No invoices uploaded yet.</div> : customerInvoices.map((invoice) => <div key={invoice.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr .7fr', gap: '12px', padding: '12px 16px', borderTop: '1px solid #E2E8F0', alignItems: 'center', color: '#475569', fontSize: '13px' }}><strong>{invoice.invoice_number}</strong><span>{formatDate(invoice.created_at)}</span><button type="button" onClick={() => openUploadedInvoice(invoice)} style={{ width: 'fit-content', border: '1px solid rgba(73,168,216,.32)', background: 'rgba(73,168,216,.1)', color: '#2789B8', borderRadius: '6px', padding: '6px 9px', fontWeight: '800' }}>Download</button></div>)}
                            </div>
                        </section>

                    </div>
                </div>
            )}

            <DashboardHowItWorksModal isOpen={howItWorksOpen} onClose={() => setHowItWorksOpen(false)} />
            <ReportIssueModal isOpen={reportIssueOpen} onClose={() => setReportIssueOpen(false)} session={session} profile={userProfile} />

            {contactOpen && (
                <div role="dialog" aria-modal="true" aria-labelledby="contact-support-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setContactOpen(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.62)', zIndex: 650, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    <div style={{ width: 'min(500px, calc(100vw - 48px))', background: '#FFFFFF', borderRadius: '8px', padding: '28px 30px', boxSizing: 'border-box', boxShadow: '0 24px 60px rgba(15,23,42,0.24)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '22px' }}>
                            <div>
                                <h2 id="contact-support-title" style={{ margin: '0 0 6px', color: '#0F172A', fontSize: '21px' }}>Contact Customer Support</h2>
                                <p style={{ margin: 0, color: '#64748B', fontSize: '13px', lineHeight: 1.5 }}>Reach our support team using the details below.</p>
                            </div>
                            <button type="button" aria-label="Close contact support" onClick={() => setContactOpen(false)} style={modalCloseButtonStyle}>&times;</button>
                        </div>
                        <div style={{ display: 'grid', gap: '12px' }}>
                            <div style={{ padding: '15px 16px', border: '1px solid #E2E8F0', borderRadius: '8px', background: '#F8FAFC' }}>
                                <p style={{ margin: '0 0 5px', color: '#64748B', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' }}>Customer Support Number</p>
                                <a href="tel:+919000000000" style={{ color: '#0F172A', fontSize: '15px', fontWeight: '800', textDecoration: 'none' }}>+91 90000 00000</a>
                            </div>
                            <div style={{ padding: '15px 16px', border: '1px solid #E2E8F0', borderRadius: '8px', background: '#F8FAFC' }}>
                                <p style={{ margin: '0 0 5px', color: '#64748B', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' }}>Support Email</p>
                                <a href="mailto:support@docuchq.example" style={{ color: '#2789B8', fontSize: '15px', fontWeight: '800', textDecoration: 'none', overflowWrap: 'anywhere' }}>support@docuchq.example</a>
                            </div>
                        </div>
                        <p style={{ margin: '14px 0 0', color: '#A16207', fontSize: '11px', fontWeight: '700' }}>Placeholder contact details for layout preview only.</p>
                    </div>
                </div>
            )}

            {editProfileOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="edit-profile-title"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setEditProfileOpen(false);
                    }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.62)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
                >
                    <form onSubmit={handleProfileSubmit} style={{ width: 'min(620px, calc(100vw - 48px))', maxHeight: '92vh', overflowY: 'auto', background: '#FFFFFF', borderRadius: '8px', padding: '28px 32px', boxSizing: 'border-box', boxShadow: '0 24px 60px rgba(15,23,42,0.24)', fontFamily: 'inherit' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '24px' }}>
                            <div>
                                <h2 id="edit-profile-title" style={{ margin: '0 0 6px 0', color: '#0F172A', fontSize: '22px', lineHeight: 1.2 }}>Edit Profile</h2>
                                <p style={{ margin: 0, color: '#64748B', fontSize: '14px', lineHeight: 1.5 }}>Update your exporter account details.</p>
                            </div>
                            <button type="button" aria-label="Close edit profile" onClick={() => setEditProfileOpen(false)} style={modalCloseButtonStyle}>&times;</button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '18px' }}>
                            <div>
                                <label style={labelStyle}>First Name *</label>
                                <input required value={editProfileForm.firstName} onChange={(event) => setEditProfileForm((current) => ({ ...current, firstName: event.target.value }))} autoComplete="given-name" style={fieldStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Last Name *</label>
                                <input required value={editProfileForm.lastName} onChange={(event) => setEditProfileForm((current) => ({ ...current, lastName: event.target.value }))} autoComplete="family-name" style={fieldStyle} />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>Company Name *</label>
                                <input required value={editProfileForm.companyName} onChange={(event) => setEditProfileForm((current) => ({ ...current, companyName: event.target.value }))} autoComplete="organization" style={fieldStyle} />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>IEC</label>
                                <input
                                    value={editProfileForm.iec}
                                    readOnly
                                    aria-readonly="true"
                                    placeholder="Not recorded"
                                    style={{ ...disabledFieldStyle, cursor: 'default' }}
                                />
                                <p style={{ margin: '7px 0 0 0', color: '#64748B', fontSize: '12px', lineHeight: 1.5 }}>IEC is permanently linked to this account and cannot be changed.</p>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>Address</label>
                                <textarea
                                    value={editProfileForm.address}
                                    onChange={(event) => setEditProfileForm((current) => ({ ...current, address: event.target.value }))}
                                    autoComplete="street-address"
                                    rows="3"
                                    placeholder="Registered or business address"
                                    style={{ ...fieldStyle, height: '88px', resize: 'vertical', paddingTop: '12px', fontFamily: 'inherit' }}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>GSTIN</label>
                                <input
                                    value={editProfileForm.gstin}
                                    onChange={(event) => setEditProfileForm((current) => ({ ...current, gstin: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15) }))}
                                    autoComplete="off"
                                    placeholder="22AAAAA0000A1Z5"
                                    maxLength="15"
                                    style={fieldStyle}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>PAN</label>
                                <input
                                    value={editProfileForm.pan}
                                    onChange={(event) => setEditProfileForm((current) => ({ ...current, pan: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) }))}
                                    autoComplete="off"
                                    placeholder="AAAAA0000A"
                                    maxLength="10"
                                    style={fieldStyle}
                                />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>Mobile Number</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: '10px' }}>
                                    <input type="text" value="+91" readOnly aria-label="India country code" style={{ ...fieldStyle, textAlign: 'center', fontWeight: '800', color: '#475569', background: '#F1F5F9', cursor: 'default' }} />
                                    <input
                                        type="tel"
                                        inputMode="numeric"
                                        pattern="[0-9]{10}"
                                        maxLength="10"
                                        value={editProfileForm.mobileNumber}
                                        onChange={(event) => setEditProfileForm((current) => ({ ...current, mobileNumber: event.target.value.replace(/\D/g, '').slice(0, 10) }))}
                                        autoComplete="tel-national"
                                        placeholder="9876543210"
                                        aria-label="10-digit mobile number"
                                        style={fieldStyle}
                                    />
                                </div>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>Email Address *</label>
                                <input type="email" required value={editProfileForm.email} onChange={(event) => setEditProfileForm((current) => ({ ...current, email: event.target.value }))} autoComplete="email" style={fieldStyle} />
                                <p style={{ margin: '7px 0 0 0', color: '#64748B', fontSize: '12px', lineHeight: 1.5 }}>Changing your email sends a verification link. The current email remains active until the new address is verified.</p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '26px', flexWrap: 'wrap' }}>
                            <button type="button" disabled={savingProfile} onClick={() => { setDeleteAccountPassword(''); setDeleteAccountOpen(true); }} style={{ border: 'none', background: 'transparent', color: '#2789B8', padding: '7px 2px', cursor: 'pointer', fontWeight: '700', fontSize: '12px', fontFamily: 'inherit' }}>Delete account</button>
                            <div style={{ display: 'flex', gap: '12px' }}>
                            <button type="button" disabled={savingProfile} onClick={() => setEditProfileOpen(false)} style={{ border: '1px solid #D7E4E0', background: '#FFFFFF', color: '#334155', borderRadius: '8px', padding: '11px 18px', cursor: savingProfile ? 'not-allowed' : 'pointer', fontWeight: '800', fontFamily: 'inherit' }}>Cancel</button>
                            <button type="submit" disabled={savingProfile} style={{ border: 'none', background: '#49A8D8', color: '#FFFFFF', borderRadius: '8px', padding: '11px 20px', cursor: savingProfile ? 'not-allowed' : 'pointer', fontWeight: '800', fontFamily: 'inherit', opacity: savingProfile ? 0.7 : 1 }}>
                                {savingProfile ? 'Saving...' : 'Save Changes'}
                            </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {deleteAccountOpen && (
                <div role="dialog" aria-modal="true" aria-labelledby="delete-account-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingAccount) setDeleteAccountOpen(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.68)', zIndex: 760, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    <form onSubmit={requestAccountDeletion} style={{ width: 'min(500px, calc(100vw - 48px))', background: '#FFFFFF', borderRadius: '8px', padding: '28px 30px', boxSizing: 'border-box', boxShadow: '0 24px 60px rgba(15,23,42,0.28)' }}>
                        <h2 id="delete-account-title" style={{ margin: '0 0 8px', color: '#991B1B', fontSize: '21px' }}>Delete Account?</h2>
                        <p style={{ margin: '0 0 12px', color: '#475569', fontSize: '14px', lineHeight: 1.6 }}>Your account and its data cannot be recovered after permanent deletion. You have 14 days to sign in and restore the account. After that period, deletion becomes permanent.</p>
                        <p style={{ margin: '0 0 20px', color: '#64748B', fontSize: '12px', lineHeight: 1.55 }}>Your IEC trial-redemption record will be retained for one year to prevent another free clearance being claimed with the same IEC.</p>
                        <label style={labelStyle}>Profile Password *</label>
                        <input type="password" required autoComplete="current-password" value={deleteAccountPassword} onChange={(event) => setDeleteAccountPassword(event.target.value)} placeholder="Enter your password to confirm" style={fieldStyle} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
                            <button type="button" disabled={deletingAccount} onClick={() => setDeleteAccountOpen(false)} style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', borderRadius: '8px', padding: '10px 16px', fontWeight: '800' }}>Cancel</button>
                            <button type="submit" disabled={deletingAccount || !deleteAccountPassword} style={{ border: 'none', background: '#49A8D8', color: '#FFFFFF', borderRadius: '8px', padding: '10px 16px', fontWeight: '800', opacity: deletingAccount || !deleteAccountPassword ? 0.65 : 1 }}>{deletingAccount ? 'Scheduling...' : 'Delete Account'}</button>
                        </div>
                    </form>
                </div>
            )}

            {clearanceModalOpen && (
                <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.62)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    <form onSubmit={handleCreateClearance} style={{ width: 'min(760px, calc(100vw - 48px))', maxHeight: '92vh', overflow: 'auto', background: '#FFFFFF', borderRadius: '8px', padding: '30px 34px', boxSizing: 'border-box', boxShadow: '0 24px 60px rgba(15,23,42,0.24)', fontFamily: 'inherit' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                            <div>
                                <h2 style={{ margin: '0 0 6px 0', color: '#0F2D27', fontSize: '24px', lineHeight: '1.2' }}>Create Clearance</h2>
                                <p style={{ margin: 0, color: '#2789B8', fontSize: '15px', lineHeight: '1.4' }}>Create a clearance track before adding documents.</p>
                            </div>
                            <button type="button" onClick={() => setClearanceModalOpen(false)} style={modalCloseButtonStyle}>&times;</button>
                        </div>

                        <div style={clearanceFieldsStackStyle}>
                            <div style={clearanceFieldRowStyle}>
                                <div style={clearanceFieldColumnStyle}>
                                    <label style={clearanceLabelStyle}>Customer Name *</label>
                                    <input required value={clearanceForm.customerName} onChange={(event) => setClearanceForm((current) => ({ ...current, customerName: event.target.value }))} placeholder="e.g., TechCorp" style={fieldStyle} />
                                </div>
                                <div style={clearanceFieldColumnStyle}>
                                    <label style={clearanceLabelStyle}>Reference Number *</label>
                                    <input required value={clearanceForm.referenceId} onChange={(event) => setClearanceForm((current) => ({ ...current, referenceId: event.target.value }))} placeholder="e.g., INV-2023-001" style={fieldStyle} />
                                </div>
                            </div>

                            <div style={clearanceFieldRowStyle}>
                                <div style={clearanceFieldColumnStyle}>
                                    <label style={clearanceLabelStyle}>Destination Country *</label>
                                    <select required value={clearanceForm.destinationCountry} onChange={(event) => setClearanceForm((current) => ({ ...current, destinationCountry: event.target.value }))} style={selectFieldStyle}>
                                        <option value="">Select country...</option>
                                        {countries.map((country) => (
                                            <option key={country} value={country}>{country}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={clearanceFieldColumnStyle}>
                                    <label style={clearanceLabelStyle}>Currency *</label>
                                    <select required value={clearanceForm.invoiceCurrency} onChange={(event) => setClearanceForm((current) => ({ ...current, invoiceCurrency: event.target.value }))} style={selectFieldStyle}>
                                        {currencies.map((currency) => (
                                            <option key={currency} value={currency}>{currency}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div style={clearanceFieldRowStyle}>
                                <div style={clearanceFieldColumnStyle}>
                                    <label style={clearanceLabelStyle}>AD Bank Name *</label>
                                    <select required value={clearanceForm.adBankName} onChange={(event) => setClearanceForm((current) => ({ ...current, adBankName: event.target.value }))} style={selectFieldStyle}>
                                        <option value="">Select AD bank...</option>
                                        {adBanks.map((bank) => (
                                            <option key={bank} value={bank}>{bank}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={clearanceFieldColumnStyle}>
                                    <label style={clearanceLabelStyle}>Payment Method *</label>
                                    <select required value={clearanceForm.paymentMethod} onChange={(event) => setClearanceForm((current) => ({ ...current, paymentMethod: event.target.value }))} style={selectFieldStyle}>
                                        {paymentMethods.map((method) => (
                                            <option key={method} value={method}>{method}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <section style={{ marginTop: '22px', padding: '18px', border: '1px solid #D7E4E0', borderRadius: '8px', background: '#F8FAFC' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: '12px' }}>
                                <div>
                                    <h3 style={{ margin: '0 0 4px', color: '#0F2D27', fontSize: '15px' }}>Documents</h3>
                                    <p style={{ margin: 0, color: '#64748B', fontSize: '12px' }}>Add multiple documents now. Titles and document types are not required.</p>
                                </div>
                                <strong style={{ color: clearanceFiles.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024 ? '#B91C1C' : '#2789B8', fontSize: '12px' }}>
                                    {(clearanceFiles.reduce((total, file) => total + file.size, 0) / (1024 * 1024)).toFixed(2)} / 20 MB
                                </strong>
                            </div>
                            <input
                                type="file"
                                multiple
                                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                                onChange={(event) => {
                                    const selectedFiles = Array.from(event.target.files || []);
                                    const combined = [...clearanceFiles, ...selectedFiles];
                                    if (combined.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) {
                                        showToast('The combined file size must not exceed 20 MB.', 'error');
                                        event.target.value = '';
                                        return;
                                    }
                                    setClearanceFiles(combined);
                                    event.target.value = '';
                                }}
                                style={{ width: '100%', border: '1px dashed #94A3B8', borderRadius: '8px', padding: '14px', boxSizing: 'border-box', background: '#FFFFFF', color: '#475569' }}
                            />
                            {clearanceFiles.length > 0 && (
                                <div style={{ display: 'grid', gap: '7px', marginTop: '12px' }}>
                                    {clearanceFiles.map((file, index) => (
                                        <div key={`${file.name}-${file.size}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: '6px', background: '#FFFFFF' }}>
                                            <span style={{ minWidth: 0, color: '#334155', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name} ({formatBytes(file.size)})</span>
                                            <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setClearanceFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))} style={{ border: 'none', background: 'transparent', color: '#B91C1C', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>&times;</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '14px', marginTop: '24px' }}>
                            <button type="button" onClick={() => setClearanceModalOpen(false)} style={{ border: '1px solid #D7E4E0', background: '#FFFFFF', color: '#0F2D27', borderRadius: '8px', padding: '12px 20px', cursor: 'pointer', fontWeight: '800', fontFamily: 'inherit' }}>Cancel</button>
                            <button type="submit" disabled={creatingClearance} style={{ border: 'none', background: '#49A8D8', color: '#FFFFFF', borderRadius: '8px', padding: '12px 22px', cursor: creatingClearance ? 'not-allowed' : 'pointer', fontWeight: '800', fontFamily: 'inherit', opacity: creatingClearance ? 0.7 : 1 }}>{creatingClearance ? 'Creating...' : 'Create Clearance'}</button>
                        </div>
                    </form>
                </div>
            )}

            {uploadModalOpen && (
                <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.62)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    <form onSubmit={handleUploadSubmit} style={{ width: 'min(900px, calc(100vw - 48px))', maxHeight: '92vh', overflow: 'auto', background: '#FFFFFF', borderRadius: '8px', padding: '30px 34px', boxSizing: 'border-box', boxShadow: '0 24px 60px rgba(15,23,42,0.24)', fontFamily: 'inherit' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                            <div>
                                <h2 style={{ margin: '0 0 6px 0', color: '#0F2D27', fontSize: '24px', lineHeight: '1.2' }}>Upload Document</h2>
                                <p style={{ margin: 0, color: '#2789B8', fontSize: '15px', lineHeight: '1.4' }}>Submit a document for compliance review.</p>
                            </div>
                            <button type="button" onClick={() => setUploadModalOpen(false)} style={modalCloseButtonStyle}>&times;</button>
                        </div>

                        <div style={uploadGridStyle}>
                            <div style={uploadFullSpan}>
                                <label style={labelStyle}>Document Type *</label>
                                <select value={uploadForm.documentType} onChange={(event) => setUploadForm((current) => ({ ...current, documentType: event.target.value }))} style={selectFieldStyle}>
                                    {documentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                                </select>
                            </div>

                            <div style={uploadFullSpan}>
                                <label style={labelStyle}>Notes</label>
                                <textarea value={uploadForm.notes} onChange={(event) => setUploadForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Any additional context for the compliance reviewer..." rows="4" style={{ ...fieldStyle, height: '100px', paddingTop: '12px', resize: 'vertical', fontFamily: 'inherit' }} />
                            </div>

                            <div style={uploadFullSpan}>
                                <label style={labelStyle}>File *</label>
                                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '150px', border: '2px dashed rgba(73, 168, 216, 0.42)', borderRadius: '10px', cursor: 'pointer', color: '#0F2D27', background: 'rgba(73, 168, 216, 0.04)', textAlign: 'center', fontFamily: 'inherit' }}>
                                    <input
                                        type="file"
                                        onChange={(event) => {
                                            const file = event.target.files?.[0] || null;
                                            if (file && file.size > MAX_UPLOAD_SIZE_BYTES) {
                                                showToast('File size must not exceed 5 MB.', 'error');
                                                event.target.value = '';
                                                setUploadForm((current) => ({ ...current, file: null }));
                                                return;
                                            }
                                            setUploadForm((current) => ({ ...current, file }));
                                        }}
                                        required
                                        style={{ display: 'none' }}
                                    />
                                    <span style={{ fontSize: '16px', fontWeight: '800' }}>{uploadForm.file ? uploadForm.file.name : 'Click to browse or drag and drop'}</span>
                                    <span style={{ marginTop: '8px', color: '#557D71', fontSize: '14px' }}>PDF, JPEG, PNG, Excel or Word · Maximum 5 MB</span>
                                </label>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '14px', marginTop: '24px' }}>
                            <button type="button" onClick={() => setUploadModalOpen(false)} style={{ border: '1px solid #D7E4E0', background: '#FFFFFF', color: '#0F2D27', borderRadius: '8px', padding: '12px 20px', cursor: 'pointer', fontWeight: '800', fontFamily: 'inherit' }}>Cancel</button>
                            <button type="submit" disabled={uploading} style={{ border: 'none', background: '#49A8D8', color: '#FFFFFF', borderRadius: '8px', padding: '12px 22px', cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: '800', fontFamily: 'inherit', opacity: uploading ? 0.7 : 1 }}>{uploading ? 'Uploading...' : 'Upload Document'}</button>
                        </div>
                    </form>
                </div>
            )}

            {paymentInstructionsOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="payment-instructions-title"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setPaymentInstructionsOpen(false);
                    }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.68)', zIndex: 720, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
                >
                    <div style={{ width: 'min(820px, calc(100vw - 48px))', maxHeight: '92vh', overflowY: 'auto', background: '#FFFFFF', borderRadius: '8px', padding: '28px 30px', boxSizing: 'border-box', boxShadow: '0 24px 60px rgba(15,23,42,0.28)', fontFamily: 'inherit' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '22px' }}>
                            <div>
                                <h2 id="payment-instructions-title" style={{ margin: '0 0 6px', color: '#0F172A', fontSize: '22px' }}>Payment Instructions</h2>
                                <p style={{ margin: 0, color: '#64748B', fontSize: '13px' }}>Use either bank transfer or UPI to complete the payment.</p>
                            </div>
                            <button type="button" aria-label="Close payment instructions" onClick={() => setPaymentInstructionsOpen(false)} style={modalCloseButtonStyle}>&times;</button>
                        </div>

                        <div style={{ padding: '9px 12px', marginBottom: '20px', border: '1px solid #FDE68A', borderRadius: '6px', background: '#FFFBEB', color: '#92400E', fontSize: '12px', fontWeight: '700' }}>
                            Placeholder payment details for layout preview only. Do not transfer funds using these details.
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                            <section style={{ padding: '22px', background: '#FFFFFF' }}>
                                <h3 style={{ margin: '0 0 18px', color: '#0F172A', fontSize: '16px' }}>Bank Transfer</h3>
                                {[
                                    ['Beneficiary Name', 'DocuCHQ Services LLP'],
                                    ['Account Number', '000000000000'],
                                    ['IFSC', 'ABCD0000123'],
                                    ['Account Type', 'Current Account']
                                ].map(([label, value]) => (
                                    <div key={label} style={{ padding: '11px 0', borderTop: '1px solid #EEF2F7' }}>
                                        <p style={{ margin: '0 0 4px', color: '#64748B', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' }}>{label}</p>
                                        <p style={{ margin: 0, color: '#0F172A', fontSize: '14px', fontWeight: '700', overflowWrap: 'anywhere' }}>{value}</p>
                                    </div>
                                ))}
                            </section>

                            <section style={{ padding: '22px', background: '#F8FAFC', borderLeft: '1px solid #E2E8F0', textAlign: 'center' }}>
                                <h3 style={{ margin: '0 0 8px', color: '#0F172A', fontSize: '16px' }}>UPI Payment</h3>
                                <p style={{ margin: '0 0 16px', color: '#475569', fontSize: '14px', fontWeight: '800' }}>docuchq@placeholder</p>
                                <div aria-label="Placeholder QR code" style={{ width: '184px', height: '184px', margin: '0 auto', padding: '12px', boxSizing: 'border-box', border: '1px solid #CBD5E1', background: '#FFFFFF', display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gridTemplateRows: 'repeat(9, 1fr)', gap: '2px' }}>
                                    {Array.from({ length: 81 }, (_, index) => {
                                        const row = Math.floor(index / 9);
                                        const column = index % 9;
                                        const finder = (row < 3 && column < 3) || (row < 3 && column > 5) || (row > 5 && column < 3);
                                        const pattern = (index * 7 + row * 3 + column) % 5 < 2;
                                        return <span key={index} style={{ background: finder || pattern ? '#0F172A' : '#FFFFFF' }} />;
                                    })}
                                </div>
                                <p style={{ margin: '12px 0 0', color: '#94A3B8', fontSize: '11px', fontWeight: '700' }}>QR CODE PLACEHOLDER</p>
                            </section>
                        </div>

                        <div style={{ marginTop: '20px', padding: '16px 18px', border: '1px solid rgba(73, 168, 216, 0.3)', borderRadius: '8px', background: 'rgba(73, 168, 216, 0.08)', color: '#334155', fontSize: '13px', lineHeight: 1.6 }}>
                            After payment, send the payment screenshot and your registered company name to <strong>payments@docuchq.example</strong> or WhatsApp <strong>+91 90000 00000</strong>. Your plan will be activated after payment verification.
                        </div>
                    </div>
                </div>
            )}

            {deleteTrackTarget && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="exporter-delete-track-title"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) closeDeleteTrackModal();
                    }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.62)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
                >
                    <form onSubmit={confirmDeleteTrack} style={{ width: 'min(480px, calc(100vw - 48px))', background: '#FFFFFF', borderRadius: '8px', padding: '28px 30px', boxSizing: 'border-box', boxShadow: '0 24px 60px rgba(15,23,42,0.24)' }}>
                        <h2 id="exporter-delete-track-title" style={{ margin: '0 0 8px 0', color: '#0F172A', fontSize: '21px' }}>Delete Track?</h2>
                        <p style={{ margin: '0 0 20px 0', color: '#64748B', fontSize: '14px', lineHeight: 1.6 }}>
                            This permanently deletes track <strong style={{ color: '#334155' }}>{deleteTrackTarget.referenceId}</strong> and all {deleteTrackTarget.documents.length} associated file record{deleteTrackTarget.documents.length === 1 ? '' : 's'} and upload{deleteTrackTarget.documents.length === 1 ? '' : 's'}.
                        </p>
                        <label style={{ display: 'block', marginBottom: '7px', color: '#334155', fontSize: '13px', fontWeight: '800' }}>Profile Password</label>
                        <input
                            type="password"
                            required
                            autoComplete="current-password"
                            value={deleteTrackPassword}
                            onChange={(event) => setDeleteTrackPassword(event.target.value)}
                            placeholder="Enter your password to confirm"
                            style={{ width: '100%', height: '42px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 12px', boxSizing: 'border-box', color: '#0F172A', outline: 'none', margin: 0 }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                            <button type="button" disabled={Boolean(deletingTrackId)} onClick={closeDeleteTrackModal} style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', borderRadius: '8px', padding: '10px 16px', cursor: deletingTrackId ? 'not-allowed' : 'pointer', fontWeight: '800' }}>Cancel</button>
                            <button type="submit" disabled={Boolean(deletingTrackId) || !deleteTrackPassword} style={{ border: 'none', background: '#DC2626', color: '#FFFFFF', borderRadius: '8px', padding: '10px 16px', cursor: deletingTrackId || !deleteTrackPassword ? 'not-allowed' : 'pointer', fontWeight: '800', opacity: deletingTrackId || !deleteTrackPassword ? 0.65 : 1 }}>
                                {deletingTrackId ? 'Deleting...' : 'Confirm Delete'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {selectedDocument && (
                <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px' }}>
                    <div style={{ width: 'min(1120px, 100%)', height: 'min(92vh, 860px)', background: '#FFFFFF', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 24px 60px rgba(15,23,42,0.22)', display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(320px, 0.7fr)', minHeight: 0 }}>
                        <div style={{ padding: '20px', borderRight: '1px solid #E2E8F0', overflowY: 'auto', minHeight: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', marginBottom: '16px' }}>
                                <div>
                                    <h2 style={{ margin: 0, color: '#0F172A', fontSize: '20px' }}>{selectedDocument.title}</h2>
                                    <p style={{ margin: '5px 0 0 0', color: '#64748B', fontSize: '13px' }}>{selectedDocument.reference_id} - {selectedDocument.file_name}</p>
                                </div>
                                <button onClick={() => setSelectedDocument(null)} style={{ border: '1px solid #E2E8F0', background: '#fff', borderRadius: '6px', cursor: 'pointer', padding: '7px 10px', fontWeight: '700', color: '#334155' }}>Close</button>
                            </div>
                            {(() => {
                                const formattedVersion = formattedVersions.find((version) => version.document_id === selectedDocument.id);
                                return (
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
                                        <button type="button" onClick={() => switchPreviewFile(selectedDocument)} style={{ ...softBlueButtonStyle, padding: '7px 10px', background: previewingFile?.id === selectedDocument.id ? 'rgba(73,168,216,.18)' : '#FFFFFF' }}>Original</button>
                                        {formattedVersion && <button type="button" onClick={() => switchPreviewFile(formattedVersion)} style={{ ...softBlueButtonStyle, padding: '7px 10px', background: previewingFile?.id === formattedVersion.id ? 'rgba(73,168,216,.18)' : '#FFFFFF' }}>Formatted</button>}
                                        {formattedVersion && <button type="button" onClick={() => downloadFormattedVersion(formattedVersion)} style={{ ...softBlueButtonStyle, padding: '7px 10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>Download Formatted</button>}
                                    </div>
                                );
                            })()}
                            <DocumentPreviewViewer
                                loading={modalLoading}
                                previewUrl={previewUrl}
                                mimeType={previewingFile?.mime_type || selectedDocument.mime_type}
                                title={previewingFile?.file_name || selectedDocument.file_name}
                            />
                        </div>

                        <aside style={{ padding: '20px', overflowY: 'auto', background: '#FFFFFF', minHeight: 0 }}>
                            <h3 style={{ margin: '0 0 12px 0', color: '#0F172A', fontSize: '16px' }}>Status History</h3>
                            <div style={{ display: 'grid', gap: '8px', marginBottom: '18px' }}>
                                {statusHistory.length === 0 ? (
                                    <p style={{ color: '#94A3B8', fontSize: '13px', margin: 0 }}>No status changes yet.</p>
                                ) : (
                                    statusHistory.map((history) => (
                                        <div key={history.id} style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '9px', background: '#F8FAFC' }}>
                                            <p style={{ margin: 0, color: '#334155', fontSize: '12px', fontWeight: '800' }}>{statusMeta[history.new_status]?.label || history.new_status}</p>
                                            <p style={{ margin: '3px 0 0 0', color: '#64748B', fontSize: '11px', fontWeight: '700' }}>{formatDateTimeIST(history.created_at)}</p>
                                            {history.reason && <p style={{ margin: '4px 0 0 0', color: '#64748B', fontSize: '12px' }}>{history.reason}</p>}
                                        </div>
                                    ))
                                )}
                            </div>

                            <h3 style={{ margin: '0 0 14px 0', color: '#0F172A', fontSize: '16px' }}>Comments</h3>
                            <div style={{ display: 'grid', gap: '12px', marginBottom: '16px' }}>
                                {comments.length === 0 ? (
                                    <p style={{ color: '#94A3B8', fontSize: '13px', margin: 0 }}>No comments yet.</p>
                                ) : (
                                    comments.map((comment) => (
                                        <div key={comment.id} style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px', background: comment.author_id === userId ? '#EFF6FF' : '#F8FAFC' }}>
                                            <p style={{ margin: '0 0 5px 0', color: '#334155', fontSize: '12px', fontWeight: '800' }}>{comment.author_id === userId ? 'You' : 'Verifier'} - {formatDate(comment.created_at)}</p>
                                            <p style={{ margin: 0, color: '#0F172A', fontSize: '13px', lineHeight: 1.5 }}>{comment.comment}</p>
                                        </div>
                                    ))
                                )}
                            </div>

                            <form onSubmit={handleAddComment}>
                                <textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Add a comment for this document..." rows="4" style={{ width: '100%', resize: 'vertical', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '13px', color: '#0F172A', outline: 'none' }} />
                                <button type="submit" disabled={commentSubmitting || !commentText.trim()} style={{ marginTop: '10px', width: '100%', border: 'none', borderRadius: '8px', background: '#49A8D8', color: '#FFFFFF', padding: '10px 14px', fontWeight: '800', cursor: commentSubmitting || !commentText.trim() ? 'not-allowed' : 'pointer', opacity: commentSubmitting || !commentText.trim() ? 0.7 : 1 }}>
                                    {commentSubmitting ? 'Adding...' : 'Add Comment'}
                                </button>
                            </form>
                        </aside>
                    </div>
                </div>
            )}
        </div>
    );
}
