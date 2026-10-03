import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import { createDocumentSignedUrl } from '../utils/documentPreview';
import DocumentPreviewViewer from './DocumentPreviewViewer';

function formatDate(value) {
    if (!value) return '-';
    return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).format(new Date(value));
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

export default function InternalDocumentModal({ document, profile, mode, verifiers = [], onClose, onChanged }) {
    const { showToast } = useToast();
    const [previewUrl, setPreviewUrl] = useState('');
    const [comments, setComments] = useState([]);
    const [statusHistory, setStatusHistory] = useState([]);
    const [commentText, setCommentText] = useState('');
    const [isInternalComment, setIsInternalComment] = useState(true);
    const [statusReason, setStatusReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formattedVersions, setFormattedVersions] = useState([]);
    const [uploadingFormatted, setUploadingFormatted] = useState(false);

    useEffect(() => {
        const loadModalData = async () => {
            if (!document) return;

            setLoading(true);
            const [signedUrlResult, { data: commentData, error: commentsError }, { data: historyData, error: historyError }, { data: versionData, error: versionError }] = await Promise.all([
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
                    .order('created_at', { ascending: false }),
                supabase.from('document_formatted_versions').select('*').eq('document_id', document.id).order('created_at', { ascending: false })
            ]);
            setLoading(false);

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
            if (versionError) showToast(versionError.message, 'error');
            else setFormattedVersions(versionData || []);
        };

        loadModalData();
    }, [document, showToast]);

    if (!document) return null;

    const openVersionPreview = async (version) => {
        setLoading(true);
        try {
            setPreviewUrl(await createDocumentSignedUrl(supabase, version));
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const uploadFormattedVersion = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            showToast('Formatted file size must not exceed 5 MB.', 'error');
            return;
        }
        setUploadingFormatted(true);
        const versionId = crypto.randomUUID();
        const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_');
        const storagePath = `formatted/${profile.id}/${document.id}/${versionId}/${safeName}`;
        const { error: uploadError } = await supabase.storage.from('documents').upload(storagePath, file, { upsert: false, contentType: file.type || undefined });
        if (uploadError) {
            setUploadingFormatted(false);
            showToast(uploadError.message, 'error');
            return;
        }
        const { data, error } = await supabase.from('document_formatted_versions').insert({ id: versionId, document_id: document.id, uploaded_by: profile.id, storage_bucket: 'documents', storage_path: storagePath, file_name: file.name, file_size: file.size, mime_type: file.type || 'application/octet-stream', notes: statusReason || null }).select().single();
        setUploadingFormatted(false);
        if (error) {
            await supabase.storage.from('documents').remove([storagePath]);
            showToast(error.message, 'error');
            return;
        }
        setFormattedVersions((current) => [data, ...current]);
        showToast('Formatted document uploaded.', 'success');
        await onChanged();
    };

    const addComment = async (event) => {
        event.preventDefault();
        if (!commentText.trim()) return;

        setSubmitting(true);
        const { data, error } = await supabase
            .from('document_comments')
            .insert({
                document_id: document.id,
                author_id: profile.id,
                comment: commentText.trim(),
                is_internal: isInternalComment
            })
            .select('id, author_id, comment, is_internal, created_at')
            .single();
        setSubmitting(false);

        if (error) {
            showToast(error.message, 'error');
            return;
        }

        setComments((current) => [...current, data]);
        setCommentText('');
    };

    const updateStatus = async (newStatus) => {
        setSubmitting(true);

        const { data: persistedStatus, error: updateError } = await supabase.rpc('update_document_review_status', {
            document_id_input: document.id,
            status_input: newStatus,
            reason_input: statusReason || null
        });

        if (updateError || persistedStatus !== newStatus) {
            setSubmitting(false);
            showToast(updateError?.message || 'The document status could not be saved.', 'error');
            return;
        }

        setSubmitting(false);
        showToast('Status updated.', 'success');
        await onChanged();
        onClose();
    };

    const escalateToManager = async () => {
        if (!statusReason.trim()) {
            showToast('Add an escalation reason first.', 'error');
            return;
        }

        setSubmitting(true);

        const { error: updateError } = await supabase
            .from('documents')
            .update({
                escalated_to_manager: true,
                escalation_reason: statusReason.trim(),
                escalated_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', document.id);

        if (updateError) {
            setSubmitting(false);
            showToast(updateError.message, 'error');
            return;
        }

        await supabase.from('document_assignments').insert({
            document_id: document.id,
            assigned_from: profile.id,
            assigned_to: null,
            assigned_by: profile.id,
            assignment_type: 'escalation',
            reason: statusReason.trim()
        });

        setSubmitting(false);
        showToast('Document escalated to manager.', 'success');
        onChanged();
        onClose();
    };

    const assignVerifier = async (verifierId) => {
        if (!verifierId) return;

        setSubmitting(true);

        const { error } = await supabase
            .from('documents')
            .update({
                assigned_verifier_id: verifierId,
                assigned_manager_id: profile.id,
                assigned_at: new Date().toISOString(),
                escalated_to_manager: false,
                updated_at: new Date().toISOString()
            })
            .eq('id', document.id);

        if (error) {
            setSubmitting(false);
            showToast(error.message, 'error');
            return;
        }

        await supabase.from('document_assignments').insert({
            document_id: document.id,
            assigned_from: document.assigned_verifier_id || null,
            assigned_to: verifierId,
            assigned_by: profile.id,
            assignment_type: 'manual',
            reason: statusReason || null
        });

        setSubmitting(false);
        showToast('Document assigned.', 'success');
        onChanged();
        onClose();
    };

    return (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px' }}>
            <div style={{ width: 'min(1180px, 100%)', height: 'min(92vh, 860px)', background: '#FFFFFF', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 24px 60px rgba(15,23,42,0.22)', display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(340px, 0.75fr)', minHeight: 0 }}>
                <div style={{ padding: '20px', borderRight: '1px solid #E2E8F0', overflowY: 'auto', minHeight: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div>
                            <h2 style={{ margin: 0, color: '#0F172A', fontSize: '20px' }}>{document.title}</h2>
                            <p style={{ margin: '5px 0 0 0', color: '#64748B', fontSize: '13px' }}>{document.reference_id} · {document.file_name}</p>
                        </div>
                        <button onClick={onClose} style={{ border: '1px solid #E2E8F0', background: '#fff', borderRadius: '6px', cursor: 'pointer', padding: '7px 10px', fontWeight: '700', color: '#334155' }}>Close</button>
                    </div>

                    <DocumentPreviewViewer
                        loading={loading}
                        previewUrl={previewUrl}
                        mimeType={document.mime_type}
                        title={document.title}
                    />
                </div>

                <aside style={{ padding: '20px', overflowY: 'auto', background: '#FFFFFF', minHeight: 0 }}>
                    <h3 style={{ margin: '0 0 12px 0', color: '#0F172A', fontSize: '16px' }}>Review Actions</h3>
                    <div style={{ marginBottom: '14px', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px', background: '#F8FAFC' }}>
                        <label style={{ display: 'flex', justifyContent: 'center', padding: '9px 12px', borderRadius: '6px', background: '#49A8D8', color: '#FFFFFF', fontSize: '12px', fontWeight: '800', cursor: uploadingFormatted ? 'not-allowed' : 'pointer', opacity: uploadingFormatted ? 0.65 : 1 }}>
                            <input type="file" disabled={uploadingFormatted} onChange={uploadFormattedVersion} style={{ display: 'none' }} />
                            {uploadingFormatted ? 'Uploading...' : 'Upload Formatted Document'}
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: formattedVersions.length > 0 ? '1fr 1fr' : '1fr', gap: '8px', marginTop: '8px' }}>
                            <button type="button" onClick={() => openVersionPreview(document)} style={{ border: '1px solid rgba(73,168,216,.35)', background: '#FFFFFF', color: '#2789B8', borderRadius: '6px', padding: '8px', fontWeight: '800', cursor: 'pointer', fontSize: '12px' }}>View Original</button>
                            {formattedVersions.length > 0 && <button type="button" onClick={() => openVersionPreview(formattedVersions[0])} style={{ border: '1px solid rgba(73,168,216,.35)', background: '#FFFFFF', color: '#2789B8', borderRadius: '6px', padding: '8px', fontWeight: '800', cursor: 'pointer', fontSize: '12px' }}>View Formatted</button>}
                        </div>
                    </div>
                    <textarea
                        value={statusReason}
                        onChange={(event) => setStatusReason(event.target.value)}
                        placeholder="Reason, instruction, or assignment note..."
                        rows="3"
                        style={{ width: '100%', resize: 'vertical', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '13px', color: '#0F172A', outline: 'none', marginBottom: '10px' }}
                    />

                    {mode === 'manager' && (
                        <select
                            defaultValue=""
                            onChange={(event) => assignVerifier(event.target.value)}
                            disabled={submitting}
                            style={{ width: '100%', height: '38px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 10px', color: '#334155', marginBottom: '10px' }}
                        >
                            <option value="">Assign to verifier...</option>
                            {verifiers.map((verifier) => (
                                <option key={verifier.id} value={verifier.id}>
                                    {verifier.first_name || 'Verifier'} {verifier.last_name || ''} ({verifier.email})
                                </option>
                            ))}
                        </select>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '18px' }}>
                        <button disabled={submitting} onClick={() => updateStatus('needs_info')} style={{ border: 'none', background: '#FEF3C7', color: '#92400E', borderRadius: '8px', padding: '9px', fontWeight: '800', cursor: 'pointer' }}>Needs Info</button>
                        <button disabled={submitting} onClick={() => updateStatus('approved')} style={{ border: 'none', background: '#DCFCE7', color: '#166534', borderRadius: '8px', padding: '9px', fontWeight: '800', cursor: 'pointer' }}>Mark Compliant</button>
                        <button disabled={submitting} onClick={() => updateStatus('clearance_issue')} style={{ border: 'none', background: '#FEE2E2', color: '#991B1B', borderRadius: '8px', padding: '9px', fontWeight: '800', cursor: 'pointer' }}>Issue</button>
                        <button disabled={submitting || mode !== 'verifier'} onClick={escalateToManager} style={{ border: mode === 'verifier' ? '1px solid #F87171' : '1px solid #E2E8F0', background: mode === 'verifier' ? '#DC2626' : '#F8FAFC', color: mode === 'verifier' ? '#FFFFFF' : '#94A3B8', borderRadius: '8px', padding: '9px', fontWeight: '800', cursor: mode === 'verifier' ? 'pointer' : 'not-allowed' }}>Escalate</button>
                    </div>

                    <h3 style={{ margin: '0 0 12px 0', color: '#0F172A', fontSize: '16px' }}>Status History</h3>
                    <div style={{ display: 'grid', gap: '8px', marginBottom: '18px' }}>
                        {statusHistory.length === 0 ? (
                            <p style={{ margin: 0, color: '#94A3B8', fontSize: '13px' }}>No status changes yet.</p>
                        ) : (
                            statusHistory.map((history) => (
                                <div key={history.id} style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '9px', background: '#F8FAFC' }}>
                                    <p style={{ margin: 0, color: '#334155', fontSize: '12px', fontWeight: '800' }}>
                                        {history.old_status || 'New'} -> {history.new_status} · {formatDate(history.created_at)}
                                    </p>
                                    <p style={{ margin: '3px 0 0 0', color: '#64748B', fontSize: '11px', fontWeight: '700' }}>{formatDateTimeIST(history.created_at)}</p>
                                    {history.reason && <p style={{ margin: '4px 0 0 0', color: '#64748B', fontSize: '12px' }}>{history.reason}</p>}
                                </div>
                            ))
                        )}
                    </div>

                    <h3 style={{ margin: '0 0 12px 0', color: '#0F172A', fontSize: '16px' }}>Comments</h3>
                    <div style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
                        {comments.length === 0 ? (
                            <p style={{ margin: 0, color: '#94A3B8', fontSize: '13px' }}>No comments yet.</p>
                        ) : (
                            comments.map((comment) => (
                                <div key={comment.id} style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px', background: comment.is_internal ? '#F8FAFC' : '#EFF6FF' }}>
                                    <p style={{ margin: '0 0 5px 0', color: '#334155', fontSize: '12px', fontWeight: '800' }}>
                                        {comment.author_id === profile.id ? 'You' : 'User'} · {comment.is_internal ? 'Internal' : 'Visible'} · {formatDate(comment.created_at)}
                                    </p>
                                    <p style={{ margin: 0, color: '#0F172A', fontSize: '13px', lineHeight: 1.5 }}>{comment.comment}</p>
                                </div>
                            ))
                        )}
                    </div>

                    <form onSubmit={addComment}>
                        <textarea
                            value={commentText}
                            onChange={(event) => setCommentText(event.target.value)}
                            placeholder="Add a comment..."
                            rows="3"
                            style={{ width: '100%', resize: 'vertical', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '13px', color: '#0F172A', outline: 'none' }}
                        />
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '10px', color: '#475569', fontSize: '13px', fontWeight: '700', lineHeight: 1, cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={isInternalComment}
                                onChange={(event) => setIsInternalComment(event.target.checked)}
                                style={{ width: '16px', height: '16px', margin: 0, flexShrink: 0, accentColor: '#49A8D8' }}
                            />
                            Internal note only
                        </label>
                        <button type="submit" disabled={submitting || !commentText.trim()} style={{ marginTop: '10px', width: '100%', border: 'none', borderRadius: '8px', background: '#49A8D8', color: '#FFFFFF', padding: '10px 14px', fontWeight: '800', cursor: submitting || !commentText.trim() ? 'not-allowed' : 'pointer', opacity: submitting || !commentText.trim() ? 0.7 : 1 }}>
                            Add Comment
                        </button>
                    </form>
                </aside>
            </div>
        </div>
    );
}
