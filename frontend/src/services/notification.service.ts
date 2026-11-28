import { apiClient } from "./apiClient";

export type NotificationCategory = "all" | "security" | "platform";

export type NotificationSeverity = "critical" | "high" | "medium" | "info";

export interface PlatformNotificationItem {
  id: string;
  category: Exclude<NotificationCategory, "all">;
  severity: NotificationSeverity;
  title: string;
  message: string;
  timestamp: string;
  action: string;
  entity: string;
}

export interface PlatformNotificationsResponse {
  items: PlatformNotificationItem[];
  summary: {
    total: number;
    security: number;
    platform: number;
    critical: number;
    high: number;
  };
}

export const notificationService = {
  getNotifications: (params?: {
    category?: NotificationCategory;
    search?: string;
    limit?: number;
    hours?: number;
  }) =>
    apiClient.get<PlatformNotificationsResponse>("/notifications", { params }),
};