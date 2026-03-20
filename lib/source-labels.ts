/**
 * Shared source-type badge definitions used across uploads, jobs, and dashboard pages.
 * Keeps labels and colours consistent in one place.
 */

export type SourceType = 'manual' | 'agent' | 'sftp_poll';

export interface SourceBadge {
  label: string;
  colour: string;   // text / border tint base
  bg: string;       // background colour
  border: string;   // border colour
}

export const SOURCE_BADGES: Record<SourceType, SourceBadge> = {
  manual:    { label: 'Web',   colour: '#5B6E7C', bg: '#5B6E7C18', border: '#5B6E7C40' },
  agent:     { label: 'Agent', colour: '#0A4F92', bg: '#E6F4FF',   border: '#A3CFFF'   },
  sftp_poll: { label: 'SFTP',  colour: '#6B35A0', bg: '#F3F0FF',   border: '#DDD6FE'   },
};

export function getSourceBadge(sourceType: string | null | undefined): SourceBadge {
  return SOURCE_BADGES[(sourceType as SourceType) ?? 'manual'] ?? SOURCE_BADGES.manual;
}
