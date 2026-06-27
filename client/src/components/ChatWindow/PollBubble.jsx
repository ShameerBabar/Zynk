import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart2, CheckCircle2 } from 'lucide-react';
import { getFileUrl } from '../../utils/constants';
import './PollBubble.css';

function PollBubble({ poll, currentUserId, onVote }) {
  const [isVoting, setIsVoting] = useState(false);

  if (!poll || !poll.options) return null;

  const { id, question, allow_multiple, is_anonymous, is_closed, expires_at, options, votes } = poll;
  
  const hasExpired = expires_at && new Date(expires_at).getTime() < Date.now();
  const isInteractable = !is_closed && !hasExpired;

  // Calculate vote totals
  const totalVotes = votes.length;
  const maxVotes = options.reduce((max, opt) => {
    const count = votes.filter(v => v.option_id === opt.id).length;
    return count > max ? count : max;
  }, 0);

  const handleVote = async (optionId) => {
    if (!isInteractable || isVoting) return;

    const userVotes = votes.filter(v => v.user_id === currentUserId).map(v => v.option_id);
    let newOptionIds = [...userVotes];

    if (allow_multiple) {
      if (newOptionIds.includes(optionId)) {
        newOptionIds = newOptionIds.filter(id => id !== optionId);
      } else {
        newOptionIds.push(optionId);
      }
    } else {
      newOptionIds = [optionId];
    }

    setIsVoting(true);
    await onVote(id, newOptionIds);
    setIsVoting(false);
  };

  return (
    <div className="poll-bubble-container">
      <div className="poll-header">
        <div className="poll-icon">
          <BarChart2 size={14} />
        </div>
        <span className="poll-tag">POLL</span>
      </div>
      <h4 className="poll-question">{question}</h4>

      <div className="poll-options">
        {options.map((option) => {
          const optionVotes = votes.filter(v => v.option_id === option.id);
          const voteCount = optionVotes.length;
          const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
          const isWinning = voteCount === maxVotes && voteCount > 0;
          
          // Note: If is_anonymous is true, user_id might be undefined depending on backend format.
          // But we need to know if the current user voted. 
          // If anonymous, backend shouldn't send user_id, making 'hasVoted' local-state dependent ideally,
          // or backend returns current user's votes explicitly. 
          // For now, we rely on user_id if present.
          const hasVoted = optionVotes.some(v => v.user_id === currentUserId);

          return (
            <div 
              key={option.id} 
              className={`poll-option ${hasVoted ? 'voted' : ''} ${!isInteractable ? 'disabled' : 'interactive'}`}
              onClick={() => handleVote(option.id)}
            >
              <div className="poll-option-bg-container">
                <motion.div 
                  className={`poll-option-fill ${isWinning ? 'winning' : ''}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <div className="poll-option-content">
                <div className="poll-option-text-group">
                  <span className="poll-option-text">{option.text}</span>
                  {hasVoted && <CheckCircle2 size={14} className="voted-icon" />}
                  {voteCount > 0 && poll.is_anonymous !== 1 && (
                    <div className="poll-option-avatars">
                        {optionVotes.slice(0, 3).map((v) => (
                          v.avatar_url ? (
                            <img 
                              key={v.user_id} 
                              className="poll-avatar-img"
                              src={getFileUrl(v.avatar_url)} 
                              alt={v.display_name || v.username} 
                              title={v.display_name || v.username}
                            />
                          ) : (
                            <div 
                              key={v.user_id}
                              className="poll-avatar-img"
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}
                              title={v.display_name || v.username}
                            >
                              {(v.display_name || v.username || '?')[0].toUpperCase()}
                            </div>
                          )
                        ))}
                        {voteCount > 3 && (
                        <div className="poll-avatar-more">+{voteCount - 3}</div>
                      )}
                    </div>
                  )}
                </div>
                {totalVotes > 0 && (
                  <span className="poll-option-percent">
                    {voteCount > 0 ? `${percentage}%` : ''}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="poll-footer">
        <span>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</span>
        {is_closed === 1 && <span className="poll-badge">Closed</span>}
        {hasExpired && <span className="poll-badge">Expired</span>}
        {is_anonymous === 1 && <span className="poll-meta-bullet">• Anonymous</span>}
      </div>
    </div>
  );
}

export default PollBubble;
