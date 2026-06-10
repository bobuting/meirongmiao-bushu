/**
 * realApi/announcement.ts - 公告 API
 */

import { request } from "../backendApi.request";
import type { Announcement } from "../../../../src/contracts/announcement-contract";

export interface RealAnnouncementApi {
  listAnnouncements(token: string): Promise<{ items: Announcement[] }>;
  listAdminAnnouncements(token: string): Promise<{ items: Announcement[] }>;
  createAnnouncement(token: string, data: { title: string; content: string; status?: string; sortOrder?: number }): Promise<{ item: Announcement }>;
  updateAnnouncement(token: string, id: string, data: { title?: string; content?: string; status?: string; sortOrder?: number }): Promise<{ item: Announcement }>;
  deleteAnnouncement(token: string, id: string): Promise<{ success: boolean }>;
}

export const announcementApi: RealAnnouncementApi = {
  /** 获取已发布公告 */
  listAnnouncements(token: string) {
    return request<{ items: Announcement[] }>("GET", "/announcements", { token });
  },

  /** 管理员：获取所有公告 */
  listAdminAnnouncements(token: string) {
    return request<{ items: Announcement[] }>("GET", "/admin/announcements", { token });
  },

  /** 管理员：创建公告 */
  createAnnouncement(token: string, data: { title: string; content: string; status?: string; sortOrder?: number }) {
    return request<{ item: Announcement }>("POST", "/admin/announcements", { token, body: data });
  },

  /** 管理员：更新公告 */
  updateAnnouncement(token: string, id: string, data: { title?: string; content?: string; status?: string; sortOrder?: number }) {
    return request<{ item: Announcement }>("PATCH", `/admin/announcements/${id}`, { token, body: data });
  },

  /** 管理员：删除公告 */
  deleteAnnouncement(token: string, id: string) {
    return request<{ success: boolean }>("DELETE", `/admin/announcements/${id}`, { token });
  },
};
