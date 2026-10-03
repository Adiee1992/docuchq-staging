import { supabase } from '../supabaseClient';
import {
    LEGAL_ACCEPTANCE_STORAGE_KEY,
    PRIVACY_DOCUMENT_HASH,
    PRIVACY_VERSION,
    TERMS_DOCUMENT_HASH,
    TERMS_VERSION
} from '../data/legalVersions';

export function buildLegalAcceptanceMetadata(signupMethod) {
    return {
        terms_accepted: true,
        privacy_accepted: true,
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
        terms_document_hash: TERMS_DOCUMENT_HASH,
        privacy_document_hash: PRIVACY_DOCUMENT_HASH,
        signup_method: signupMethod,
        legal_accepted_client_at: new Date().toISOString()
    };
}

export function storePendingLegalAcceptance(signupMethod) {
    window.localStorage.setItem(
        LEGAL_ACCEPTANCE_STORAGE_KEY,
        JSON.stringify(buildLegalAcceptanceMetadata(signupMethod))
    );
}

function getPendingLegalAcceptance() {
    try {
        return JSON.parse(window.localStorage.getItem(LEGAL_ACCEPTANCE_STORAGE_KEY) || 'null');
    } catch {
        return null;
    }
}

export async function recordLegalAcceptance(user, fallbackMethod = 'password') {
    if (!user) return;

    const metadata = user.user_metadata || {};
    const pendingAcceptance = getPendingLegalAcceptance();
    const source = pendingAcceptance?.terms_accepted && pendingAcceptance?.privacy_accepted
        ? pendingAcceptance
        : metadata;

    if (!source?.terms_accepted || !source?.privacy_accepted) return;
    if (source.terms_version !== TERMS_VERSION || source.privacy_version !== PRIVACY_VERSION) return;
    if (source.terms_document_hash !== TERMS_DOCUMENT_HASH || source.privacy_document_hash !== PRIVACY_DOCUMENT_HASH) return;

    const signupMethod = source.signup_method || fallbackMethod;
    const { error } = await supabase.rpc('record_current_legal_acceptance', {
        signup_method_input: signupMethod,
        client_accepted_at_input: source.legal_accepted_client_at || null
    });

    if (error) throw error;
    window.localStorage.removeItem(LEGAL_ACCEPTANCE_STORAGE_KEY);
}
