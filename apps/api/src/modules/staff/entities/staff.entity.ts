import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { StaffRole } from '../../roles/entities/role.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { AuditLog } from '../../audit-logs/entities/audit-log.entity';
import { Message } from '../../messages/entities/message.entity';

@Entity({ name: 'staff' })
export class Staff extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_account_id', type: 'uuid', unique: true })
  userAccountId: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName: string;

  @Column({
    name: 'primary_phone_number',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  primaryPhoneNumber: string | null;

  @Column({
    name: 'secondary_phone_number',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  secondaryPhoneNumber: string | null;

  @Column({ name: 'photo_url', type: 'varchar', length: 500, nullable: true })
  photoUrl: string | null;

  @OneToOne(() => User, (user) => user.staffAccount, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'user_account_id' })
  user: User;

  @ManyToMany(() => StaffRole, (role) => role.staff)
  @JoinTable({
    name: 'staff_roles_map',
    joinColumn: { name: 'staff_id' },
    inverseJoinColumn: { name: 'role_id' },
  })
  roles: StaffRole[];

  @ManyToMany(() => Branch)
  @JoinTable({
    name: 'staff_branches_map',
    joinColumn: { name: 'staff_id' },
    inverseJoinColumn: { name: 'branch_id' },
  })
  assignedBranches: Branch[];

  @OneToMany(() => AuditLog, (auditLog) => auditLog.performedBy)
  auditLogs: AuditLog[];

  @OneToMany(() => Message, (message) => message.sender)
  sentMessages: Message[];

  @OneToMany(() => Message, (message) => message.recipient)
  receivedMessages: Message[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
