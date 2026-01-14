export interface User {
  id: string;
  username: string;
  email: string;
  mobile: string;
  uniqueCode: string;
  name: string;
  avatar?: string;
  isVerified: boolean;
  privacySettings: PrivacySettings;
  subscription: Subscription;
  createdAt: string;
}

export interface PrivacySettings {
  allowMobileDiscovery: boolean;
  allowUsernameDiscovery: boolean;
  inviteOnly: boolean;
  showOnlineStatus: boolean;
  showLastSeen: boolean;
}

export interface Subscription {
  plan: 'free' | 'premium' | 'family' | 'business';
  storageLimit: number; // in MB
  usedStorage: number; // in MB
  expiresAt?: string;
}

export interface Theme {
  id: string;
  name: string;
  displayName: string;
  icon: string;
  color: string;
  description: string;
  unlockTrigger: UnlockTrigger;
}

export interface UnlockTrigger {
  type: 'sliders' | 'tap_sequence' | 'long_press' | 'shake';
  config: any;
}

export type MessageStatus = 'pending' | 'sending' | 'sent' | 'delivered' | 'read';

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  receiverId: string;
  type: 'text' | 'image' | 'video' | 'voice' | 'document';
  content: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  fileSize?: number;
  fileName?: string;
  isViewOnce: boolean;
  autoDeleteAfter?: number; // hours
  isDeleted: boolean;
  status: MessageStatus;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
}

export interface Chat {
  id: string;
  participantIds: string[];
  lastMessage?: Message;
  unreadCount: number;
  isBlocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  userId?: string; // If user has app
  name: string;
  phoneNumber?: string;
  email?: string;
  avatar?: string;
  isAppUser: boolean;
  isInvited: boolean;
  qrCode?: string;
  createdAt: string;
}

export interface VaultItem {
  id: string;
  type: 'photo' | 'video' | 'document';
  name: string;
  path: string;
  thumbnailPath?: string;
  size: number;
  mimeType: string;
  createdAt: string;
  tags?: string[];
  isEncrypted: boolean;
}

export interface BackupSettings {
  chats: boolean;
  vault: boolean;
  cloudProvider?: 'google_drive' | 'icloud';
  lastBackupAt?: string;
}

export interface SecuritySettings {
  appPassword?: string; // Optional - only if password is enabled
  fakePassword?: string;
  autoLockEnabled: boolean;
  autoLockDelay: number; // seconds
  breakInAlertEnabled: boolean;
  screenshotBlocking: boolean;
  screenRecordingDetection: boolean;
  unlockMethod: 'password' | 'biometric' | 'both';
  appVisible: boolean; // Show/hide app from launcher
  phoneTriggerEnabled: boolean;
  phoneTriggerNumber?: string; // e.g., "1234"
  passwordEnabled: boolean; // Enable/disable password unlock
}

export interface Call {
  id: string;
  type: 'voice' | 'video';
  participantIds: string[];
  status: 'initiated' | 'ringing' | 'active' | 'ended' | 'missed';
  duration?: number;
  startedAt: string;
  endedAt?: string;
}

