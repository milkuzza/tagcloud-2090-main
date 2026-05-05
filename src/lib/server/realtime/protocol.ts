import type { CloudWord } from '$lib/types/cloud';

export type ServerMsg =
  | { type: 'snapshot'; questionId: string; words: CloudWord[] }
  | { type: 'closed'; reason: 'expired' | 'sent' | 'failed' };

export type ClientMsg = { type: 'ping' };

export function encode(msg: ServerMsg): string {
  return JSON.stringify(msg);
}
