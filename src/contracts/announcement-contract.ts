/**
 * announcement-contract.ts
 * 系统公告类型定义
 */

export type AnnouncementStatus = 'draft' | 'published' | 'archived';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  status: AnnouncementStatus;
  publishedAt: number | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}
