import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { Staff } from '../../staff/entities/staff.entity';

@Entity({ name: 'messages' })
export class Message extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sender_id', type: 'uuid' })
  senderId: string;

  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId: string;

  @Column({ name: 'subject', type: 'varchar', length: 200 })
  subject: string;

  @Column({ name: 'body', type: 'text' })
  body: string;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @Column({ name: 'read_at', type: 'timestamp', nullable: true })
  readAt: Date | null;

  @ManyToOne(() => Staff, (staff) => staff.sentMessages, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'sender_id' })
  sender: Staff;

  @ManyToOne(() => Staff, (staff) => staff.receivedMessages, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'recipient_id' })
  recipient: Staff;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
