import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocketContext } from '../../context/SocketContext';
import { getFileUrl } from '../../utils/constants';
import { showToast } from '../Common/Toast';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

// ── ParticipantTile ───────────────────────────────────────────────────────────
function ParticipantTile({ userInfo, stream, callType, isLocal, isMuted, isVideoOff }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const name = userInfo?.display_name || userInfo?.username || 'Unknown';
  const avatar = getFileUrl(userInfo?.avatar_url);
  const showVideo = callType === 'video' && stream && !isVideoOff;

  return (
    <div style={{
      position: 'relative', borderRadius: '12px', overflow: 'hidden',
      background: '#1a2332', display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '160px', border: '1px solid rgba(255,255,255,0.08)'
    }}>
      {/* Video element — always mounted */}
      <video
        ref={videoRef}
        autoPlay playsInline
        muted={isLocal}
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          position: 'absolute', top: 0, left: 0,
          display: showVideo ? 'block' : 'none',
          transform: isLocal ? 'scaleX(-1)' : 'none'
        }}
      />

      {/* Avatar when no video */}
      {!showVideo && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', zIndex: 1 }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: 'var(--accent-primary)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '26px',
            flexShrink: 0, overflow: 'hidden',
            boxShadow: stream ? '0 0 0 3px var(--accent-primary)' : 'none',
            animation: stream ? 'callPulse 2s infinite ease-in-out' : 'none'
          }}>
            {avatar ? <img src={avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : name[0]?.toUpperCase()}
          </div>
          <span style={{ color: 'white', fontSize: '13px', fontWeight: 500 }}>{name}</span>
        </div>
      )}

      {/* Name bar at bottom */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '6px 10px', background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', gap: '6px'
      }}>
        <span style={{ color: 'white', fontSize: '12px', fontWeight: 500, flex: 1 }}>
          {name}{isLocal ? ' (You)' : ''}
        </span>
        {isMuted && (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="#ff4d4d">
            <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17l-9.15-9.15L4.41 3.44l3.12 3.12C7.2 7.23 7 8.09 7 9v2c0 2.76 2.24 5 5 5 .33 0 .66-.04.98-.1l1.56 1.56c-.83.34-1.72.54-2.54.54-3.87 0-7-3.13-7-7H3c0 4.42 3.28 8.06 7.5 8.76V23h3v-3.24c.73-.12 1.42-.35 2.06-.68l3.12 3.12 1.41-1.41-5.17-5.17zM12 14c-1.66 0-3-1.34-3-3V7.3l4.63 4.63C13.34 13.19 12.72 14 12 14zm0-9c.3 0 .57.06.82.16l1.49-1.49C13.56 3.23 12.8 3 12 3c-1.66 0-3 1.34-3 3v2.17l3-3V5z"/>
          </svg>
        )}
      </div>
    </div>
  );
}

// ── GroupCallModal ────────────────────────────────────────────────────────────
export default function GroupCallModal({ groupId, groupName, callType, isInitiator, onEnd }) {
  const { user: currentUser } = useAuth();
  const { socket } = useSocketContext();

  const [callState, setCallState] = useState('joining'); // 'joining' | 'in-call' | 'error'
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === 'voice');
  const [callDuration, setCallDuration] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  // participants: Map<userId, userInfo>
  const [participants, setParticipants] = useState(new Map());
  // peerStreams: Map<userId, MediaStream>
  const [peerStreams, setPeerStreams] = useState(new Map());
  // localStream
  const [localStream, setLocalStream] = useState(null);

  // Refs (don't trigger re-renders)
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // userId → { pc, pendingCandidates[] }

  // ── Media ─────────────────────────────────────────────────────────────────
  const getMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: callType === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      setCallState('error');
      setErrorMsg(err.name === 'NotAllowedError'
        ? 'Zynk needs Microphone/Camera permissions for calls. Please allow in browser settings.'
        : `Could not access media: ${err.message}`);
      return null;
    }
  }, [callType]);

  // ── Create a peer connection for one remote participant ───────────────────
  const createPeer = useCallback((targetUserId) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track =>
        pc.addTrack(track, localStreamRef.current)
      );
    }

    // Remote tracks → store stream
    pc.ontrack = (event) => {
      const stream = event.streams?.[0] || (() => {
        const s = new MediaStream();
        s.addTrack(event.track);
        return s;
      })();
      setPeerStreams(prev => new Map(prev).set(targetUserId, stream));
    };

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('group_call_ice', { groupId, targetUserId, candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.warn(`[CALL] Peer ${targetUserId} disconnected`);
        setPeerStreams(prev => {
          const next = new Map(prev); next.delete(targetUserId); return next;
        });
      }
    };

    peersRef.current.set(targetUserId, { pc, pendingCandidates: [] });
    return pc;
  }, [socket, groupId]);

  // ── Offer to a specific peer (we are the "offerer") ──────────────────────
  const offerToPeer = useCallback(async (targetUserId) => {
    const pc = createPeer(targetUserId);
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: callType === 'video',
    });
    await pc.setLocalDescription(offer);
    socket.emit('group_call_offer', { groupId, targetUserId, offer });
  }, [createPeer, callType, socket, groupId]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    peersRef.current.forEach(({ pc }) => pc.close());
    peersRef.current.clear();
    setPeerStreams(new Map());
    setParticipants(new Map());
    setLocalStream(null);
  }, []);

  const handleLeave = useCallback(() => {
    socket?.emit('group_call_leave', { groupId });
    cleanup();
    onEnd();
  }, [socket, groupId, cleanup, onEnd]);

  // ── Socket event handlers ─────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // group_call_ready: we're in the call, here are existing participants
    const onReady = async ({ participants: existingList }) => {
      setCallState('in-call');
      const map = new Map();
      existingList.forEach(u => map.set(u.id, u));
      setParticipants(map);
      // Offer to every existing participant
      for (const userInfo of existingList) {
        await offerToPeer(userInfo.id);
      }
    };

    // group_call_participant_joined: a new peer joined, we offer to them
    const onParticipantJoined = async ({ userInfo }) => {
      setParticipants(prev => new Map(prev).set(userInfo.id, userInfo));
      await offerToPeer(userInfo.id);
      showToast(`${userInfo.display_name || userInfo.username} joined the call`, 'info');
    };

    // group_call_participant_left
    const onParticipantLeft = ({ userId }) => {
      setParticipants(prev => { const next = new Map(prev); next.delete(userId); return next; });
      setPeerStreams(prev => { const next = new Map(prev); next.delete(userId); return next; });
      const peer = peersRef.current.get(userId);
      if (peer) { peer.pc.close(); peersRef.current.delete(userId); }
    };

    // group_call_offer: incoming offer from a peer, create answer
    const onOffer = async ({ fromUserId, offer }) => {
      let peerData = peersRef.current.get(fromUserId);
      if (!peerData) {
        createPeer(fromUserId);
        peerData = peersRef.current.get(fromUserId);
      }
      const { pc, pendingCandidates } = peerData;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      for (const c of pendingCandidates) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }
      pendingCandidates.length = 0;
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('group_call_answer', { groupId, targetUserId: fromUserId, answer });
    };

    // group_call_answer: set remote description from answerer
    const onAnswer = async ({ fromUserId, answer }) => {
      const peerData = peersRef.current.get(fromUserId);
      if (!peerData) return;
      await peerData.pc.setRemoteDescription(new RTCSessionDescription(answer));
      for (const c of peerData.pendingCandidates) {
        await peerData.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }
      peerData.pendingCandidates.length = 0;
    };

    // group_call_ice: add ICE candidate
    const onIce = async ({ fromUserId, candidate }) => {
      const peerData = peersRef.current.get(fromUserId);
      if (!peerData) return;
      if (peerData.pc.remoteDescription?.type) {
        await peerData.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        peerData.pendingCandidates.push(candidate);
      }
    };

    const onFull = ({ max }) => {
      showToast(`Call is full (max ${max} participants)`, 'error');
      onEnd();
    };

    const onNotFound = () => {
      showToast('Call has already ended', 'info');
      onEnd();
    };

    socket.on('group_call_ready', onReady);
    socket.on('group_call_participant_joined', onParticipantJoined);
    socket.on('group_call_participant_left', onParticipantLeft);
    socket.on('group_call_offer', onOffer);
    socket.on('group_call_answer', onAnswer);
    socket.on('group_call_ice', onIce);
    socket.on('group_call_full', onFull);
    socket.on('group_call_not_found', onNotFound);

    return () => {
      socket.off('group_call_ready', onReady);
      socket.off('group_call_participant_joined', onParticipantJoined);
      socket.off('group_call_participant_left', onParticipantLeft);
      socket.off('group_call_offer', onOffer);
      socket.off('group_call_answer', onAnswer);
      socket.off('group_call_ice', onIce);
      socket.off('group_call_full', onFull);
      socket.off('group_call_not_found', onNotFound);
    };
  }, [socket, groupId, callType, createPeer, offerToPeer, onEnd]);

  // ── Mount: get media then join/start ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stream = await getMedia();
      if (!stream || cancelled) return;
      if (isInitiator) {
        socket?.emit('group_call_start', { groupId, callType });
      } else {
        socket?.emit('group_call_join', { groupId });
      }
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []); // intentionally run once on mount

  // ── Duration timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (callState !== 'in-call') return;
    const interval = setInterval(() => setCallDuration(d => d + 1), 1000);
    return () => clearInterval(interval);
  }, [callState]);

  const formatDuration = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Controls ──────────────────────────────────────────────────────────────
  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
  };

  const toggleVideo = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsVideoOff(!track.enabled); }
  };

  // ── Build participant grid (local + remote) ───────────────────────────────
  const allParticipants = [
    { userInfo: currentUser, stream: localStream, isLocal: true },
    ...[...participants.entries()].map(([uid, info]) => ({
      userInfo: info,
      stream: peerStreams.get(uid) || null,
      isLocal: false,
    })),
  ];

  const gridCols = allParticipants.length <= 1 ? 1
    : allParticipants.length <= 4 ? 2
    : 3;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#0d1b2a', zIndex: 9999,
      display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-family)',
      color: 'white'
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px', display: 'flex', alignItems: 'center',
        background: 'rgba(0,0,0,0.3)', gap: '12px', backdropFilter: 'blur(8px)'
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '16px' }}>
            {callType === 'video' ? '🎥' : '🎙️'} {groupName}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>
            {callState === 'joining'
              ? 'Connecting...'
              : `${allParticipants.length} participant${allParticipants.length !== 1 ? 's' : ''} · ${formatDuration(callDuration)}`}
          </div>
        </div>
      </div>

      {/* Error state */}
      {callState === 'error' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '20px', textAlign: 'center' }}>
          <svg viewBox="0 0 24 24" width="56" height="56" fill="#ff4d4d"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
          <div style={{ fontWeight: 600, fontSize: '18px' }}>Call Failed</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', maxWidth: '320px', lineHeight: 1.5 }}>{errorMsg}</div>
          <button onClick={onEnd} style={{ padding: '10px 24px', background: 'var(--accent-primary)', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 600, marginTop: '8px' }}>
            Close
          </button>
        </div>
      ) : (
        <>
          {/* Video / Audio grid */}
          <div style={{
            flex: 1, display: 'grid', padding: '12px', gap: '8px', overflowY: 'auto',
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            alignContent: 'start'
          }}>
            {allParticipants.map(({ userInfo, stream, isLocal }) => (
              <ParticipantTile
                key={isLocal ? 'local' : userInfo?.id}
                userInfo={userInfo}
                stream={stream}
                callType={callType}
                isLocal={isLocal}
                isMuted={isLocal ? isMuted : false}
                isVideoOff={isLocal ? isVideoOff : false}
              />
            ))}
          </div>

          {/* Controls bar */}
          <div style={{
            padding: '16px 24px', display: 'flex', justifyContent: 'center', gap: '16px',
            background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)'
          }}>
            {/* Mute */}
            <button onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}
              style={{ width: '52px', height: '52px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isMuted ? '#e53e3e' : 'rgba(255,255,255,0.15)', color: 'white' }}>
              {isMuted
                ? <svg viewBox="0 0 24 24" width="22" height="22" fill="white"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17l-9.15-9.15L4.41 3.44l3.12 3.12C7.2 7.23 7 8.09 7 9v2c0 2.76 2.24 5 5 5 .33 0 .66-.04.98-.1l1.56 1.56c-.83.34-1.72.54-2.54.54-3.87 0-7-3.13-7-7H3c0 4.42 3.28 8.06 7.5 8.76V23h3v-3.24c.73-.12 1.42-.35 2.06-.68l3.12 3.12 1.41-1.41-5.17-5.17zM12 14c-1.66 0-3-1.34-3-3V7.3l4.63 4.63C13.34 13.19 12.72 14 12 14zm0-9c.3 0 .57.06.82.16l1.49-1.49C13.56 3.23 12.8 3 12 3c-1.66 0-3 1.34-3 3v2.17l3-3V5z"/></svg>
                : <svg viewBox="0 0 24 24" width="22" height="22" fill="white"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>}
            </button>

            {/* Video toggle (video calls only) */}
            {callType === 'video' && (
              <button onClick={toggleVideo} title={isVideoOff ? 'Camera on' : 'Camera off'}
                style={{ width: '52px', height: '52px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isVideoOff ? '#e53e3e' : 'rgba(255,255,255,0.15)', color: 'white' }}>
                {isVideoOff
                  ? <svg viewBox="0 0 24 24" width="22" height="22" fill="white"><path d="M9.56 6.73L21.41 18.6c.35-.45.59-.97.59-1.6V7c0-1.1-.9-2-2-2h-8.83l.39.39zM3.44 2.12L2.03 3.53 5.2 6.7C5.07 6.8 5 6.9 5 7v10c0 1.1.9 2 2 2h10c.1 0 .2-.07.3-.2l3.17 3.17 1.41-1.41L3.44 2.12z"/></svg>
                  : <svg viewBox="0 0 24 24" width="22" height="22" fill="white"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>}
              </button>
            )}

            {/* End call */}
            <button onClick={handleLeave} title="Leave call"
              style={{ width: '52px', height: '52px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e53e3e', color: 'white' }}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="white" style={{ transform: 'rotate(135deg)' }}>
                <path d="M6.62 10.79a15.149 15.149 0 0 0 6.59 6.59l2.2-2.2c.28-.28.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
              </svg>
            </button>
          </div>
        </>
      )}

      <style>{`
        @keyframes callPulse {
          0% { box-shadow: 0 0 0 0 rgba(0,168,132,0.5); }
          70% { box-shadow: 0 0 0 14px rgba(0,168,132,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,168,132,0); }
        }
      `}</style>
    </div>
  );
}
