import { useState, useEffect, useCallback } from 'react';
import {
  Check,
  MessageSquare,
  ThumbsUp,
  Trash2,
  CornerDownRight,
  Clock,
  AlertCircle,
} from 'lucide-react';
import {
  getProjectVotes,
  submitProjectVote,
  listProjectComments,
  createProjectComment,
  deleteProjectComment,
  type CommentItem,
  type PreferredVoteChoice,
  type VoteCounts,
} from '../../lib/api/feedbackApi';

interface ReviewFeedbackSectionProps {
  projectId: string;
  token: string;
  currentTimeMs: number;
  durationMs: number;
  onSeek: (timestampMs: number) => void;
  feedbackEnabled: boolean;
}

function formatTimestamp(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function ReviewFeedbackSection({
  projectId,
  token,
  currentTimeMs,
  durationMs: _durationMs,
  onSeek,
  feedbackEnabled,
}: ReviewFeedbackSectionProps) {
  const [votes, setVotes] = useState<VoteCounts>({ original: 0, edited: 0, total: 0 });
  const [userVote, setUserVote] = useState<PreferredVoteChoice | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Form states
  const [displayName, setDisplayName] = useState(() => {
    try {
      return localStorage.getItem('switchroom_display_name') || '';
    } catch {
      return '';
    }
  });
  const [commentBody, setCommentBody] = useState('');
  const [attachTimestamp, setAttachTimestamp] = useState(true);
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');

  const loadFeedbackData = useCallback(async () => {
    try {
      const [voteRes, commentRes] = await Promise.all([
        getProjectVotes(projectId, token).catch(() => ({
          counts: { original: 0, edited: 0, total: 0 },
          userVote: null,
        })),
        listProjectComments(projectId, token).catch(() => ({
          comments: [],
          totalCount: 0,
        })),
      ]);

      setVotes(voteRes.counts);
      setUserVote(voteRes.userVote);
      setComments(commentRes.comments);
      setFeedbackError(null);
    } catch {
      // Graceful error state
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void loadFeedbackData();
    });
  }, [loadFeedbackData]);

  const saveDisplayName = (name: string) => {
    const trimmed = name.trim().slice(0, 50);
    setDisplayName(trimmed);
    try {
      localStorage.setItem('switchroom_display_name', trimmed);
    } catch {
      // LocalStorage access might be restricted
    }
  };

  const handleVote = async (choice: PreferredVoteChoice) => {
    if (!feedbackEnabled || submittingVote) return;
    setSubmittingVote(true);
    setFeedbackError(null);

    let effectiveName = displayName.trim();
    if (!effectiveName) {
      const prompted = window.prompt('Enter your name to submit your vote:');
      if (!prompted || !prompted.trim()) {
        setSubmittingVote(false);
        return;
      }
      effectiveName = prompted.trim().slice(0, 50);
      saveDisplayName(effectiveName);
    }

    try {
      const res = await submitProjectVote(projectId, choice, effectiveName, token);
      setUserVote(res.choice);
      setVotes(res.counts);
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to record vote');
    } finally {
      setSubmittingVote(false);
    }
  };

  const handleCreateComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackEnabled || submittingComment) return;

    const trimmedBody = commentBody.trim();
    if (!trimmedBody) return;

    const effectiveName = displayName.trim();
    if (!effectiveName) {
      setFeedbackError('Please enter your name to post a comment');
      return;
    }
    saveDisplayName(effectiveName);

    setSubmittingComment(true);
    setFeedbackError(null);

    const ts = attachTimestamp && currentTimeMs >= 0 ? currentTimeMs : null;

    try {
      await createProjectComment(
        projectId,
        {
          body: trimmedBody,
          timestampMs: ts,
          displayName: effectiveName,
        },
        token,
      );

      setCommentBody('');
      await loadFeedbackData();
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleCreateReply = async (parentCommentId: string) => {
    if (!feedbackEnabled || submittingComment) return;
    const trimmed = replyBody.trim();
    if (!trimmed) return;

    const effectiveName = displayName.trim();
    if (!effectiveName) {
      setFeedbackError('Please enter your name to reply');
      return;
    }
    saveDisplayName(effectiveName);

    setSubmittingComment(true);
    setFeedbackError(null);

    try {
      await createProjectComment(
        projectId,
        {
          body: trimmed,
          parentCommentId,
          displayName: effectiveName,
        },
        token,
      );

      setReplyBody('');
      setActiveReplyId(null);
      await loadFeedbackData();
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await deleteProjectComment(projectId, commentId);
      await loadFeedbackData();
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to delete comment');
    }
  };

  return (
    <div className="review-feedback" role="region" aria-label="Review feedback and discussion">
      <div className="review-feedback__header">
        <div className="review-feedback__title-group">
          <MessageSquare size={18} className="review-feedback__icon" aria-hidden="true" />
          <h2 className="review-feedback__heading">Client Review & Feedback</h2>
        </div>
      </div>

      {feedbackError && (
        <div className="review-notice review-notice--error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{feedbackError}</span>
        </div>
      )}

      {/* 1. Preferred Version Voting */}
      <div className="review-feedback__voting">
        <div className="review-feedback__subheading">
          <ThumbsUp size={16} aria-hidden="true" />
          <span>Which version do you prefer?</span>
        </div>

        {!feedbackEnabled && (
          <p className="review-feedback__disabled-notice">
            Feedback and preference voting are disabled for this review.
          </p>
        )}

        <div
          className="review-feedback__vote-buttons"
          role="group"
          aria-label="Vote preferred version"
        >
          <button
            type="button"
            className={`btn btn--vote ${userVote === 'original' ? 'btn--vote-active' : ''}`}
            disabled={!feedbackEnabled || submittingVote}
            onClick={() => handleVote('original')}
            aria-pressed={userVote === 'original'}
          >
            {userVote === 'original' && (
              <Check size={16} className="btn--vote-check" aria-hidden="true" />
            )}
            <span className="btn--vote-label">Original</span>
            <span className="btn--vote-count" aria-label={`${votes.original} votes`}>
              ({votes.original})
            </span>
          </button>

          <button
            type="button"
            className={`btn btn--vote ${userVote === 'edited' ? 'btn--vote-active' : ''}`}
            disabled={!feedbackEnabled || submittingVote}
            onClick={() => handleVote('edited')}
            aria-pressed={userVote === 'edited'}
          >
            {userVote === 'edited' && (
              <Check size={16} className="btn--vote-check" aria-hidden="true" />
            )}
            <span className="btn--vote-label">Edited</span>
            <span className="btn--vote-count" aria-label={`${votes.edited} votes`}>
              ({votes.edited})
            </span>
          </button>
        </div>
      </div>

      {/* 2. Comments and Discussion */}
      <div className="review-feedback__comments">
        <div className="review-feedback__subheading">
          <Clock size={16} aria-hidden="true" />
          <span>Timeline Notes & Discussion ({comments.length})</span>
        </div>

        {/* Comment input form */}
        {feedbackEnabled ? (
          <form onSubmit={handleCreateComment} className="comment-form">
            <div className="comment-form__author-row">
              <label htmlFor="feedback-display-name" className="visually-hidden">
                Your Name
              </label>
              <input
                id="feedback-display-name"
                type="text"
                placeholder="Your name or organization"
                value={displayName}
                onChange={(e) => saveDisplayName(e.target.value)}
                maxLength={50}
                className="comment-form__author-input"
                required
              />

              <button
                type="button"
                className={`pill-btn ${attachTimestamp ? 'pill-btn--active' : ''}`}
                onClick={() => setAttachTimestamp(!attachTimestamp)}
                title="Tag current timeline timestamp"
              >
                <Clock size={12} aria-hidden="true" />
                <span>
                  {attachTimestamp ? `@ ${formatTimestamp(currentTimeMs)}` : 'No timestamp'}
                </span>
              </button>
            </div>

            <div className="comment-form__input-group">
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Leave a note or timestamped comment on this section..."
                rows={3}
                maxLength={1000}
                className="comment-form__textarea"
                required
              />
              <div className="comment-form__footer">
                <span className="comment-form__char-count">{commentBody.length}/1000</span>
                <button
                  type="submit"
                  className="btn btn--sm btn--primary"
                  disabled={submittingComment || !commentBody.trim() || !displayName.trim()}
                >
                  {submittingComment ? 'Posting…' : 'Post comment'}
                </button>
              </div>
            </div>
          </form>
        ) : null}

        {/* Comments list */}
        <div className="comments-list">
          {loading ? (
            <p className="comments-list__empty">Loading feedback…</p>
          ) : comments.length === 0 ? (
            <p className="comments-list__empty">
              No comments yet. Listen through and leave feedback above.
            </p>
          ) : (
            comments.map((comment) => (
              <div
                key={comment.id}
                className={`comment-card ${comment.deleted ? 'comment-card--deleted' : ''}`}
              >
                <div className="comment-card__header">
                  <div className="comment-card__author-group">
                    <span className="comment-card__author-name">{comment.author.displayName}</span>
                    {comment.author.isCreator && (
                      <span className="role-badge role-badge--creator">Creator</span>
                    )}
                    {comment.timestampMs !== null && (
                      <button
                        type="button"
                        className="comment-card__timestamp-btn"
                        onClick={() => onSeek(comment.timestampMs!)}
                        title={`Jump to ${formatTimestamp(comment.timestampMs)}`}
                      >
                        <Clock size={12} aria-hidden="true" />
                        <span>{formatTimestamp(comment.timestampMs)}</span>
                      </button>
                    )}
                  </div>
                  <div className="comment-card__actions">
                    <span className="comment-card__time">
                      {formatRelativeTime(comment.createdAt)}
                    </span>
                    {comment.canDelete && (
                      <button
                        type="button"
                        className="icon-button icon-button--danger"
                        onClick={() => handleDeleteComment(comment.id)}
                        title="Delete comment"
                        aria-label="Delete comment"
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="comment-card__body">
                  <p>{comment.body}</p>
                </div>

                {/* Reply action button */}
                {feedbackEnabled && !comment.deleted && activeReplyId !== comment.id && (
                  <div className="comment-card__reply-action">
                    <button
                      type="button"
                      className="comment-card__reply-btn"
                      onClick={() => {
                        setActiveReplyId(comment.id);
                        setReplyBody('');
                      }}
                    >
                      <CornerDownRight size={13} aria-hidden="true" />
                      <span>Reply</span>
                    </button>
                  </div>
                )}

                {/* Inline reply form */}
                {activeReplyId === comment.id && (
                  <div className="comment-card__reply-form">
                    <input
                      type="text"
                      placeholder={`Reply to ${comment.author.displayName}…`}
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      maxLength={1000}
                      className="comment-form__author-input"
                    />
                    <div className="reply-form__actions">
                      <button
                        type="button"
                        className="btn btn--xs btn--secondary"
                        onClick={() => setActiveReplyId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn--xs btn--primary"
                        onClick={() => handleCreateReply(comment.id)}
                        disabled={!replyBody.trim()}
                      >
                        Reply
                      </button>
                    </div>
                  </div>
                )}

                {/* Replies thread (1-level) */}
                {comment.replies && comment.replies.length > 0 && (
                  <div className="replies-list">
                    {comment.replies.map((reply) => (
                      <div key={reply.id} className="reply-card">
                        <div className="comment-card__header">
                          <div className="comment-card__author-group">
                            <span className="comment-card__author-name">
                              {reply.author.displayName}
                            </span>
                            {reply.author.isCreator && (
                              <span className="role-badge role-badge--creator">Creator</span>
                            )}
                          </div>
                          <div className="comment-card__actions">
                            <span className="comment-card__time">
                              {formatRelativeTime(reply.createdAt)}
                            </span>
                            {reply.canDelete && (
                              <button
                                type="button"
                                className="icon-button icon-button--danger"
                                onClick={() => handleDeleteComment(reply.id)}
                                title="Delete reply"
                                aria-label="Delete reply"
                              >
                                <Trash2 size={12} aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="comment-card__body">
                          <p>{reply.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
