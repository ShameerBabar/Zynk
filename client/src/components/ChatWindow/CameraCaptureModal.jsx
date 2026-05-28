import React, { useState, useEffect, useRef } from 'react';

export default function CameraCaptureModal({ onClose, onCapture }) {
  const [stream, setStream] = useState(null);
  const [permissionError, setPermissionError] = useState('');
  const [loading, setLoading] = useState(true);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    let activeStream = null;

    // Start camera stream
    const startCamera = async () => {
      try {
        const localStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 },
          audio: false
        });
        activeStream = localStream;
        setStream(localStream);
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
        }
      } catch (err) {
        console.error('Camera access error:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermissionError('Permission Denied: Zynk needs Camera permission to take photos.');
        } else {
          setPermissionError(`Failed to access camera: ${err.message}`);
        }
      } finally {
        setLoading(false);
      }
    };

    startCamera();

    return () => {
      // Clean up camera stream using the active local stream variable
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Draw the current video frame onto canvas
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    // Mirror the canvas drawing so the captured photo matches the mirrored preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas to image blob
    canvas.toBlob((blob) => {
      if (blob) {
        onCapture(blob);
      }
    }, 'image/jpeg', 0.85);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(11, 20, 26, 0.9)', zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(5px)', fontFamily: 'var(--font-family)'
    }}>
      <div style={{
        background: 'var(--bg-sidebar)', border: '1px solid var(--border-light)',
        borderRadius: '12px', width: '90%', maxWidth: '500px', overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
          <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Take Photo</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        {/* Camera Feed */}
        <div style={{ background: '#000', width: '100%', height: '375px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {loading && <div style={{ color: 'white' }}>Starting camera...</div>}
          
          {permissionError ? (
            <div style={{ color: 'var(--accent-danger)', textAlign: 'center', padding: '0 24px', fontSize: '14px', lineHeight: 1.5 }}>
              <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" style={{ marginBottom: '10px' }}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
              <div>{permissionError}</div>
            </div>
          ) : (
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: loading ? 'none' : 'block', transform: 'scaleX(-1)' }}
            />
          )}

          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        {/* Actions */}
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'center', gap: '20px', borderTop: '1px solid var(--border-color)' }}>
          <button 
            onClick={onClose} 
            style={{
              background: 'var(--bg-active)', border: '1px solid var(--border-color)',
              color: 'var(--text-primary)', padding: '10px 24px', borderRadius: '20px',
              cursor: 'pointer', fontWeight: 'bold'
            }}
          >
            Cancel
          </button>
          
          {!permissionError && !loading && (
            <button 
              onClick={handleCapture}
              style={{
                background: 'var(--accent-primary)', color: 'white', border: 'none',
                padding: '10px 30px', borderRadius: '20px', cursor: 'pointer',
                fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px'
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="12" r="3.2"/><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>
              Capture
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
