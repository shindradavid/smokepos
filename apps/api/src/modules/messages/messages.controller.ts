import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { MessagesService, MessageParticipant, MessageResponse } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessagesQueryDto } from './dto/messages-query.dto';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ReqAuthUser } from '../../common/decorators/req-auth-user.decorator';
import { AuthUser } from '../../common/types/auth-user.interface';
import { PaginatedResponse } from '../../common/dto/pagination.dto';

@Controller({ path: 'messages', version: '1' })
@UseGuards(PermissionGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('inbox')
  @RequirePermission('message.view', 'message.read')
  findInbox(
    @Query() query: MessagesQueryDto,
    @ReqAuthUser() authUser: AuthUser,
  ): Promise<PaginatedResponse<MessageResponse>> {
    return this.messagesService.findInbox(query, authUser);
  }

  @Get('sent')
  @RequirePermission('message.view', 'message.read')
  findSent(
    @Query() query: MessagesQueryDto,
    @ReqAuthUser() authUser: AuthUser,
  ): Promise<PaginatedResponse<MessageResponse>> {
    return this.messagesService.findSent(query, authUser);
  }

  @Get('unread-count')
  @RequirePermission('message.view', 'message.read')
  getUnreadCount(@ReqAuthUser() authUser: AuthUser): Promise<{ unread: number }> {
    return this.messagesService.getUnreadCount(authUser);
  }

  @Get('staff-options')
  @RequirePermission('message.create', 'message.view')
  getStaffOptions(
    @ReqAuthUser() authUser: AuthUser,
    @Query('search') search?: string,
  ): Promise<MessageParticipant[]> {
    return this.messagesService.getStaffOptions(authUser, search);
  }

  @Post()
  @RequirePermission('message.create')
  create(
    @Body() createMessageDto: CreateMessageDto,
    @ReqAuthUser() authUser: AuthUser,
  ): Promise<MessageResponse> {
    return this.messagesService.create(createMessageDto, authUser);
  }

  @Patch(':id/read')
  @RequirePermission('message.read', 'message.view')
  markAsRead(@Param('id') id: string, @ReqAuthUser() authUser: AuthUser): Promise<MessageResponse> {
    return this.messagesService.markAsRead(id, authUser);
  }

  @Get(':id')
  @RequirePermission('message.view', 'message.read')
  findOne(@Param('id') id: string, @ReqAuthUser() authUser: AuthUser): Promise<MessageResponse> {
    return this.messagesService.findOne(id, authUser);
  }
}
