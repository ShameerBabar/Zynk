import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocketContext } from '../../context/SocketContext';
import { getFileUrl } from '../../utils/constants';
import { showToast } from '../Common/Toast';

// ── ICE servers: STUN + free TURN relays ─────────────────────────────────────
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Open Relay free TURN servers (no credentials needed)
  { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject', urls: 'turns:openrelay.metered.ca:443' },
];

// ── Ringing tone (simple Web Audio API beep sequence) ────────────────────────
function createRingtone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    let stopped = false;
    let timeout = null;

    const beep = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + start + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    };

    const playSequence = () => {
      if (stopped) return;
      beep(480, 0, 0.4);
      beep(420, 0.45, 0.4);
      timeout = setTimeout(playSequence, 3000);
    };

    playSequence();

    return {
      stop: () => {
        stopped = true;
        clearTimeout(timeout);
        ctx.close().catch(() => {});
      }
    };
  } catch {
    return { stop: () => {} };
  }
}

const CALL_TIMEOUT_SECONDS = 60;

export default function CallModal({ callData, onCallEnd }) {
  const { user: currentUser } = useAuth();
  const { socket } = useSocketContext();

  // Call States: 'ringing' | 'incoming' | 'connected' | 'error'
  const [callState, setCallState] = useState(callData.incoming ? 'incoming' : 'ringing');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callData.type === 'voice');
  const [callDuration, setCallDuration] = useState(0);
  const [timeoutCountdown, setTimeoutCountdown] = useState(CALL_TIMEOUT_SECONDS);
  const [errorMessage, setErrorMessage] = useState('');

  // Always-mounted media element refs (never conditionally rendered)
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const ringtoneRef = useRef(null);
  const timeoutIntervalRef = useRef(null);
  const hasStartedRef = useRef(false);

  // Get other user's info
  const otherUserName = callData.otherUser?.display_name || callData.otherUser?.username || 'Zynk User';
  const otherUserAvatar = getFileUrl(callData.otherUser?.avatar_url);

  // ── Ringing tone management ───────────────────────────────────────────────
  useEffect(() => {
    if (callState === 'ringing' || callState === 'incoming') {
      ringtoneRef.current = createRingtone();
    } else {
      ringtoneRef.current?.stop();
      ringtoneRef.current = null;
    }
    return () => {
      ringtoneRef.current?.stop();
      ringtoneRef.current = null;
    };
  }, [callState]);

  // ── 60-second auto-cancel for outgoing calls ──────────────────────────────
  useEffect(() => {
    if (callState !== 'ringing') {
      clearInterval(timeoutIntervalRef.current);
      setTimeoutCountdown(CALL_TIMEOUT_SECONDS);
      return;
    }
    setTimeoutCountdown(CALL_TIMEOUT_SECONDS);
    timeoutIntervalRef.current = setInterval(() => {
      setTimeoutCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timeoutIntervalRef.current);
          // Auto-cancel
          socket?.emit('end_call', { targetUserId: callData.otherUser.id });
          showToast('No answer.', 'info');
          cleanup();
          onCallEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timeoutIntervalRef.current);
  }, [callState]);

  // Initialize Peer Connection after media is obtained
  const initCall = async (stream) => {
    try {
      localStreamRef.current = stream;

      // Bind local stream immediately if video element exists
      if (localVideoRef.current && callData.type === 'video') {
        localVideoRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionRef.current = pc;

      // Add local tracks to WebRTC
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Listen for remote tracks — attach DIRECTLY to media element here
      pc.ontrack = (event) => {
        let rStream = event.streams && event.streams[0];
        if (!rStream) {
          if (!remoteStreamRef.current) {
            remoteStreamRef.current = new MediaStream();
          }
          remoteStreamRef.current.addTrack(event.track);
          rStream = remoteStreamRef.current;
        } else {
          remoteStreamRef.current = rStream;
        }

        // Attach directly — refs are always mounted since elements are always rendered
        if (callData.type === 'video' && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = rStream;
        } else if (callData.type === 'voice' && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = rStream;
        }

        setCallState('connected');
      };

      // Send ICE candidates to other user
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice_candidate', {
            targetUserId: callData.otherUser.id,
            candidate: event.candidate
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed') {
          setCallState('error');
          setErrorMessage('Connection failed. Please check your network and try again.');
        }
      };

      return pc;
    } catch (err) {
      console.error('Failed to initialize connection:', err);
      setCallState('error');
      setErrorMessage('Could not establish connection protocols.');
    }
  };

  const getMedia = async (videoRequired) => {
    try {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
        video: videoRequired ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
      };
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.error('Permission error accessing media:', err);
      setCallState('error');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Access Denied: Zynk needs Microphone and Camera permissions to make calls.');
      } else {
        setErrorMessage(`Could not access media devices: ${err.message}`);
      }
      throw err;
    }
  };

  // Start Call (Caller Side)
  const startCall = async () => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    try {
      const stream = await getMedia(callData.type === 'video');
      const pc = await initCall(stream);
      if (!pc) return;

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callData.type === 'video',
      });
      await pc.setLocalDescription(offer);

      socket.emit('call_user', {
        targetUserId: callData.otherUser.id,
        type: callData.type,
        signalData: offer
      });
    } catch (err) {
      // Handled in getMedia
    }
  };

  // Accept Call (Recipient Side)
  const acceptCall = async () => {
    try {
      const stream = await getMedia(callData.type === 'video');
      const pc = await initCall(stream);
      if (!pc) return;

      await pc.setRemoteDescription(new RTCSessionDescription(callData.signalData));

      // Process any queued ICE candidates
      for (const candidate of pendingCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
          console.error('Error adding queued ICE candidate:', err);
        });
      }
      pendingCandidatesRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('accept_call', {
        targetUserId: callData.otherUser.id,
        signalData: answer
      });

      setCallState('connected');
    } catch (err) {
      // Handled in getMedia
    }
  };

  // Decline/End Call
  const handleEndCall = () => {
    socket.emit('end_call', { targetUserId: callData.otherUser.id });
    cleanup();
    onCallEnd();
  };

  const handleDecline = () => {
    socket.emit('reject_call', { targetUserId: callData.otherUser.id });
    cleanup();
    onCallEnd();
  };

  const cleanup = () => {
    clearInterval(durationIntervalRef.current);
    clearInterval(timeoutIntervalRef.current);
    durationIntervalRef.current = null;
    timeoutIntervalRef.current = null;
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    remoteStreamRef.current = null;
    pendingCandidatesRef.current = [];
  };

  // Socket Signaling Listeners
  useEffect(() => {
    if (!socket) return;

    // Store handlers so we can remove them precisely (avoid removing other listeners)
    const onCallAccepted = async ({ signalData }) => {
      try {
        const pc = peerConnectionRef.current;
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signalData));

          // Process any queued ICE candidates
          for (const candidate of pendingCandidatesRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
              console.error('Error adding queued ICE candidate:', err);
            });
          }
          pendingCandidatesRef.current = [];

          setCallState('connected');
        }
      } catch (err) {
        console.error('Error accepting call answer:', err);
      }
    };

    const onCallRejected = () => {
      showToast(`${otherUserName} declined the call.`, 'info');
      cleanup();
      onCallEnd();
    };

    const onCallEnded = () => {
      showToast('Call ended.', 'info');
      cleanup();
      onCallEnd();
    };

    const onIceCandidate = async ({ candidate }) => {
      try {
        const pc = peerConnectionRef.current;
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          // Queue candidate until remote description is set
          pendingCandidatesRef.current.push(candidate);
        }
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    };

    socket.on('call_accepted', onCallAccepted);
    socket.on('call_rejected', onCallRejected);
    socket.on('call_ended', onCallEnded);
    socket.on('ice_candidate', onIceCandidate);

    // Run Caller Setup if not incoming
    if (!callData.incoming) {
      startCall();
    }

    return () => {
      // Remove only our specific handlers — won't nuke other components' listeners
      socket.off('call_accepted', onCallAccepted);
      socket.off('call_rejected', onCallRejected);
      socket.off('call_ended', onCallEnded);
      socket.off('ice_candidate', onIceCandidate);
      cleanup();
    };
  }, [socket]);

  // Call duration timer
  useEffect(() => {
    if (callState === 'connected') {
      const interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
      durationIntervalRef.current = interval;
      return () => {
        clearInterval(interval);
        durationIntervalRef.current = null;
      };
    } else {
      setCallDuration(0);
    }
  }, [callState]);

  // Re-bind local video stream if video is turned back on
  useEffect(() => {
    if (callState === 'connected' && localStreamRef.current && localVideoRef.current && callData.type === 'video' && !isVideoOff) {
      if (!localVideoRef.current.srcObject) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    }
  }, [callState, isVideoOff]);

  // Toggle Mute Audio
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Toggle Hide Video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(11, 20, 26, 0.97)', zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(10px)', color: 'var(--text-primary)', fontFamily: 'var(--font-family)'
    }}>

      {/* ── Always-mounted media elements (hidden when not connected) ── */}
      {/* Remote video — always in DOM so ref is always available */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        style={{
          display: callState === 'connected' && callData.type === 'video' ? 'block' : 'none',
          width: '100%', height: '100%', objectFit: 'cover',
          position: 'absolute', top: 0, left: 0
        }}
      />
      {/* Remote audio — always in DOM, voice calls only */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
      />
      {/* Local video PIP — always in DOM, shown only during video calls */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        style={{
          display: callState === 'connected' && callData.type === 'video' && !isVideoOff ? 'block' : 'none',
          position: 'absolute', bottom: '90px', right: '20px',
          width: '120px', height: '180px', objectFit: 'cover',
          borderRadius: '8px', border: '2px solid white', zIndex: 100,
          boxShadow: 'var(--shadow-lg)',
          transform: 'scaleX(-1)'
        }}
      />

      {/* ── Incoming call screen ── */}
      {callState === 'incoming' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '30px', textAlign: 'center' }}>
          <div style={{ position: 'relative' }}>
            <div className="user-avatar-mini" style={{ width: '120px', height: '120px', fontSize: '40px', boxShadow: '0 0 30px rgba(0, 168, 132, 0.3)' }}>
              {otherUserAvatar ? <img src={otherUserAvatar} alt="" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}} /> : otherUserName[0]?.toUpperCase()}
            </div>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              borderRadius: '50%', border: '2px solid var(--accent-primary)',
              animation: 'pulse 1.8s infinite ease-in-out'
            }}></div>
          </div>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: 600 }}>{otherUserName}</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '8px', fontSize: '15px' }}>
              Incoming {callData.type === 'video' ? '🎥 Video' : '🎙️ Voice'} Call...
            </p>
          </div>

          <div style={{ display: 'flex', gap: '40px', marginTop: '20px' }}>
            <button
              onClick={handleDecline}
              style={{
                width: '68px', height: '68px', borderRadius: '50%', background: 'var(--accent-danger)',
                border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
              title="Decline"
            >
              <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" style={{ transform: 'rotate(135deg)' }}>
                <path d="M6.62 10.79a15.149 15.149 0 0 0 6.59 6.59l2.2-2.2c.28-.28.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
              </svg>
            </button>
            <button
              onClick={acceptCall}
              style={{
                width: '68px', height: '68px', borderRadius: '50%', background: 'var(--online-color)',
                border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
              title="Accept"
            >
              <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor">
                <path d="M6.62 10.79a15.149 15.149 0 0 0 6.59 6.59l2.2-2.2c.28-.28.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Ringing screen ── */}
      {callState === 'ringing' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '30px', textAlign: 'center' }}>
          <div style={{ position: 'relative' }}>
            <div className="user-avatar-mini" style={{ width: '120px', height: '120px', fontSize: '40px' }}>
              {otherUserAvatar ? <img src={otherUserAvatar} alt="" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}} /> : otherUserName[0]?.toUpperCase()}
            </div>
            <div style={{
              position: 'absolute', top: '-8px', left: '-8px', right: '-8px', bottom: '-8px',
              borderRadius: '50%', border: '2px solid rgba(0, 168, 132, 0.4)',
              animation: 'pulse 1.8s infinite ease-in-out'
            }}></div>
          </div>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: 600 }}>{otherUserName}</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '8px', fontSize: '15px' }}>
              {callData.type === 'video' ? '🎥 Video' : '🎙️ Voice'} Calling...
            </p>
            <p style={{ color: 'rgba(255,255,255,0.35)', marginTop: '6px', fontSize: '13px' }}>
              Auto-cancels in {timeoutCountdown}s
            </p>
          </div>

          <button
            onClick={handleEndCall}
            style={{
              width: '60px', height: '60px', borderRadius: '50%', background: 'var(--accent-danger)',
              border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '30px'
            }}
            title="Cancel call"
          >
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" style={{ transform: 'rotate(135deg)' }}>
              <path d="M6.62 10.79a15.149 15.149 0 0 0 6.59 6.59l2.2-2.2c.28-.28.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
            </svg>
          </button>
        </div>
      )}

      {/* ── Error screen ── */}
      {callState === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', textAlign: 'center', padding: '0 20px', maxWidth: '400px' }}>
          <div style={{ color: 'var(--accent-danger)' }}>
            <svg viewBox="0 0 24 24" width="60" height="60" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Call Failed</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>{errorMessage}</p>
          <button
            onClick={onCallEnd}
            style={{
              background: 'var(--bg-active)', border: '1px solid var(--border-color)',
              color: 'var(--text-primary)', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px'
            }}
          >
            Close Window
          </button>
        </div>
      )}

      {/* ── Connected screen overlays ── */}
      {callState === 'connected' && (
        <>
          {/* Video call timer overlay */}
          {callData.type === 'video' && (
            <div style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: '4px', zIndex: 10, fontSize: '14px', fontWeight: 'bold' }}>
              {otherUserName} • {formatDuration(callDuration)}
            </div>
          )}

          {/* Voice call avatar */}
          {callData.type === 'voice' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', textAlign: 'center', zIndex: 10 }}>
              <div className="user-avatar-mini" style={{ width: '140px', height: '140px', fontSize: '50px', border: '3px solid var(--accent-primary)', animation: 'pulse 2.5s infinite ease-in-out' }}>
                {otherUserAvatar ? <img src={otherUserAvatar} alt="" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}} /> : otherUserName[0]?.toUpperCase()}
              </div>
              <div>
                <h2 style={{ fontSize: '26px', fontWeight: 600 }}>{otherUserName}</h2>
                <div style={{ color: 'var(--online-color)', fontWeight: 'bold', marginTop: '10px', fontSize: '16px' }}>
                  {formatDuration(callDuration)}
                </div>
              </div>
            </div>
          )}

          {/* Call controls bar */}
          <div style={{
            position: 'absolute', bottom: '24px',
            display: 'flex', gap: '20px', zIndex: 10,
            background: 'rgba(32, 44, 51, 0.9)', padding: '12px 24px', borderRadius: '30px',
            boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-light)'
          }}>
            {/* Audio Mute */}
            <button
              onClick={toggleMute}
              style={{
                width: '46px', height: '46px', borderRadius: '50%', background: isMuted ? 'var(--accent-danger)' : 'var(--bg-active)',
                border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? (
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17l-9.15-9.15L4.41 3.44l3.12 3.12C7.2 7.23 7 8.09 7 9v2c0 2.76 2.24 5 5 5 .33 0 .66-.04.98-.1l1.56 1.56c-.83.34-1.72.54-2.54.54-3.87 0-7-3.13-7-7H3c0 4.42 3.28 8.06 7.5 8.76V23h3v-3.24c.73-.12 1.42-.35 2.06-.68l3.12 3.12 1.41-1.41-5.17-5.17zM12 14c-1.66 0-3-1.34-3-3V7.3l4.63 4.63C13.34 13.19 12.72 14 12 14zm0-9c.3 0 .57.06.82.16l1.49-1.49C13.56 3.23 12.8 3 12 3c-1.66 0-3 1.34-3 3v2.17l3-3V5z"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
              )}
            </button>

            {/* Video Toggle (Video Calls Only) */}
            {callData.type === 'video' && (
              <button
                onClick={toggleVideo}
                style={{
                  width: '46px', height: '46px', borderRadius: '50%', background: isVideoOff ? 'var(--accent-danger)' : 'var(--bg-active)',
                  border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
                title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
              >
                {isVideoOff ? (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M9.56 6.73L21.41 18.6c.35-.45.59-.97.59-1.6V7c0-1.1-.9-2-2-2h-8.83l.39.39zM3.44 2.12L2.03 3.53 5.2 6.7C5.07 6.8 5 6.9 5 7v10c0 1.1.9 2 2 2h10c.1 0 .2-.07.3-.2l3.17 3.17 1.41-1.41L3.44 2.12zm1.76 1.76l1.24 1.24L17 17.6c.11.11.17.27.17.4H7c-1.1 0-2-.9-2-2V7.5c0-.13.06-.29.17-.4l.03-.02zm12.3 8.3L15 9.7V7c0-.55-.45-1-1-1h-2.7L17.5 12.18z"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
                )}
              </button>
            )}

            {/* Hang Up */}
            <button
              onClick={handleEndCall}
              style={{
                width: '46px', height: '46px', borderRadius: '50%', background: 'var(--accent-danger)',
                border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
              title="Hang up"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" style={{ transform: 'rotate(135deg)' }}>
                <path d="M6.62 10.79a15.149 15.149 0 0 0 6.59 6.59l2.2-2.2c.28-.28.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
              </svg>
            </button>
          </div>
        </>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 168, 132, 0.4); }
          70% { transform: scale(1); box-shadow: 0 0 0 20px rgba(0, 168, 132, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 168, 132, 0); }
        }
      `}</style>
    </div>
  );
}
