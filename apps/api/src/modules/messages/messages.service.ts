import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { Message } from './entities/message.entity';
import { Staff } from '../staff/entities/staff.entity';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessagesQueryDto } from './dto/messages-query.dto';
import {
  PaginatedResponse,
  createPaginationMeta,
} from '../../common/dto/pagination.dto';
import { AuthUser } from '../../common/types/auth-user.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

export interface MessageParticipant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  photoUrl: string | null;
}

export interface MessageResponse {
  id: string;
  subject: string;
  body: string;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sender: MessageParticipant;
  recipient: MessageParticipant;
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Staff)
    private readonly staffRepository: Repository<Staff>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(createMessageDto: CreateMessageDto, authUser: AuthUser): Promise<MessageResponse> {
    const senderId = this.getRequiredStaffId(authUser);

    if (senderId === createMessageDto.recipientId) {
      throw new BadRequestException('You cannot send a message to yourself');
    }

    const sender = await this.staffRepository.findOne({
      where: { id: senderId },
      relations: ['user'],
    });

    if (!sender) {
      throw new UnauthorizedException('Staff identification required to send messages');
    }

    const recipient = await this.staffRepository
      .createQueryBuilder('staff')
      .leftJoinAndSelect('staff.user', 'user')
      .where('staff.id = :recipientId', { recipientId: createMessageDto.recipientId })
      .andWhere('user.account_type = :accountType', { accountType: 'admin' })
      .andWhere('user.is_active = :isActive', { isActive: true })
      .getOne();

    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    const message = this.messageRepository.create({
      senderId,
      recipientId: createMessageDto.recipientId,
      subject: createMessageDto.subject.trim(),
      body: createMessageDto.body.trim(),
    });

    const savedMessage = await this.messageRepository.save(message);

    await this.auditLogsService.logAction({
      staffId: senderId,
      action: 'CREATE',
      entity: 'message',
      entityId: savedMessage.id,
      description: `Sent message "${savedMessage.subject}" to "${recipient.firstName} ${recipient.lastName}"`,
    });

    return this.findOne(savedMessage.id, authUser);
  }

  async findInbox(
    query: MessagesQueryDto,
    authUser: AuthUser,
  ): Promise<PaginatedResponse<MessageResponse>> {
    return this.findMailbox('inbox', query, authUser);
  }

  async findSent(
    query: MessagesQueryDto,
    authUser: AuthUser,
  ): Promise<PaginatedResponse<MessageResponse>> {
    return this.findMailbox('sent', query, authUser);
  }

  async getUnreadCount(authUser: AuthUser) {
    const staffId = this.getRequiredStaffId(authUser);
    const unread = await this.messageRepository.count({
      where: { recipientId: staffId, isRead: false },
    });

    return { unread };
  }

  async getStaffOptions(authUser: AuthUser, search?: string): Promise<MessageParticipant[]> {
    const staffId = this.getRequiredStaffId(authUser);
    const normalizedSearch = search?.trim().toLowerCase();

    const qb = this.staffRepository
      .createQueryBuilder('staff')
      .leftJoinAndSelect('staff.user', 'user')
      .where('staff.id != :staffId', { staffId })
      .andWhere('user.account_type = :accountType', { accountType: 'admin' })
      .andWhere('user.is_active = :isActive', { isActive: true })
      .orderBy('staff.firstName', 'ASC')
      .addOrderBy('staff.lastName', 'ASC')
      .take(50);

    if (normalizedSearch) {
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('LOWER(staff.first_name) LIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('LOWER(staff.last_name) LIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('LOWER(user.email) LIKE :search', { search: `%${normalizedSearch}%` });
        }),
      );
    }

    const staffMembers = await qb.getMany();

    return staffMembers.map((staff) => this.mapParticipant(staff));
  }

  async findOne(id: string, authUser: AuthUser): Promise<MessageResponse> {
    const staffId = this.getRequiredStaffId(authUser);

    const message = await this.messageRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .leftJoinAndSelect('sender.user', 'senderUser')
      .leftJoinAndSelect('message.recipient', 'recipient')
      .leftJoinAndSelect('recipient.user', 'recipientUser')
      .where('message.id = :id', { id })
      .andWhere(
        new Brackets((qb) => {
          qb.where('message.sender_id = :staffId', { staffId }).orWhere(
            'message.recipient_id = :staffId',
            { staffId },
          );
        }),
      )
      .getOne();

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    return this.mapMessage(message);
  }

  async markAsRead(id: string, authUser: AuthUser): Promise<MessageResponse> {
    const staffId = this.getRequiredStaffId(authUser);

    const message = await this.messageRepository.findOne({
      where: { id, recipientId: staffId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (!message.isRead) {
      message.isRead = true;
      message.readAt = new Date();
      await this.messageRepository.save(message);
    }

    return this.findOne(id, authUser);
  }

  private async findMailbox(
    mailbox: 'inbox' | 'sent',
    query: MessagesQueryDto,
    authUser: AuthUser,
  ): Promise<PaginatedResponse<MessageResponse>> {
    const staffId = this.getRequiredStaffId(authUser);
    const search = query.search?.trim().toLowerCase();
    const qb = this.messageRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .leftJoinAndSelect('sender.user', 'senderUser')
      .leftJoinAndSelect('message.recipient', 'recipient')
      .leftJoinAndSelect('recipient.user', 'recipientUser')
      .orderBy('message.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (mailbox === 'inbox') {
      qb.where('message.recipient_id = :staffId', { staffId });

      if (query.unreadOnly) {
        qb.andWhere('message.is_read = :isRead', { isRead: false });
      }
    } else {
      qb.where('message.sender_id = :staffId', { staffId });
    }

    if (search) {
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('LOWER(message.subject) LIKE :search', { search: `%${search}%` })
            .orWhere('LOWER(message.body) LIKE :search', { search: `%${search}%` })
            .orWhere('LOWER(sender.first_name) LIKE :search', { search: `%${search}%` })
            .orWhere('LOWER(sender.last_name) LIKE :search', { search: `%${search}%` })
            .orWhere('LOWER(senderUser.email) LIKE :search', { search: `%${search}%` })
            .orWhere('LOWER(recipient.first_name) LIKE :search', { search: `%${search}%` })
            .orWhere('LOWER(recipient.last_name) LIKE :search', { search: `%${search}%` })
            .orWhere('LOWER(recipientUser.email) LIKE :search', { search: `%${search}%` });
        }),
      );
    }

    const [messages, total] = await qb.getManyAndCount();

    return {
      data: messages.map((message) => this.mapMessage(message)),
      pagination: createPaginationMeta(query, total),
    };
  }

  private getRequiredStaffId(authUser: AuthUser): string {
    if (!authUser?.staffId) {
      throw new UnauthorizedException('Staff identification required');
    }

    return authUser.staffId;
  }

  private mapMessage(message: Message): MessageResponse {
    return {
      id: message.id,
      subject: message.subject,
      body: message.body,
      isRead: message.isRead,
      readAt: message.readAt,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      sender: this.mapParticipant(message.sender),
      recipient: this.mapParticipant(message.recipient),
    };
  }

  private mapParticipant(staff: Staff): MessageParticipant {
    return {
      id: staff.id,
      firstName: staff.firstName,
      lastName: staff.lastName,
      email: staff.user.email,
      photoUrl: staff.photoUrl,
    };
  }
}
