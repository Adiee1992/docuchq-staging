import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import { createDocumentSignedUrl } from '../utils/documentPreview';

const fieldStyle = { width: '100%', height: '40px', boxSizing: 'border-box', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '0 10px', color: '#0F172A', background: '#FFFFFF' };
const labelStyle = { display: 'block', marginBottom: '6px', color: '#475569', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' };

export default function CustomerDetailModal({ customer, managerId, activations, freebies, invoices, onClose, onRefresh, onActivatePlan, onAddFreebies }) {
    const { showToast } = useToast();
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [form, setForm] = useState({});

    useEffect(() => setForm({ first_name: customer.first_name || '', last_name: customer.last_name || '', company_name: customer.company_name || '', email: customer.email || '', mobile_number: customer.mobile_number || '', address: customer.address || '', gstin: customer.gstin || '', pan: customer.pan || '', iec_code: customer.iec_code || '' }), [customer]);

    const save = async () => {
        setSaving(true);
        const requestedEmail = form.email.trim().toLowerCase();
        const currentEmail = (customer.email || '').trim().toLowerCase();
        const { error } = await supabase.rpc('manager_update_customer_profile', { customer_id_input: customer.id, profile_input: { ...form, email: currentEmail } });
        if (!error && requestedEmail !== currentEmail) {
            const { error: emailError } = await supabase.functions.invoke('manager-request-email-change', {
                body: { customerId: customer.id, newEmail: requestedEmail, redirectTo: `${window.location.origin}/auth/confirm` }
            });
            if (emailError) {
                setSaving(false);
                return showToast(emailError.message || 'The email verification request could not be sent.', 'error');
            }
        }
        setSaving(false);
        if (error) return showToast(error.message, 'error');
        setEditing(false);
        showToast(requestedEmail !== currentEmail ? 'Profile updated. Verification links were sent to the current and new email addresses.' : 'Customer profile updated.', 'success');
        await onRefresh();
    };
    const toggleStatus = async () => {
        const status = customer.account_status === 'inactive' ? 'active' : 'inactive';
        const { error } = await supabase.rpc('manager_set_customer_status', { customer_id_input: customer.id, status_input: status });
        if (error) return showToast(error.message, 'error');
        showToast(`Customer account ${status === 'active' ? 'activated' : 'deactivated'}.`, 'success'); await onRefresh();
    };
    const requestCustomerDeletion = async (event) => {
        event.preventDefault();
        if (!deletePassword) return;
        setDeleting(true);
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user?.email) {
            setDeleting(false);
            return showToast('The manager session could not be verified.', 'error');
        }
        const { error: passwordError } = await supabase.auth.signInWithPassword({ email: user.email, password: deletePassword });
        if (passwordError) {
            setDeleting(false);
            return showToast('The manager password is incorrect.', 'error');
        }
        const { error } = await supabase.rpc('manager_request_customer_account_deletion', { customer_id_input: customer.id });
        setDeleting(false);
        if (error) return showToast(error.message, 'error');
        setDeleteOpen(false);
        setDeletePassword('');
        showToast('Customer account deletion scheduled for 14 days from now.', 'success');
        await onRefresh();
        onClose();
    };
    const uploadInvoice = async (event) => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        if (file.type !== 'application/pdf') return showToast('Upload the invoice as a PDF.', 'error');
        if (file.size > 5 * 1024 * 1024) return showToast('Invoice size must not exceed 5 MB.', 'error');
        setUploading(true);
        const id = crypto.randomUUID(); const path = `invoices/${customer.id}/${id}/${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}`;
        const { error: uploadError } = await supabase.storage.from('documents').upload(path, file, { contentType: 'application/pdf' });
        if (uploadError) { setUploading(false); return showToast(uploadError.message, 'error'); }
        const { error } = await supabase.from('customer_invoices').insert({ id, profile_id: customer.id, invoice_number: file.name.replace(/\.pdf$/i, ''), storage_bucket: 'documents', storage_path: path, file_name: file.name, file_size: file.size, mime_type: file.type, uploaded_by: managerId });
        setUploading(false);
        if (error) { await supabase.storage.from('documents').remove([path]); return showToast(error.message, 'error'); }
        showToast('Invoice uploaded.', 'success'); await onRefresh();
    };
    const download = async (invoice) => { try { const response = await fetch(await createDocumentSignedUrl(supabase, invoice)); if (!response.ok) throw new Error('Invoice download failed.'); const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = invoice.file_name; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); } catch (error) { showToast(error.message, 'error'); } };
    const fields = [['first_name','First Name'],['last_name','Last Name'],['company_name','Company Name'],['email','Email (verification required)'],['mobile_number','Phone Number'],['iec_code','IEC'],['gstin','GSTIN'],['pan','PAN']];

    return <div role="dialog" aria-modal="true" style={{ position:'fixed', inset:0, zIndex:720, background:'rgba(15,23,42,.65)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ width:'min(980px, calc(100vw - 48px))', maxHeight:'92vh', overflowY:'auto', background:'#FFF', borderRadius:8, padding:'26px 28px', boxSizing:'border-box' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}><div><h2 style={{ margin:'0 0 5px', fontSize:21 }}>Customer Profile</h2><p style={{ margin:0, color:'#64748B', fontSize:13 }}>{customer.company_name || customer.email}</p></div><div style={{ display:'flex', gap:8 }}><button title="Edit customer" aria-label="Edit customer" onClick={() => setEditing(!editing)} style={{ width:34, height:34, border:'1px solid #CBD5E1', borderRadius:6, background:editing?'#E0F2FE':'#FFF', color:'#2789B8', cursor:'pointer' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button><button title="Delete account" aria-label="Delete customer account" onClick={() => setDeleteOpen(true)} style={{ width:34, height:34, border:'1px solid rgba(73,168,216,.4)', borderRadius:6, background:'#F0F9FF', color:'#2789B8', cursor:'pointer' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg></button><button onClick={onClose} style={{ width:34, height:34, border:'1px solid #CBD5E1', borderRadius:6, background:'#FFF', fontSize:20 }}>&times;</button></div></div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))', gap:14 }}>{fields.map(([key,label])=><label key={key}><span style={labelStyle}>{label}</span><input disabled={!editing} value={form[key] || ''} onChange={e=>setForm(v=>({...v,[key]:e.target.value}))} style={{...fieldStyle,background:editing?'#FFF':'#F8FAFC'}} /></label>)}<label style={{gridColumn:'1 / -1'}}><span style={labelStyle}>Address</span><textarea disabled={!editing} value={form.address || ''} onChange={e=>setForm(v=>({...v,address:e.target.value}))} rows="3" style={{...fieldStyle,height:76,paddingTop:9,background:editing?'#FFF':'#F8FAFC'}} /></label></div>
            {editing && <div style={{ display:'flex', justifyContent:'flex-end', marginTop:12 }}><button disabled={saving} onClick={save} style={{ border:0, borderRadius:6, background:'#49A8D8', color:'#FFF', padding:'9px 15px', fontWeight:800 }}>{saving?'Saving...':'Save Changes'}</button></div>}
            <div style={{ display:'flex', gap:9, margin:'20px 0', flexWrap:'wrap' }}><button onClick={toggleStatus} style={{ border:'1px solid #CBD5E1', background:'#FFF', color:customer.account_status==='inactive'?'#15803D':'#B91C1C', borderRadius:6, padding:'8px 11px', fontWeight:800 }}>{customer.account_status==='inactive'?'Activate Account':'Deactivate Account'}</button><button onClick={()=>onActivatePlan(customer)} style={{ border:0, background:'#49A8D8', color:'#FFF', borderRadius:6, padding:'8px 11px', fontWeight:800 }}>Activate Plan</button><button onClick={()=>onAddFreebies(customer)} style={{ border:'1px solid rgba(73,168,216,.35)', background:'#F0F9FF', color:'#2789B8', borderRadius:6, padding:'8px 11px', fontWeight:800 }}>Add Freebies</button></div>
            <h3 style={{fontSize:15}}>Plan Activations</h3><div style={{border:'1px solid #E2E8F0',borderRadius:6}}>{activations.length?activations.map(a=><div key={a.id} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10,padding:10,borderTop:'1px solid #E2E8F0',fontSize:12}}><strong style={{textTransform:'capitalize'}}>{a.plan_type}</strong><span>{a.status}</span><span>{new Date(a.starts_at).toLocaleDateString('en-IN')}</span><span>{a.amount == null?'-':`₹${a.amount}`}</span></div>):<p style={{padding:12,color:'#94A3B8'}}>No plan activations.</p>}</div>
            <h3 style={{fontSize:15,marginTop:18}}>Freebies</h3><div style={{border:'1px solid #E2E8F0',borderRadius:6}}>{freebies.length?freebies.map(f=><div key={f.id} style={{display:'flex',justifyContent:'space-between',padding:10,borderTop:'1px solid #E2E8F0',fontSize:12}}><strong>+{f.credits} clearances</strong><span>{new Date(f.created_at).toLocaleDateString('en-IN')}</span></div>):<p style={{padding:12,color:'#94A3B8'}}>No freebies added.</p>}</div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:18}}><h3 style={{fontSize:15}}>Invoices</h3><label style={{border:0,background:'#49A8D8',color:'#FFF',borderRadius:6,padding:'8px 11px',fontWeight:800,fontSize:12,cursor:'pointer'}}><input type="file" accept="application/pdf" onChange={uploadInvoice} disabled={uploading} style={{display:'none'}} />{uploading?'Uploading...':'Upload Invoice'}</label></div><div style={{border:'1px solid #E2E8F0',borderRadius:6}}>{invoices.length?invoices.map(i=><div key={i.id} style={{display:'grid',gridTemplateColumns:'1.4fr 1fr .5fr',gap:10,padding:10,borderTop:'1px solid #E2E8F0',fontSize:12,alignItems:'center'}}><strong>{i.invoice_number}</strong><span>{new Date(i.created_at).toLocaleDateString('en-IN')}</span><button onClick={()=>download(i)} style={{border:'1px solid #CBD5E1',background:'#FFF',borderRadius:5,padding:6}}>Download</button></div>):<p style={{padding:12,color:'#94A3B8'}}>No invoices uploaded.</p>}</div>
        </div>
        {deleteOpen && <div role="dialog" aria-modal="true" aria-labelledby="manager-delete-account-title" onMouseDown={event=>{if(event.target===event.currentTarget&&!deleting)setDeleteOpen(false);}} style={{position:'fixed',inset:0,zIndex:760,background:'rgba(15,23,42,.68)',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}><form onSubmit={requestCustomerDeletion} style={{width:'min(500px,calc(100vw - 48px))',background:'#FFF',borderRadius:8,padding:'28px 30px',boxSizing:'border-box',boxShadow:'0 24px 60px rgba(15,23,42,.28)'}}><h2 id="manager-delete-account-title" style={{margin:'0 0 8px',color:'#0F172A',fontSize:21}}>Delete Customer Account?</h2><p style={{margin:'0 0 12px',color:'#475569',fontSize:14,lineHeight:1.6}}>The account and its data cannot be recovered after permanent deletion. The customer has 14 days to sign in and restore the account. After that period, deletion becomes permanent.</p><p style={{margin:'0 0 20px',color:'#64748B',fontSize:12,lineHeight:1.55}}>The customer IEC trial-redemption record will be retained for one year.</p><label style={labelStyle}>Manager Password *</label><input type="password" required autoComplete="current-password" value={deletePassword} onChange={event=>setDeletePassword(event.target.value)} placeholder="Enter your manager password" style={fieldStyle}/><div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:22}}><button type="button" disabled={deleting} onClick={()=>setDeleteOpen(false)} style={{border:'1px solid #CBD5E1',background:'#FFF',color:'#334155',borderRadius:8,padding:'10px 16px',fontWeight:800}}>Cancel</button><button type="submit" disabled={deleting||!deletePassword} style={{border:0,background:'#49A8D8',color:'#FFF',borderRadius:8,padding:'10px 16px',fontWeight:800,opacity:deleting||!deletePassword?.65:1}}>{deleting?'Scheduling...':'Delete Account'}</button></div></form></div>}
        </div>;
}
