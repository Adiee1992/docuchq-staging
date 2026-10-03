import { useEffect, useRef, useState } from 'react';

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 25;

function ZoomIcon({ type }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
            <path d="M8 11h6" />
            {type === 'in' && <path d="M11 8v6" />}
        </svg>
    );
}

export default function DocumentPreviewViewer({ loading, previewUrl, mimeType, title, height = 460 }) {
    const [zoom, setZoom] = useState(100);
    const [isDragging, setIsDragging] = useState(false);
    const canvasRef = useRef(null);
    const dragStateRef = useRef(null);
    const isImage = mimeType?.startsWith('image/');
    const isPdf = mimeType === 'application/pdf';
    const canZoom = Boolean(previewUrl && (isImage || isPdf) && !loading);
    const canPan = canZoom && zoom > 100;

    useEffect(() => {
        setZoom(100);
        setIsDragging(false);
        dragStateRef.current = null;
        if (canvasRef.current) {
            canvasRef.current.scrollLeft = 0;
            canvasRef.current.scrollTop = 0;
        }
    }, [previewUrl, mimeType]);

    const changeZoom = (change) => {
        setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + change)));
    };

    const handlePointerDown = (event) => {
        if (!canPan || event.button !== 0 || !canvasRef.current) return;

        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragStateRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            scrollLeft: canvasRef.current.scrollLeft,
            scrollTop: canvasRef.current.scrollTop
        };
        setIsDragging(true);
    };

    const handlePointerMove = (event) => {
        const dragState = dragStateRef.current;
        if (!dragState || dragState.pointerId !== event.pointerId || !canvasRef.current) return;

        event.preventDefault();
        canvasRef.current.scrollLeft = dragState.scrollLeft - (event.clientX - dragState.x);
        canvasRef.current.scrollTop = dragState.scrollTop - (event.clientY - dragState.y);
    };

    const stopDragging = (event) => {
        if (dragStateRef.current?.pointerId !== event.pointerId) return;
        dragStateRef.current = null;
        setIsDragging(false);
    };

    return (
        <div className="document-preview-viewer" style={{ height: `${height}px` }}>
            <div className="document-preview-toolbar">
                <span className="document-preview-toolbar-label">Preview</span>
                <div className="document-preview-zoom-controls" aria-label="Preview zoom controls">
                    <button
                        type="button"
                        className="document-preview-icon-button"
                        onClick={() => changeZoom(-ZOOM_STEP)}
                        disabled={!canZoom || zoom === MIN_ZOOM}
                        aria-label="Zoom out"
                        title="Zoom out"
                    >
                        <ZoomIcon type="out" />
                    </button>
                    <button
                        type="button"
                        className="document-preview-zoom-value"
                        onClick={() => setZoom(100)}
                        disabled={!canZoom}
                        aria-label="Reset zoom to 100 percent"
                        title="Reset zoom"
                    >
                        {zoom}%
                    </button>
                    <button
                        type="button"
                        className="document-preview-icon-button"
                        onClick={() => changeZoom(ZOOM_STEP)}
                        disabled={!canZoom || zoom === MAX_ZOOM}
                        aria-label="Zoom in"
                        title="Zoom in"
                    >
                        <ZoomIcon type="in" />
                    </button>
                </div>
            </div>

            <div
                ref={canvasRef}
                className={`document-preview-canvas${canPan ? ' can-pan' : ''}${isDragging ? ' is-dragging' : ''}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={stopDragging}
                onPointerCancel={stopDragging}
            >
                {loading ? (
                    <div className="document-preview-message">Loading preview...</div>
                ) : !previewUrl ? (
                    <div className="document-preview-message">Preview is unavailable for this file.</div>
                ) : isImage ? (
                    <div className="document-preview-image-stage" style={{ width: `${Math.max(100, zoom)}%` }}>
                        <img
                            src={previewUrl}
                            alt={title}
                            draggable="false"
                            style={{ width: zoom <= 100 ? `${zoom}%` : '100%' }}
                        />
                    </div>
                ) : isPdf ? (
                    <div className="document-preview-pdf-stage" style={{ width: `${Math.max(100, zoom)}%`, height: `${Math.max(100, zoom)}%` }}>
                        <iframe src={`${previewUrl.split('#')[0]}#zoom=${zoom}`} title={title} />
                        {canPan && <div className="document-preview-pan-shield" aria-hidden="true" />}
                    </div>
                ) : (
                    <div className="document-preview-message">
                        <p>This file type cannot be previewed inline.</p>
                        <a href={previewUrl} target="_blank" rel="noreferrer">Open file</a>
                    </div>
                )}
            </div>
        </div>
    );
}
