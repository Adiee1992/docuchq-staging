import { useEffect, useRef, useState } from 'react';
import logoIcon from '../assets/Logo_Header-Trans.png';

const DURATION = 30000;
const scenes = [
    { at: 0, title: 'Your export workspace', text: 'Create and track every export clearance in one secure place.' },
    { at: 4000, title: 'Create a clearance', text: 'Add the buyer, destination, payment method and shipment reference.' },
    { at: 9000, title: 'Upload your documents', text: 'Add invoices, packing lists, shipping bills and supporting documents together.' },
    { at: 15000, title: 'Get reviewed', text: 'A reviewer checks the documents and highlights discrepancies that need attention.' },
    { at: 22000, title: 'Resolve and download', text: 'Review comments and download the formatted document once it is ready.' },
    { at: 27000, title: 'Submit with confidence', text: 'Use the completed set for a clearer, more confident bank submission.' }
];

function ControlIcon({ type }) {
    const paths = {
        play: <path d="m8 5 11 7-11 7z" />,
        pause: <><path d="M9 5v14" /><path d="M15 5v14" /></>,
        replay: <><path d="M4 11a8 8 0 1 1 2.4 5.7" /><path d="M4 5v6h6" /></>,
        close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>
    };
    return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[type]}</svg>;
}

function FileRow({ status, tone }) {
    return (
        <div className="walkthrough-file-row">
            <span className="walkthrough-file-icon">▤</span>
            <span><b>Commercial-Invoice.pdf</b><small>Commercial Invoice</small></span>
            <i className={`walkthrough-status walkthrough-status-${tone}`}>{status}</i>
        </div>
    );
}

function WalkthroughScreen({ scene }) {
    const complete = scene >= 5;
    return (
        <div className={`walkthrough-product walkthrough-scene-${scene}`}>
            <div className="walkthrough-appbar">
                <div><img src={logoIcon} alt="" /><b>Docu<span>CHQ</span></b></div>
                <div className="walkthrough-app-pills"><span>12 Days Left</span><span>Trial Account</span><span>Clearances: 1</span><i>M</i></div>
            </div>
            <div className="walkthrough-workspace">
                <div className="walkthrough-dashboard-head">
                    <span><b>Compliance Documents</b><small>Manage your export clearance tracks and documents.</small></span>
                    <button type="button">+ &nbsp;Create Clearance</button>
                </div>
                <div className="walkthrough-counters">
                    <span><i>◷</i><b>{complete ? 0 : 1}</b><small>Pending Review</small></span>
                    <span><i>i</i><b>{scene === 3 ? 1 : 0}</b><small>Needs Info</small></span>
                    <span><i>!</i><b>0</b><small>Clearance Issue</small></span>
                    <span><i>✓</i><b>{complete ? 1 : 0}</b><small>Compliant</small></span>
                </div>
                <div className="walkthrough-track">
                    <span><small>Reference Track</small><b>DCQ-1046</b></span>
                    <span><small>Customer</small><b>Sunrise Textiles</b></span>
                    <span><small>Country</small><b>Germany</b></span>
                    <span><small>Status</small><i className={`walkthrough-status ${complete ? 'walkthrough-status-green' : scene >= 3 ? 'walkthrough-status-amber' : 'walkthrough-status-blue'}`}>{complete ? 'Compliant' : scene >= 3 ? 'Needs Info' : 'Pending Review'}</i></span>
                </div>
            </div>
            <div className="walkthrough-cursor" aria-hidden="true">↖</div>

            {scene === 1 && <div className="walkthrough-form-panel">
                <div className="walkthrough-panel-title"><b>Create Clearance</b><span>×</span></div>
                <div className="walkthrough-form-grid">
                    <label>Buyer Name<strong>Sunrise Textiles</strong></label><label>Destination Country<strong>Germany⌄</strong></label>
                    <label>Currency<strong>EUR⌄</strong></label><label>Payment Method<strong>Bank Transfer⌄</strong></label>
                </div>
                <button type="button">Continue to Documents</button>
            </div>}

            {scene === 2 && <div className="walkthrough-form-panel walkthrough-upload-panel">
                <div className="walkthrough-panel-title"><b>Upload Documents</b><span>×</span></div>
                <div className="walkthrough-dropzone"><b>↑</b><strong>Drop export documents here</strong><small>PDF, JPG or PNG · Up to 20 MB in total</small></div>
                <div className="walkthrough-upload-list"><span>Commercial-Invoice.pdf <b>✓</b></span><span>Packing-List.pdf <b>✓</b></span><span>Shipping-Bill.pdf <b>✓</b></span></div>
                <button type="button">Submit for Review</button>
            </div>}

            {scene >= 3 && scene <= 4 && <div className="walkthrough-review-panel">
                <div className="walkthrough-review-doc"><small>COMMERCIAL INVOICE</small><b>Sunrise Textiles</b><i /><i /><i /><i /><mark>Invoice value differs from the Shipping Bill</mark></div>
                <div className="walkthrough-review-notes"><span>Document Review</span><FileRow status={scene === 3 ? 'Needs Info' : 'Formatted'} tone={scene === 3 ? 'amber' : 'green'} />
                    <p><b>{scene === 3 ? 'Discrepancy found' : 'Correction completed'}</b>{scene === 3 ? 'Confirm the invoice value and currency against the Shipping Bill.' : 'The corrected version is ready to preview and download.'}</p>
                    <button type="button">{scene === 3 ? 'View Comment' : '↓  Download Formatted'}</button>
                </div>
            </div>}

            {scene === 5 && <div className="walkthrough-complete-panel"><i>✓</i><b>Clearance is compliant</b><span>Your reviewed document set is ready for bank submission.</span><button type="button">↓ &nbsp;Download Documents</button></div>}
        </div>
    );
}

export default function ProductWalkthroughModal({ open, onClose }) {
    const [elapsed, setElapsed] = useState(0);
    const [playing, setPlaying] = useState(true);
    const frameRef = useRef(null);
    const elapsedRef = useRef(0);
    const scene = scenes.reduce((current, item, index) => elapsed >= item.at ? index : current, 0);
    const progress = Math.min((elapsed / DURATION) * 100, 100);

    useEffect(() => {
        if (!open) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const handleKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKeyDown);
        return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', handleKeyDown); };
    }, [open, onClose]);

    useEffect(() => {
        if (!open) { setElapsed(0); elapsedRef.current = 0; setPlaying(true); return undefined; }
        if (!playing) return undefined;
        const startedAt = performance.now() - elapsedRef.current;
        const tick = (time) => {
            const nextElapsed = Math.min(time - startedAt, DURATION);
            elapsedRef.current = nextElapsed;
            setElapsed(nextElapsed);
            if (nextElapsed < DURATION) frameRef.current = requestAnimationFrame(tick);
            else setPlaying(false);
        };
        frameRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameRef.current);
    }, [open, playing]);

    if (!open) return null;
    const replay = () => { elapsedRef.current = 0; setElapsed(0); setPlaying(true); };

    return <div className="walkthrough-overlay" role="dialog" aria-modal="true" aria-labelledby="walkthrough-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <div className="walkthrough-modal">
            <div className="walkthrough-modal-head"><span><small>How it works</small><b id="walkthrough-title">From upload to bank-ready in 30 seconds</b></span><button type="button" className="walkthrough-icon-button" onClick={onClose} aria-label="Close walkthrough" title="Close"><ControlIcon type="close" /></button></div>
            <div className="walkthrough-stage"><WalkthroughScreen scene={scene} /><div className="walkthrough-caption" key={scene}><small>Step {scene + 1} of {scenes.length}</small><b>{scenes[scene].title}</b><span>{scenes[scene].text}</span></div></div>
            <div className="walkthrough-controls">
                <button type="button" className="walkthrough-icon-button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pause walkthrough' : 'Play walkthrough'} title={playing ? 'Pause' : 'Play'}><ControlIcon type={playing ? 'pause' : 'play'} /></button>
                <button type="button" className="walkthrough-icon-button" onClick={replay} aria-label="Replay walkthrough" title="Replay"><ControlIcon type="replay" /></button>
                <div className="walkthrough-progress" aria-label={`${Math.round(progress)}% complete`}><i style={{ width: `${progress}%` }} /></div><span>{Math.ceil((DURATION - elapsed) / 1000)}s</span>
            </div>
        </div>
    </div>;
}
