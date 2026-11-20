import { describe, it, expect, beforeEach } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env, ProjectRow, ParticipantRow } from '../types';
import {
  resolveParticipant,
  submitVote,
  getParticipantVote,
  createComment,
  listComments,
  deleteComment,
} from './feedback';

class MockD1PreparedStatement {
  private bindings: unknown[] = [];

  constructor(
    private sql: string,
    private dbState: {
      participants: ParticipantRow[];
      preferred_votes: {
        id: string;
        project_id: string;
        participant_id: string;
        choice: 'original' | 'edited';
        created_at: number;
        updated_at: number;
      }[];
      comments: {
        id: string;
        project_id: string;
        participant_id: string;
        parent_comment_id: string | null;
        timestamp_ms: number | null;
        body: string;
        created_at: number;
        updated_at: number;
        deleted_at: number | null;
      }[];
    },
  ) {}

  bind(...values: unknown[]) {
    this.bindings = values;
    return this;
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const res = await this.all<T>();
    return res.results[0] || null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    const normSql = this.sql.replace(/\s+/g, ' ').trim();

    if (normSql.includes('FROM participants WHERE project_id = ? AND user_id = ?')) {
      const [projId, userId] = this.bindings;
      const found = this.dbState.participants.find(
        (p) => p.project_id === projId && p.user_id === userId,
      );
      return { results: (found ? [found] : []) as T[] };
    }

    if (normSql.includes('FROM participants WHERE project_id = ? AND guest_token_hash = ?')) {
      const [projId, hash] = this.bindings;
      const found = this.dbState.participants.find(
        (p) => p.project_id === projId && p.guest_token_hash === hash,
      );
      return { results: (found ? [found] : []) as T[] };
    }

    if (normSql.includes('FROM participants WHERE id = ?')) {
      const [id] = this.bindings;
      const found = this.dbState.participants.find((p) => p.id === id);
      return { results: (found ? [found] : []) as T[] };
    }

    if (normSql.includes('FROM preferred_votes WHERE project_id = ? AND participant_id = ?')) {
      const [projId, partId] = this.bindings;
      const found = this.dbState.preferred_votes.find(
        (v) => v.project_id === projId && v.participant_id === partId,
      );
      return { results: (found ? [found] : []) as T[] };
    }

    if (normSql.includes('FROM preferred_votes WHERE project_id = ?')) {
      const [projId] = this.bindings;
      const votes = this.dbState.preferred_votes.filter((v) => v.project_id === projId);
      const original = votes.filter((v) => v.choice === 'original').length;
      const edited = votes.filter((v) => v.choice === 'edited').length;
      return { results: [{ original, edited, total: votes.length }] as T[] };
    }

    if (normSql.includes('FROM comments WHERE id = ? AND project_id = ?')) {
      const [id, projId] = this.bindings;
      const found = this.dbState.comments.find(
        (c) => c.id === id && c.project_id === projId && c.deleted_at === null,
      );
      return { results: (found ? [found] : []) as T[] };
    }

    if (
      normSql.includes(
        'FROM comments c JOIN participants p ON c.participant_id = p.id WHERE c.project_id = ?',
      )
    ) {
      const [projId] = this.bindings;
      const comments = this.dbState.comments
        .filter((c) => c.project_id === projId)
        .map((c) => {
          const p = this.dbState.participants.find((pt) => pt.id === c.participant_id);
          return {
            ...c,
            display_name: p?.display_name || 'Anonymous',
            user_id: p?.user_id || null,
            guest_token_hash: p?.guest_token_hash || null,
          };
        });
      return { results: comments as T[] };
    }

    return { results: [] };
  }

  async run(): Promise<{ success: boolean }> {
    const sql = this.sql.trim();

    if (sql.startsWith('INSERT INTO participants')) {
      const [id, project_id, extra1, extra2, created_at, last_seen_at] = this.bindings;
      const isUser = sql.includes('user_id');
      this.dbState.participants.push({
        id: id as string,
        project_id: project_id as string,
        user_id: isUser ? (extra1 as string) : null,
        guest_token_hash: isUser ? null : (extra1 as string),
        display_name: extra2 as string,
        created_at: created_at as number,
        last_seen_at: last_seen_at as number,
      });
    }

    if (sql.startsWith('INSERT INTO preferred_votes')) {
      const [id, project_id, participant_id, choice, created_at, updated_at] = this.bindings;
      const existingIdx = this.dbState.preferred_votes.findIndex(
        (v) => v.project_id === project_id && v.participant_id === participant_id,
      );
      if (existingIdx >= 0) {
        this.dbState.preferred_votes[existingIdx]!.choice = choice as 'original' | 'edited';
        this.dbState.preferred_votes[existingIdx]!.updated_at = updated_at as number;
      } else {
        this.dbState.preferred_votes.push({
          id: id as string,
          project_id: project_id as string,
          participant_id: participant_id as string,
          choice: choice as 'original' | 'edited',
          created_at: created_at as number,
          updated_at: updated_at as number,
        });
      }
    }

    if (sql.startsWith('INSERT INTO comments')) {
      const [
        id,
        project_id,
        participant_id,
        parent_comment_id,
        timestamp_ms,
        body,
        created_at,
        updated_at,
      ] = this.bindings;
      this.dbState.comments.push({
        id: id as string,
        project_id: project_id as string,
        participant_id: participant_id as string,
        parent_comment_id: (parent_comment_id as string) || null,
        timestamp_ms: (timestamp_ms as number) ?? null,
        body: body as string,
        created_at: created_at as number,
        updated_at: updated_at as number,
        deleted_at: null,
      });
    }

    if (sql.startsWith('UPDATE comments SET deleted_at = ?')) {
      const [deleted_at, _emptyBody, _now, commentId] = this.bindings;
      const c = this.dbState.comments.find((comm) => comm.id === commentId);
      if (c) {
        c.deleted_at = deleted_at as number;
        c.body = '';
      }
    }

    return { success: true };
  }
}

class MockD1Database {
  state = {
    participants: [] as ParticipantRow[],
    preferred_votes: [] as {
      id: string;
      project_id: string;
      participant_id: string;
      choice: 'original' | 'edited';
      created_at: number;
      updated_at: number;
    }[],
    comments: [] as {
      id: string;
      project_id: string;
      participant_id: string;
      parent_comment_id: string | null;
      timestamp_ms: number | null;
      body: string;
      created_at: number;
      updated_at: number;
      deleted_at: number | null;
    }[],
  };

  prepare(sql: string) {
    return new MockD1PreparedStatement(sql, this.state);
  }
}

describe('feedback service for Switchroom v0.7.0', () => {
  let mockDb: MockD1Database;
  let mockEnv: Env;
  let sampleProject: ProjectRow;

  beforeEach(() => {
    mockDb = new MockD1Database();
    mockEnv = {
      DB: mockDb as unknown as D1Database,
      AUDIO_BUCKET: {} as unknown as Env['AUDIO_BUCKET'],
    };
    sampleProject = {
      id: 'proj_test123',
      owner_user_id: 'user_creator',
      owner_capability_hash: null,
      title: 'Demo Mix',
      description: 'Review track',
      status: 'ready',
      visibility: 'private',
      sharing_visibility: 'unlisted',
      retention_days: 30,
      crossfade_ms: 180,
      presentation_layout: 'standard',
      created_at: Date.now() - 1000,
      updated_at: Date.now() - 1000,
      expires_at: Date.now() + 86400000,
      deleted_at: null,
      public_indexing_enabled: 0,
      password_hash: null,
      feedback_enabled: 1,
      downloads_enabled: 0,
    };
  });

  describe('participant identity resolution', () => {
    it('resolves creator participant for project owner', async () => {
      const res = await resolveParticipant(mockEnv, sampleProject, {
        isOwner: true,
        authUserId: 'user_creator',
        authUserName: 'Mastering Engineer',
      });

      expect(res.isCreator).toBe(true);
      expect(res.participant).not.toBeNull();
      expect(res.participant?.display_name).toBe('Mastering Engineer');
    });

    it('resolves authenticated client participant and prevents owner impersonation', async () => {
      const res = await resolveParticipant(mockEnv, sampleProject, {
        isOwner: false,
        authUserId: 'user_client1',
        authUserName: 'Client Alice',
      });

      expect(res.isCreator).toBe(false);
      expect(res.participant?.display_name).toBe('Client Alice');
    });

    it('registers guest participant with display name and sets secure cookie', async () => {
      const res = await resolveParticipant(mockEnv, sampleProject, {
        isOwner: false,
        displayName: 'Guest Reviewer Bob',
      });

      expect(res.isCreator).toBe(false);
      expect(res.participant?.display_name).toBe('Guest Reviewer Bob');
      expect(res.guestSecret).toBeDefined();
      expect(res.cookieToSet).toBeDefined();
      expect(res.cookieToSet?.name).toContain('switchroom_partic_');
    });

    it('rejects empty or whitespace-only display names', async () => {
      await expect(
        resolveParticipant(mockEnv, sampleProject, {
          isOwner: false,
          displayName: '   ',
        }),
      ).rejects.toThrow('Display name must be between 1 and 50 characters');
    });
  });

  describe('preferred version votes', () => {
    it('records vote, handles changed choice idempotently, and updates aggregate counts', async () => {
      const partRes = await resolveParticipant(mockEnv, sampleProject, {
        isOwner: false,
        displayName: 'Voter 1',
      });
      const participant = partRes.participant!;

      // 1. First vote: original
      const vote1 = await submitVote(mockEnv, sampleProject, participant, 'original');
      expect(vote1.choice).toBe('original');
      expect(vote1.counts).toEqual({ original: 1, edited: 0, total: 1 });

      const currentVote1 = await getParticipantVote(mockEnv.DB, sampleProject.id, participant.id);
      expect(currentVote1).toBe('original');

      // 2. Change vote to edited (idempotent update, not double counted)
      const vote2 = await submitVote(mockEnv, sampleProject, participant, 'edited');
      expect(vote2.choice).toBe('edited');
      expect(vote2.counts).toEqual({ original: 0, edited: 1, total: 1 });

      const currentVote2 = await getParticipantVote(mockEnv.DB, sampleProject.id, participant.id);
      expect(currentVote2).toBe('edited');

      // 3. Second participant votes original
      const part2 = (
        await resolveParticipant(mockEnv, sampleProject, {
          isOwner: false,
          displayName: 'Voter 2',
        })
      ).participant!;

      const vote3 = await submitVote(mockEnv, sampleProject, part2, 'original');
      expect(vote3.counts).toEqual({ original: 1, edited: 1, total: 2 });
    });

    it('rejects votes when feedback is disabled without deleting history', async () => {
      sampleProject.feedback_enabled = 0;
      const partRes = await resolveParticipant(mockEnv, sampleProject, {
        isOwner: false,
        displayName: 'Voter',
      });

      await expect(
        submitVote(mockEnv, sampleProject, partRes.participant!, 'original'),
      ).rejects.toThrow('Feedback is disabled for this project');
    });
  });

  describe('timestamped comments and single-level replies', () => {
    it('creates root comments and single-level replies with creator attribution', async () => {
      const client = (
        await resolveParticipant(mockEnv, sampleProject, {
          isOwner: false,
          displayName: 'Client Reviewer',
        })
      ).participant!;

      const creator = (
        await resolveParticipant(mockEnv, sampleProject, {
          isOwner: true,
          authUserId: 'user_creator',
          authUserName: 'Producer',
        })
      ).participant!;

      // 1. Client creates timestamped root comment
      const root = await createComment(mockEnv, sampleProject, client, {
        timestampMs: 14500, // 14.5 seconds
        body: 'Bass feels slightly loud here at the transition',
      });

      expect(root.timestampMs).toBe(14500);
      expect(root.body).toBe('Bass feels slightly loud here at the transition');
      expect(root.author.isCreator).toBe(false);

      // 2. Creator replies to the root comment
      const reply = await createComment(
        mockEnv,
        sampleProject,
        creator,
        {
          body: 'Good catch, lowered by 1.5 dB in the edited version',
          parentCommentId: root.id,
        },
        true,
      );

      expect(reply.author.isCreator).toBe(true);

      // 3. List comments and verify nested structure
      const list = await listComments(mockEnv.DB, sampleProject, client.id, false);
      expect(list.comments).toHaveLength(1);
      expect(list.comments[0]!.id).toBe(root.id);
      expect(list.comments[0]!.replies).toHaveLength(1);
      expect(list.comments[0]!.replies[0]!.id).toBe(reply.id);

      // 4. Enforce single-level reply rule: cannot reply to a reply
      await expect(
        createComment(mockEnv, sampleProject, client, {
          body: 'Trying to nest a reply under a reply',
          parentCommentId: reply.id,
        }),
      ).rejects.toThrow('Replies cannot be nested; reply to the root comment instead');
    });

    it('enforces body validation and non-negative integer timestamps', async () => {
      const client = (
        await resolveParticipant(mockEnv, sampleProject, {
          isOwner: false,
          displayName: 'Client',
        })
      ).participant!;

      await expect(createComment(mockEnv, sampleProject, client, { body: '   ' })).rejects.toThrow(
        'Comment body cannot be empty',
      );

      await expect(
        createComment(mockEnv, sampleProject, client, { body: 'Test', timestampMs: -500 }),
      ).rejects.toThrow('Timestamp must be a non-negative integer in milliseconds');
    });

    it('soft deletes comments preserving thread structure', async () => {
      const client = (
        await resolveParticipant(mockEnv, sampleProject, {
          isOwner: false,
          displayName: 'Client',
        })
      ).participant!;

      const creator = (
        await resolveParticipant(mockEnv, sampleProject, {
          isOwner: true,
          authUserId: 'user_creator',
        })
      ).participant!;

      const root = await createComment(mockEnv, sampleProject, client, {
        body: 'Initial observation',
      });

      await createComment(
        mockEnv,
        sampleProject,
        creator,
        {
          body: 'Creator answer',
          parentCommentId: root.id,
        },
        true,
      );

      // Creator moderates / deletes root comment
      await deleteComment(mockEnv.DB, sampleProject, root.id, creator.id, true);

      const list = await listComments(mockEnv.DB, sampleProject, client.id, false);
      expect(list.comments).toHaveLength(1);
      expect(list.comments[0]!.deleted).toBe(true);
      expect(list.comments[0]!.body).toBe('[Comment deleted]');
      expect(list.comments[0]!.replies).toHaveLength(1);
    });
  });
});
