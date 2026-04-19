import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { CheckboxModule } from 'primeng/checkbox';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';

import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { DEFAULT_LIMIT, PaginationMeta } from '../../../../shared/models/pagination.model';
import { AuthService } from '../../../../core/services/auth.service';
import { SidebarBadgeService } from '../../../../core/services/sidebar-badge.service';
import { MessagesService } from '../../services/messages.service';
import { AdminMessage, MessageParticipant } from '../../models/message.model';

@Component({
  selector: 'app-messages-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    DialogModule,
    ToastModule,
    CheckboxModule,
    TagModule,
    PageHeaderComponent,
  ],
  providers: [MessageService],
  templateUrl: './messages-page.component.html',
  styleUrl: './messages-page.component.scss',
})
export class MessagesPageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly messagesService = inject(MessagesService);
  private readonly badgeService = inject(SidebarBadgeService);
  private readonly messageService = inject(MessageService);

  readonly activeMailbox = signal<'inbox' | 'sent'>('inbox');
  readonly inboxMessages = signal<AdminMessage[]>([]);
  readonly sentMessages = signal<AdminMessage[]>([]);
  readonly inboxPagination = signal<PaginationMeta>({
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 1,
  });
  readonly sentPagination = signal<PaginationMeta>({
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 1,
  });
  readonly selectedMessage = signal<AdminMessage | null>(null);
  readonly recipientOptions = signal<MessageParticipant[]>([]);
  readonly isMailboxLoading = signal(false);
  readonly isSending = signal(false);
  readonly isRecipientsLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showComposeDialog = signal(false);

  searchTerm = '';
  unreadOnly = false;

  readonly canCompose = computed(() => this.authService.hasPermission('message.create'));
  readonly currentMessages = computed(() =>
    this.activeMailbox() === 'inbox' ? this.inboxMessages() : this.sentMessages()
  );
  readonly currentPagination = computed(() =>
    this.activeMailbox() === 'inbox' ? this.inboxPagination() : this.sentPagination()
  );
  readonly unreadCount = computed(() => this.badgeService.getBadgeCount('messages'));
  readonly recipientSelectOptions = computed(() =>
    this.recipientOptions().map((recipient) => ({
      label: `${recipient.firstName} ${recipient.lastName} (${recipient.email})`,
      value: recipient.id,
    }))
  );

  readonly composeForm = this.fb.group({
    recipientId: ['', Validators.required],
    subject: ['', [Validators.required, Validators.maxLength(200)]],
    body: ['', [Validators.required, Validators.maxLength(5000)]],
  });

  ngOnInit() {
    this.route.queryParamMap.subscribe((params) => {
      const view = params.get('view') === 'sent' ? 'sent' : 'inbox';
      this.activeMailbox.set(view);
      this.loadMailbox(1);
    });
  }

  setMailbox(mailbox: 'inbox' | 'sent') {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: mailbox },
      queryParamsHandling: 'merge',
    });
  }

  loadMailbox(page = 1) {
    this.isMailboxLoading.set(true);
    this.error.set(null);

    const request =
      this.activeMailbox() === 'inbox'
        ? this.messagesService.getInbox({
            page,
            limit: DEFAULT_LIMIT,
            search: this.searchTerm.trim() || undefined,
            unreadOnly: this.unreadOnly,
          })
        : this.messagesService.getSent({
            page,
            limit: DEFAULT_LIMIT,
            search: this.searchTerm.trim() || undefined,
          });

    request.subscribe({
      next: (response) => {
        if (this.activeMailbox() === 'inbox') {
          this.inboxMessages.set(response.data);
          this.inboxPagination.set(response.pagination);
        } else {
          this.sentMessages.set(response.data);
          this.sentPagination.set(response.pagination);
        }

        const selectedId = this.selectedMessage()?.id;
        if (selectedId) {
          const updatedSelection = response.data.find((message) => message.id === selectedId);
          if (updatedSelection) {
            this.selectedMessage.set(updatedSelection);
          }
        }

        this.isMailboxLoading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load messages');
        this.isMailboxLoading.set(false);
      },
    });
  }

  onSearch() {
    this.loadMailbox(1);
  }

  clearSearch() {
    this.searchTerm = '';
    this.loadMailbox(1);
  }

  onUnreadOnlyChange() {
    this.loadMailbox(1);
  }

  onPrevPage() {
    if (this.currentPagination().page > 1) {
      this.loadMailbox(this.currentPagination().page - 1);
    }
  }

  onNextPage() {
    if (this.currentPagination().page < this.currentPagination().totalPages) {
      this.loadMailbox(this.currentPagination().page + 1);
    }
  }

  selectMessage(message: AdminMessage) {
    this.selectedMessage.set(message);

    if (this.activeMailbox() === 'inbox' && !message.isRead) {
      this.messagesService.markAsRead(message.id).subscribe({
        next: (updatedMessage) => {
          this.selectedMessage.set(updatedMessage);
          this.replaceMessage(updatedMessage);
          this.badgeService.refreshCounts();
        },
      });
    }
  }

  openCompose(recipient?: MessageParticipant) {
    if (!this.canCompose()) {
      return;
    }

    this.showComposeDialog.set(true);
    this.loadRecipients();

    if (recipient) {
      this.composeForm.patchValue({
        recipientId: recipient.id,
        subject: this.buildReplySubject(this.selectedMessage()?.subject || ''),
      });
    }
  }

  closeCompose() {
    this.showComposeDialog.set(false);
    this.composeForm.reset({
      recipientId: '',
      subject: '',
      body: '',
    });
  }

  replyToSelectedMessage() {
    const message = this.selectedMessage();
    if (!message) {
      return;
    }

    const recipient = this.activeMailbox() === 'inbox' ? message.sender : message.recipient;
    this.openCompose(recipient);
  }

  sendMessage() {
    if (this.composeForm.invalid) {
      this.composeForm.markAllAsTouched();
      return;
    }

    this.isSending.set(true);

    this.messagesService.createMessage(this.composeForm.getRawValue() as any).subscribe({
      next: (message) => {
        this.isSending.set(false);
        this.closeCompose();
        this.messageService.add({
          severity: 'success',
          summary: 'Message sent',
          detail: `Your message to ${message.recipient.firstName} ${message.recipient.lastName} was sent.`,
        });
        this.badgeService.refreshCounts();
        this.setMailbox('sent');
      },
      error: (err) => {
        this.isSending.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Send failed',
          detail: err.error?.message || 'Failed to send message',
        });
      },
    });
  }

  getCounterparty(message: AdminMessage): MessageParticipant {
    return this.activeMailbox() === 'inbox' ? message.sender : message.recipient;
  }

  getReadStateSeverity(message: AdminMessage):
    | 'success'
    | 'info'
    | 'warn'
    | 'danger'
    | 'secondary'
    | 'contrast' {
    return message.isRead ? 'success' : 'warn';
  }

  formatMessageDate(value: string): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  }

  private loadRecipients() {
    if (this.recipientOptions().length > 0) {
      return;
    }

    this.isRecipientsLoading.set(true);
    this.messagesService.getStaffOptions().subscribe({
      next: (recipients) => {
        this.recipientOptions.set(recipients);
        this.isRecipientsLoading.set(false);
      },
      error: () => {
        this.isRecipientsLoading.set(false);
      },
    });
  }

  private replaceMessage(updatedMessage: AdminMessage) {
    this.inboxMessages.update((messages) =>
      messages.map((message) => (message.id === updatedMessage.id ? updatedMessage : message))
    );
    this.sentMessages.update((messages) =>
      messages.map((message) => (message.id === updatedMessage.id ? updatedMessage : message))
    );
  }

  private buildReplySubject(subject: string): string {
    return subject.startsWith('Re: ') ? subject : `Re: ${subject}`;
  }
}
