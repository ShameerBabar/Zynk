import React, { useState, useRef, useEffect } from 'react';
import { useSocketContext } from '../../context/SocketContext';
import { uploadFile } from '../../utils/api';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { useTheme } from '../../context/ThemeContext';
import CameraCaptureModal from './CameraCaptureModal';
import { showToast } from '../Common/Toast';
import './MessageInput.css';

export default function MessageInput({ conversationId }) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  
  // Voice Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const fileInputRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordIntervalRef = useRef(null);
  const localStreamRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const durationRef = useRef(0);
  
  const { theme } = useTheme();
  const { sendMessage, startTyping, stopTyping } = useSocketContext();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  const handleEmojiSelect = (emoji) => {
    setText(prev => prev + emoji.native);
  };

  const handleTextChange = (e) => {
    setText(e.target.value);
    
    // Typing indicator logic
    startTyping(conversationId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping(conversationId);
    }, 2000);
  };

  const handleSend = () => {
    if (!text.trim()) return;
    
    sendMessage({
      conversationId,
      content: text,
      type: 'text'
    });
    
    setText('');
    stopTyping(conversationId);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Voice recording handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      audioChunksRef.current = [];
      durationRef.current = 0;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length === 0) return;
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], `voice-message-${Date.now()}.webm`, { type: 'audio/webm' });
        
        // Stop stream tracks
        stream.getTracks().forEach(track => track.stop());

        // Upload and send
        setUploading(true);
        try {
          const uploadRes = await uploadFile(file);
          sendMessage({
            conversationId,
            type: 'audio',
            fileUrl: uploadRes.url,
            fileName: uploadRes.name,
            fileSize: uploadRes.size,
            content: durationRef.current.toString() // Send duration as content
          });
        } catch (err) {
          showToast('Failed to send voice message: ' + err.message, 'error');
        } finally {
          setUploading(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      recordIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const next = prev + 1;
          durationRef.current = next;
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error('Mic access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showToast('Microphone access denied. Please allow microphone permissions in settings.', 'error');
      } else {
        showToast('Failed to access microphone: ' + err.message, 'error');
      }
    }
  };

  const stopRecording = (shouldSend = true) => {
    if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (!shouldSend) {
        audioChunksRef.current = [];
      }
      mediaRecorderRef.current.stop();
    }
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    
    setIsRecording(false);
  };

  // Camera capture photo handler
  const handlePhotoCapture = async (blob) => {
    setShowCameraModal(false);
    setUploading(true);
    try {
      const file = new File([blob], `photo-${Date.now()}.jpeg`, { type: 'image/jpeg' });
      const uploadRes = await uploadFile(file);
      sendMessage({
        conversationId,
        type: 'image',
        fileUrl: uploadRes.url,
        fileName: uploadRes.name,
        fileSize: uploadRes.size
      });
    } catch (err) {
      showToast('Failed to upload captured photo: ' + err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500 * 1024 * 1024) {
      alert('File too large. Maximum size is 500 MB.');
      return;
    }

    setUploading(true);
    try {
      const data = await uploadFile(file);
      const isImage = file.type.startsWith('image/');
      
      sendMessage({
        conversationId,
        content: text || undefined,
        type: isImage ? 'image' : 'file',
        fileUrl: data.url,
        fileName: data.name,
        fileSize: data.size
      });
      setText('');
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatRecordTime = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="message-input-container" style={{ position: 'relative' }}>
      {showEmojiPicker && (
        <div ref={emojiPickerRef} style={{ position: 'absolute', bottom: '70px', left: '16px', zIndex: 1000 }}>
          <Picker 
            data={data} 
            onEmojiSelect={handleEmojiSelect}
            theme={theme}
          />
        </div>
      )}
      
      {showCameraModal && (
        <CameraCaptureModal 
          onClose={() => setShowCameraModal(false)} 
          onCapture={handlePhotoCapture} 
        />
      )}

      {isRecording ? (
        // Voice Message Recording Overlay
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '15px', padding: '0 10px', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, color: 'var(--accent-danger)' }}>
            <span style={{
              width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-danger)',
              animation: 'blink 1s infinite'
            }}></span>
            <span style={{ fontWeight: 500, fontSize: '15px' }}>Recording: {formatRecordTime(recordingTime)}</span>
          </div>
          
          <button 
            onClick={() => stopRecording(false)} 
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
          >
            Cancel
          </button>
          
          <button 
            onClick={() => stopRecording(true)} 
            style={{
              width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-primary)',
              border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
          </button>

          <style>{`
            @keyframes blink {
              0% { opacity: 1; }
              50% { opacity: 0.2; }
              100% { opacity: 1; }
            }
          `}</style>
        </div>
      ) : (
        // Normal Message Input Controls
        <>
          <div className="input-actions">
            <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} title="Emoji" disabled={uploading}>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm3.5 9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c-2.33 0-4.31-1.46-5.11-3.5h10.22c-.8 2.04-2.78 3.5-5.11 3.5z"></path></svg>
            </button>
            <button onClick={() => fileInputRef.current?.click()} title="Attach File" disabled={uploading}>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M21.58 12.58l-9-9a6.53 6.53 0 0 0-9.19 9.19l1.2 1.2 9 9a3.53 3.53 0 0 0 5-5l-1.2-1.2-9-9a.53.53 0 0 0-.71.71l9 9a2 2 0 0 1-2.83 2.83l-9-9a5 5 0 0 1 7.07-7.07l9 9a1 1 0 0 1-1.42 1.42z"></path></svg>
            </button>
            <button onClick={() => setShowCameraModal(true)} title="Take Photo" disabled={uploading}>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><circle cx="12" cy="12" r="3.2"/><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>
            </button>
            <input 
              type="file" 
              style={{ display: 'none' }} 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
            />
          </div>
          
          <div className="input-wrapper">
            <textarea
              placeholder={uploading ? "Processing upload..." : "Type a message"}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              disabled={uploading}
              rows={1}
            />
          </div>

          {text.trim() ? (
            <button className="send-btn" onClick={handleSend} disabled={uploading}>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
            </button>
          ) : (
            <button className="send-btn" onClick={startRecording} disabled={uploading} title="Record voice message">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}
