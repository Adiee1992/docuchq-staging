import { supabase } from '../supabaseClient';

export async function fetchUnreadDocumentIds() {
    const { data, error } = await supabase.rpc('get_unread_document_activity');
    if (error) throw error;
    return new Set((data || []).map((item) => item.document_id));
}

export async function markDocumentActivityRead(documentId) {
    const { error } = await supabase.rpc('mark_document_activity_read', {
        document_id_input: documentId
    });
    if (error) throw error;
}
