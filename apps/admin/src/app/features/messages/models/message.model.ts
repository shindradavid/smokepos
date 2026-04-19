import { PaginationQuery } from '../../../shared/models/pagination.model';

export interface MessageParticipant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  photoUrl?: string | null;
}

export interface AdminMessage {
  id: string;
  subject: string;
  body: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
  sender: MessageParticipant;
  recipient: MessageParticipant;
}

export interface CreateMessageDto {
  recipientId: string;
  subject: string;
  body: string;
}

export interface MessagesQuery extends PaginationQuery {
  unreadOnly?: boolean;
}

export interface MessageUnreadCount {
  unread: number;
}
