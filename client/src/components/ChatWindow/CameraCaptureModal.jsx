import React, { useState, useEffect, useRef } from 'react';

export default function CameraCaptureModal({ onClose, onCapture }) {
  const [mode, setMode] = useState('photo'); // 'photo' | 'video'
  const [stream, setStream] = useState(null);
  const [permissionError, setPermissionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);
  const timerRef = useRef(null);
  const shouldDiscardRef = useRef(false);

  useEffect(() => {
    let activeStream = null;

    const startCamera = async () => {
      setLoading(true);
      setPermissionError('');

      // Stop any existing stream before starting a new one
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const constraints = {
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: mode === 'video'
      };

      try {
        const localStream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = localStream;
        setStream(localStream);
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
        }
      } catch (err) {
        console.error('Camera/Mic access error:', err);
        // Fallback for video mode: if audio device fails/denied, try video-only
        if (mode === 'video') {
          try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
              audio: false
            });
            activeStream = fallbackStream;
            setStream(fallbackStream);
            if (videoRef.current) {
              videoRef.current.srcObject = fallbackStream;
            }
          } catch (innerErr) {
            setPermissionError(`Failed to access camera: ${innerErr.message}`);
          }
        } else {
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setPermissionError('Permission Denied: Zynk needs Camera permission to take photos.');
          } else {
            setPermissionError(`Failed to access camera: ${err.message}`);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [mode]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
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

  const handleStartRecording = () => {
    if (!stream) return;

    videoChunksRef.current = [];
    shouldDiscardRef.current = false;

    // Determine standard MIME types supported by the browser
    let options = { mimeType: 'video/webm;codecs=vp9,opus' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm;codecs=vp8,opus' };
    }
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm' };
    }
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/mp4' };
    }

    try {
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
    } catch (e) {
      console.warn('Failed to init MediaRecorder with options:', e);
      try {
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
      } catch (err) {
        console.error('MediaRecorder not supported:', err);
        alert('Video recording is not supported in this browser.');
        return;
      }
    }

    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        videoChunksRef.current.push(e.data);
      }
    };

    mediaRecorderRef.current.onstop = () => {
      if (!shouldDiscardRef.current && videoChunksRef.current.length > 0) {
        // Find default type or fallback
        const mimeType = mediaRecorderRef.current.mimeType || 'video/webm';
        const videoBlob = new Blob(videoChunksRef.current, { type: mimeType });
        onCapture(videoBlob);
      }
      setIsRecording(false);
      setRecordingTime(0);
    };

    mediaRecorderRef.current.start(100); // chunk every 100ms
    setIsRecording(true);
    setRecordingTime(0);

    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const handleStopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleCancel = () => {
    if (isRecording) {
      shouldDiscardRef.current = true;
      handleStopRecording();
    }
    onClose();
  };

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(11, 20, 26, 0.9)', zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(5px)', fontFamily: 'var(--font-family)'
    }}>
      <style>{`
        @keyframes blink {
          0% { opacity: 1; }
          50% { opacity: 0.3; }
          100% { opacity: 1; }
        }
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.03); }
          100% { transform: scale(1); }
        }
      `}</style>

      <div style={{
        background: 'var(--bg-sidebar)', border: '1px solid var(--border-light)',
        borderRadius: '12px', width: '90%', maxWidth: '720px', overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column',
        transition: 'all 0.3s ease'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
          <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
            {mode === 'photo' ? 'Capture Photo' : 'Record Video'}
          </span>
          <button 
            onClick={handleCancel} 
            disabled={isRecording}
            style={{ 
              background: 'transparent', border: 'none', color: 'var(--text-secondary)', 
              cursor: isRecording ? 'not-allowed' : 'pointer', display: 'flex', opacity: isRecording ? 0.5 : 1
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        {/* Tabs for Mode selection */}
        <div style={{ 
          display: 'flex', justifyContent: 'center', gap: '20px', 
          background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border-color)',
          padding: '4px 0'
        }}>
          <button
            onClick={() => !isRecording && setMode('photo')}
            disabled={isRecording}
            style={{
              background: 'transparent', border: 'none',
              color: mode === 'photo' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              borderBottom: mode === 'photo' ? '3px solid var(--accent-primary)' : '3px solid transparent',
              padding: '10px 24px', cursor: isRecording ? 'not-allowed' : 'pointer', 
              fontWeight: '600', fontSize: '14px', transition: 'all 0.2s ease',
              opacity: isRecording && mode !== 'photo' ? 0.4 : 1
            }}
          >
            PHOTO
          </button>
          <button
            onClick={() => !isRecording && setMode('video')}
            disabled={isRecording}
            style={{
              background: 'transparent', border: 'none',
              color: mode === 'video' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              borderBottom: mode === 'video' ? '3px solid var(--accent-primary)' : '3px solid transparent',
              padding: '10px 24px', cursor: isRecording ? 'not-allowed' : 'pointer', 
              fontWeight: '600', fontSize: '14px', transition: 'all 0.2s ease',
              opacity: isRecording && mode !== 'video' ? 0.4 : 1
            }}
          >
            VIDEO
          </button>
        </div>

        {/* Camera Feed Container */}
        <div style={{ background: '#000', width: '100%', height: '450px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

          {/* Recording Timer Overlay */}
          {isRecording && (
            <div style={{
              position: 'absolute', top: '16px', left: '16px',
              background: 'rgba(0, 0, 0, 0.75)', padding: '6px 14px',
              borderRadius: '20px', display: 'flex', alignItems: 'center',
              gap: '8px', zIndex: 10, border: '1px solid rgba(255, 255, 255, 0.15)'
            }}>
              <span style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: 'var(--accent-danger)', animation: 'blink 1s infinite'
              }}></span>
              <span style={{ color: 'white', fontSize: '14px', fontWeight: 600 }}>
                {formatTime(recordingTime)}
              </span>
            </div>
          )}

          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        {/* Actions */}
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'center', gap: '20px', borderTop: '1px solid var(--border-color)' }}>
          <button 
            onClick={handleCancel} 
            disabled={isRecording}
            style={{
              background: 'var(--bg-active)', border: '1px solid var(--border-color)',
              color: 'var(--text-primary)', padding: '10px 24px', borderRadius: '20px',
              cursor: isRecording ? 'not-allowed' : 'pointer', fontWeight: 'bold',
              opacity: isRecording ? 0.5 : 1
            }}
          >
            Cancel
          </button>
          
          {!permissionError && !loading && (
            mode === 'photo' ? (
              <button 
                onClick={handleCapture}
                style={{
                  background: 'var(--accent-primary)', color: 'white', border: 'none',
                  padding: '10px 30px', borderRadius: '20px', cursor: 'pointer',
                  fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="12" r="3.2"/><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>
                Capture Photo
              </button>
            ) : (
              !isRecording ? (
                <button 
                  onClick={handleStartRecording}
                  style={{
                    background: 'var(--accent-danger)', color: 'white', border: 'none',
                    padding: '10px 30px', borderRadius: '20px', cursor: 'pointer',
                    fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px'
                  }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>
                  Record Video
                </button>
              ) : (
                <button 
                  onClick={handleStopRecording}
                  style={{
                    background: 'var(--accent-danger)', color: 'white', border: 'none',
                    padding: '10px 30px', borderRadius: '20px', cursor: 'pointer',
                    fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px',
                    boxShadow: '0 0 12px rgba(234, 67, 53, 0.6)',
                    animation: 'pulse 1.5s infinite'
                  }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                  Stop Recording
                </button>
              )
            )
          )}
        </div>
      </div>
    </div>
  );
}
