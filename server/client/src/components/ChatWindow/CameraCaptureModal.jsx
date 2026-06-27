import React, { useState, useEffect, useRef } from 'react';

export default function CameraCaptureModal({ onClose, onCapture }) {
  const [mode, setMode] = useState('photo'); // 'photo' | 'video'
  const [facingMode, setFacingMode] = useState('user'); // 'user' | 'environment'
  const [stream, setStream] = useState(null);
  const [permissionError, setPermissionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [galleryImages, setGalleryImages] = useState([]);
  const [shutterFlash, setShutterFlash] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);
  const timerRef = useRef(null);
  const shouldDiscardRef = useRef(false);
  const galleryInputRef = useRef(null);

  useEffect(() => {
    let activeStream = null;

    const startCamera = async () => {
      setLoading(true);
      setPermissionError('');

      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const constraints = {
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
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
        if (mode === 'video') {
          try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
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
            setPermissionError('Camera permission denied. Please allow camera access in your browser settings.');
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
  }, [mode, facingMode]);

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

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Flash effect
    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 150);

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

    let options = { mimeType: 'video/webm;codecs=vp9,opus' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/webm;codecs=vp8,opus' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/webm' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/mp4' };

    try {
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
    } catch (e) {
      try {
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
      } catch (err) {
        alert('Video recording is not supported in this browser.');
        return;
      }
    }

    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) videoChunksRef.current.push(e.data);
    };

    mediaRecorderRef.current.onstop = () => {
      if (!shouldDiscardRef.current && videoChunksRef.current.length > 0) {
        const mimeType = mediaRecorderRef.current.mimeType || 'video/webm';
        const videoBlob = new Blob(videoChunksRef.current, { type: mimeType });
        onCapture(videoBlob);
      }
      setIsRecording(false);
      setRecordingTime(0);
    };

    mediaRecorderRef.current.start(100);
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

  const handleShutterClick = () => {
    if (mode === 'photo') {
      handleCapture();
    } else {
      if (isRecording) {
        handleStopRecording();
      } else {
        handleStartRecording();
      }
    }
  };

  const handleGalleryOpen = () => {
    galleryInputRef.current?.click();
  };

  const handleGalleryFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const url = URL.createObjectURL(file);
      setGalleryImages(prev => [...prev.slice(-7), { url, file }]);
    });
  };

  const handleGalleryImageClick = (item) => {
    onCapture(item.file);
  };

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: '#000', zIndex: 99999,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-family)',
      userSelect: 'none'
    }}>
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
        @keyframes shutterFlash {
          0% { opacity: 0.8; }
          100% { opacity: 0; }
        }
        @keyframes recordPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(234,67,53,0.7); }
          50% { box-shadow: 0 0 0 10px rgba(234,67,53,0); }
        }
        .cam-shutter-btn {
          transition: transform 0.1s ease;
        }
        .cam-shutter-btn:active {
          transform: scale(0.92);
        }
        .cam-mode-pill {
          transition: all 0.2s ease;
        }
        .cam-gallery-thumb {
          transition: opacity 0.15s ease, transform 0.15s ease;
        }
        .cam-gallery-thumb:hover {
          opacity: 0.85;
          transform: scale(1.05);
        }
        .cam-close-btn {
          transition: background 0.2s;
        }
        .cam-close-btn:hover {
          background: rgba(255,255,255,0.15) !important;
        }
      `}</style>

      {/* ── Camera viewfinder — fills entire screen ── */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.6)', fontSize: '15px', gap: '10px'
          }}>
            <div style={{
              width: '22px', height: '22px', border: '2px solid rgba(255,255,255,0.3)',
              borderTop: '2px solid #fff', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }}/>
            Starting camera...
          </div>
        )}

        {permissionError ? (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: '#fff', padding: '32px', textAlign: 'center', gap: '16px'
          }}>
            <div style={{ fontSize: '56px' }}>📷</div>
            <div style={{ fontSize: '17px', fontWeight: 600 }}>Camera Access Needed</div>
            <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', maxWidth: '280px', lineHeight: 1.5 }}>
              {permissionError}
            </div>
            <button onClick={handleCancel} style={{
              marginTop: '8px', background: 'rgba(255,255,255,0.12)',
              color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
              padding: '10px 28px', borderRadius: '24px', cursor: 'pointer', fontSize: '14px'
            }}>
              Close
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover',
              display: loading ? 'none' : 'block',
              transform: facingMode === 'user' ? 'scaleX(-1)' : 'none'
            }}
          />
        )}

        {/* Shutter flash overlay */}
        {shutterFlash && (
          <div style={{
            position: 'absolute', inset: 0, background: '#fff',
            animation: 'shutterFlash 150ms ease-out forwards',
            pointerEvents: 'none', zIndex: 10
          }}/>
        )}

        {/* Recording badge */}
        {isRecording && (
          <div style={{
            position: 'absolute', top: '20px', left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
            padding: '6px 16px', borderRadius: '20px',
            display: 'flex', alignItems: 'center', gap: '8px', zIndex: 20
          }}>
            <span style={{
              width: '9px', height: '9px', borderRadius: '50%',
              background: '#ea4335', animation: 'blink 1s infinite', display: 'block'
            }}/>
            <span style={{ color: '#fff', fontSize: '14px', fontWeight: 600, letterSpacing: '0.5px' }}>
              REC {formatTime(recordingTime)}
            </span>
          </div>
        )}
      </div>

      {/* ── Top bar ── */}
      <div style={{
        position: 'relative', zIndex: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)'
      }}>
        {/* Close button */}
        <button
          className="cam-close-btn"
          onClick={handleCancel}
          disabled={isRecording}
          style={{
            background: 'rgba(255,255,255,0.1)', border: 'none',
            color: '#fff', width: '40px', height: '40px', borderRadius: '50%',
            cursor: isRecording ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: isRecording ? 0.4 : 1
          }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>

        {/* Empty spacer */}
        <div style={{ width: '40px' }}/>
      </div>

      {/* ── Bottom controls ── */}
      <div style={{
        position: 'relative', zIndex: 30, marginTop: 'auto',
        background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)',
        paddingBottom: 'env(safe-area-inset-bottom, 20px)'
      }}>

        {/* Gallery thumbnails row */}
        {galleryImages.length > 0 && (
          <div style={{
            display: 'flex', gap: '6px', padding: '0 20px 12px',
            overflowX: 'auto', alignItems: 'center'
          }}>
            {galleryImages.map((item, i) => (
              <img
                key={i}
                src={item.url}
                className="cam-gallery-thumb"
                onClick={() => handleGalleryImageClick(item)}
                style={{
                  width: '54px', height: '54px', objectFit: 'cover',
                  borderRadius: '8px', cursor: 'pointer', flexShrink: 0,
                  border: '2px solid rgba(255,255,255,0.4)'
                }}
              />
            ))}
          </div>
        )}

        {/* Mode toggle pill */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <div style={{
            display: 'flex', background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(8px)', borderRadius: '30px',
            padding: '4px', gap: '2px', border: '1px solid rgba(255,255,255,0.15)'
          }}>
            {['photo', 'video'].map(m => (
              <button
                key={m}
                className="cam-mode-pill"
                onClick={() => !isRecording && setMode(m)}
                disabled={isRecording}
                style={{
                  background: mode === m ? '#fff' : 'transparent',
                  color: mode === m ? '#000' : 'rgba(255,255,255,0.75)',
                  border: 'none', padding: '6px 22px', borderRadius: '24px',
                  cursor: isRecording ? 'not-allowed' : 'pointer',
                  fontWeight: mode === m ? '700' : '500',
                  fontSize: '13px', letterSpacing: '0.8px',
                  textTransform: 'uppercase',
                  opacity: isRecording && mode !== m ? 0.3 : 1
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Shutter row: gallery | shutter | flip */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 40px', marginBottom: '28px'
        }}>

          {/* Gallery button */}
          <button
            onClick={handleGalleryOpen}
            style={{
              width: '52px', height: '52px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.25)',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#fff', overflow: 'hidden', padding: 0
            }}
            title="Open gallery"
          >
            {galleryImages.length > 0 ? (
              <img
                src={galleryImages[galleryImages.length - 1].url}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
              </svg>
            )}
          </button>

          {/* Hidden gallery file input */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleGalleryFileChange}
          />

          {/* ── Shutter button ── */}
          {!permissionError && !loading && (
            <button
              className="cam-shutter-btn"
              onClick={handleShutterClick}
              style={{
                width: '76px', height: '76px',
                borderRadius: '50%', border: 'none',
                background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0,
                animation: isRecording ? 'recordPulse 1.5s infinite' : 'none'
              }}
            >
              {/* Outer ring */}
              <div style={{
                width: '76px', height: '76px', borderRadius: '50%',
                border: '3.5px solid #fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {/* Inner fill */}
                <div style={{
                  width: isRecording ? '28px' : '60px',
                  height: isRecording ? '28px' : '60px',
                  borderRadius: isRecording ? '8px' : '50%',
                  background: mode === 'video'
                    ? (isRecording ? '#ea4335' : '#ea4335')
                    : '#fff',
                  transition: 'all 0.2s ease'
                }}/>
              </div>
            </button>
          )}

          {/* Flip camera button */}
          <button
            style={{
              width: '52px', height: '52px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.25)',
              cursor: isRecording ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#fff',
              opacity: isRecording ? 0.4 : 1,
              transition: 'background 0.2s'
            }}
            title="Flip camera"
            disabled={isRecording}
            onClick={() => {
              if (!isRecording) {
                setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
              }
            }}
          >
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
              <path d="M20 5h-3.17L15 3H9L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z M12 9c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
            </svg>
          </button>
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
