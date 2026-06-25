import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Settings, BarChart2, Clock } from 'lucide-react';
import './CreatePollModal.css';

function CreatePollModal({ isOpen, onClose, onSubmit }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [allowChange, setAllowChange] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [expiresIn, setExpiresIn] = useState('0'); // '0' means no expiration

  if (!isOpen) return null;

  const handleAddOption = () => {
    if (options.length < 10) {
      setOptions([...options, '']);
    }
  };

  const handleOptionChange = (index, value) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleRemoveOption = (index) => {
    if (options.length > 2) {
      const newOptions = options.filter((_, i) => i !== index);
      setOptions(newOptions);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validOptions = options.filter(opt => opt.trim() !== '');
    if (question.trim() && validOptions.length >= 2) {
      const expiresInMs = expiresIn === '0' ? null : parseInt(expiresIn) * 1000;
      
      onSubmit({
        question: question.trim(),
        options: validOptions,
        allowMultiple,
        isAnonymous,
        allowChange,
        expiresInMs
      });
      // Reset state after submit
      setQuestion('');
      setOptions(['', '']);
      setAllowMultiple(false);
      setIsAnonymous(false);
      setAllowChange(true);
      setShowSettings(false);
      setExpiresIn('0');
    }
  };

  const isSubmitDisabled = !question.trim() || options.filter(o => o.trim() !== '').length < 2;

  return (
    <AnimatePresence>
      <motion.div 
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div 
          className="modal-content poll-modal glass"
          initial={{ y: 50, scale: 0.95, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 20, scale: 0.95, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
          <div className="modal-header">
            <div className="modal-title">
              <BarChart2 size={20} className="text-teal" />
              <h3>Create Poll</h3>
            </div>
            <button className="icon-button close-button" onClick={onClose}>
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="poll-form">
            <div className="form-group">
              <label>Question</label>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question..."
                className="form-input"
                autoFocus
              />
            </div>

            <div className="options-container">
              <label>Options</label>
              {options.map((option, index) => (
                <motion.div 
                  key={index} 
                  className="poll-option-input"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    placeholder={`Option ${index + 1}`}
                    className="form-input"
                  />
                  {options.length > 2 && (
                    <button 
                      type="button" 
                      className="remove-option-btn" 
                      onClick={() => handleRemoveOption(index)}
                      title="Remove option"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </motion.div>
              ))}
              
              {options.length < 10 && (
                <button type="button" className="add-option-btn interactive" onClick={handleAddOption}>
                  <Plus size={16} /> Add Option
                </button>
              )}
            </div>

            <div className="poll-settings-toggle">
              <button 
                type="button" 
                className="settings-toggle-btn"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings size={16} />
                {showSettings ? 'Hide Settings' : 'Poll Settings'}
              </button>
            </div>

            <AnimatePresence>
              {showSettings && (
                <motion.div 
                  className="poll-settings"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Allow multiple answers</span>
                      <span className="setting-desc">Voters can select more than one option</span>
                    </div>
                    <label className="toggle-switch">
                      <input 
                        type="checkbox" 
                        checked={allowMultiple}
                        onChange={(e) => setAllowMultiple(e.target.checked)} 
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                  
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Anonymous voting</span>
                      <span className="setting-desc">Hide who voted for what</span>
                    </div>
                    <label className="toggle-switch">
                      <input 
                        type="checkbox" 
                        checked={isAnonymous}
                        onChange={(e) => setIsAnonymous(e.target.checked)} 
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label">Allow changing vote</span>
                      <span className="setting-desc">Voters can change their answer later</span>
                    </div>
                    <label className="toggle-switch">
                      <input 
                        type="checkbox" 
                        checked={allowChange}
                        onChange={(e) => setAllowChange(e.target.checked)} 
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                  
                  <div className="setting-divider"></div>
                  
                  <div className="setting-row expiration-row">
                    <div className="setting-info">
                      <span className="setting-label" style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <Clock size={14} /> Poll Expiration
                      </span>
                      <span className="setting-desc">When should this poll end?</span>
                    </div>
                    <div className="expiration-pills">
                      {[
                        { label: 'Never', value: '0' },
                        { label: '1H', value: '3600' },
                        { label: '6H', value: '21600' },
                        { label: '24H', value: '86400' },
                        { label: '1W', value: '604800' }
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`expiration-pill ${expiresIn === opt.value ? 'active' : ''}`}
                          onClick={() => setExpiresIn(opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="modal-footer">
              <button type="button" className="btn-secondary interactive" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-primary interactive" disabled={isSubmitDisabled}>Create Poll</button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default CreatePollModal;
