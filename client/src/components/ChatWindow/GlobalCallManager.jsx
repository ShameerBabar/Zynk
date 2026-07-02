import React from 'react';
import { useSocketContext } from '../../context/SocketContext';
import CallModal from './CallModal';
import GroupCallModal from './GroupCallModal';
import ActiveCallBanner from './ActiveCallBanner';
import { motion, AnimatePresence } from 'framer-motion';

export default function GlobalCallManager() {
  const { 
    activeCallData, setActiveCallData,
    activeGroupCall, setActiveGroupCall,
    incomingGroupCall, setIncomingGroupCall,
    isCallModalOpen, setIsCallModalOpen,
    isGroupCallModalOpen, setIsGroupCallModalOpen
  } = useSocketContext();

  return (
    <>
      <AnimatePresence>
        {/* Banner when call is active but modal is closed */}
        {activeCallData && !isCallModalOpen && (
          <ActiveCallBanner 
            callerName={activeCallData.otherUser?.display_name || activeCallData.otherUser?.username} 
            callType={activeCallData.type}
            onOpenCall={() => setIsCallModalOpen(true)} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeGroupCall && !isGroupCallModalOpen && (
          <ActiveCallBanner 
            callerName={activeGroupCall.groupName} 
            callType={activeGroupCall.callType}
            isGroup={true}
            onOpenCall={() => setIsGroupCallModalOpen(true)} 
          />
        )}
      </AnimatePresence>

      {activeCallData && isCallModalOpen && (
        <CallModal 
          callData={activeCallData} 
          onCallEnd={() => {
            setActiveCallData(null);
            setIsCallModalOpen(false);
          }} 
          onMinimize={() => setIsCallModalOpen(false)}
        />
      )}

      {activeGroupCall && isGroupCallModalOpen && (
        <GroupCallModal
          groupId={activeGroupCall.groupId}
          groupName={activeGroupCall.groupName}
          callType={activeGroupCall.callType}
          isInitiator={activeGroupCall.isInitiator}
          onEnd={() => {
            setActiveGroupCall(null);
            setIsGroupCallModalOpen(false);
          }}
          onMinimize={() => setIsGroupCallModalOpen(false)}
        />
      )}

      {incomingGroupCall && !activeGroupCall && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #1a2a1f, #0d1f16)',
          border: '1px solid rgba(0,168,132,0.4)',
          padding: '16px 24px', borderRadius: '16px', zIndex: 9998,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', gap: '20px', color: 'white',
          minWidth: '300px', maxWidth: '420px'
        }}>
          <div style={{ fontSize: '36px' }}>
            {incomingGroupCall.callType === 'video' ? '🎥' : '🎤'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold', fontSize: '15px' }}>
              {incomingGroupCall.callerName} started a {incomingGroupCall.callType === 'video' ? 'video' : 'voice'} call
            </div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)', marginTop: '2px' }}>
              in {incomingGroupCall.groupName}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={() => setIncomingGroupCall(null)}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.12)', color: 'white', cursor: 'pointer', fontWeight: 500 }}
            >
              Dismiss
            </button>
            <button 
              onClick={() => {
                setIncomingGroupCall(null);
                setActiveGroupCall({ ...incomingGroupCall, isInitiator: false });
                setIsGroupCallModalOpen(true);
              }}
              style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: 'var(--online-color)', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Join
            </button>
          </div>
        </div>
      )}
    </>
  );
}
