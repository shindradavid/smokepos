import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { PaginatedResponse } from '../../../shared/models/pagination.model';
import {
  AdminMessage,
  CreateMessageDto,
  MessageParticipant,
  MessagesQuery,
  MessageUnreadCount,
} from '../models/message.model';

@Injectable({
  providedIn: 'root',
})
export class MessagesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/messages`;

  getInbox(query: MessagesQuery): Observable<PaginatedResponse<AdminMessage>> {
    let params = new HttpParams()
      .set('page', query.page.toString())
      .set('limit', query.limit.toString());

    if (query.search) {
      params = params.set('search', query.search);
    }

    if (query.unreadOnly) {
      params = params.set('unreadOnly', 'true');
    }

    return this.http.get<PaginatedResponse<AdminMessage>>(`${this.apiUrl}/inbox`, { params });
  }

  getSent(query: MessagesQuery): Observable<PaginatedResponse<AdminMessage>> {
    let params = new HttpParams()
      .set('page', query.page.toString())
      .set('limit', query.limit.toString());

    if (query.search) {
      params = params.set('search', query.search);
    }

    return this.http.get<PaginatedResponse<AdminMessage>>(`${this.apiUrl}/sent`, { params });
  }

  getMessage(id: string): Observable<AdminMessage> {
    return this.http.get<AdminMessage>(`${this.apiUrl}/${id}`);
  }

  createMessage(data: CreateMessageDto): Observable<AdminMessage> {
    return this.http.post<AdminMessage>(this.apiUrl, data);
  }

  markAsRead(id: string): Observable<AdminMessage> {
    return this.http.patch<AdminMessage>(`${this.apiUrl}/${id}/read`, {});
  }

  getUnreadCount(): Observable<MessageUnreadCount> {
    return this.http.get<MessageUnreadCount>(`${this.apiUrl}/unread-count`);
  }

  getStaffOptions(search?: string): Observable<MessageParticipant[]> {
    let params = new HttpParams();

    if (search?.trim()) {
      params = params.set('search', search.trim());
    }

    return this.http.get<MessageParticipant[]>(`${this.apiUrl}/staff-options`, { params });
  }
}
