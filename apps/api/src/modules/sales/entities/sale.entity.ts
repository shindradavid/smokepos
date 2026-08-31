import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  BaseEntity,
} from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { Staff } from '../../staff/entities/staff.entity';
import { SaleItem } from './sale-item.entity';
import { SalePayment } from './sale-payment.entity';

export enum SaleStatus {
  PROCESSING = 'processing',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum CustomerSource {
  WALK_IN = 'walk_in',
  REFERRAL = 'referral',
  ONLINE = 'online',
  STAFF_SUPPORT = 'staff_support',
  RETURNING_CUSTOMER = 'returning_customer',
  OTHER = 'other',
}

@Entity({ name: 'sales' })
@Index(['saleId'], { unique: true })
export class Sale extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Deterministic, human-readable ID: QWIK-{BRANCH}-{YYYYMM}-{SEQ}
  @Column({ name: 'sale_id', type: 'varchar', length: 50, unique: true })
  saleId: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => Staff)
  @JoinColumn({ name: 'created_by_id' })
  createdBy: Staff;

  @Column({
    name: 'status',
    type: 'enum',
    enum: SaleStatus,
    default: SaleStatus.PROCESSING,
  })
  status: SaleStatus;

  @Column({
    name: 'customer_source',
    type: 'enum',
    enum: CustomerSource,
    default: CustomerSource.WALK_IN,
  })
  customerSource: CustomerSource;

  // Monetary fields (using numeric with transformer for consistency)
  @Column({
    name: 'subtotal',
    type: 'numeric',
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  subtotal: number;

  @Column({
    name: 'tax_amount',
    type: 'numeric',
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  taxAmount: number;

  @Column({
    name: 'total_amount',
    type: 'numeric',
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  totalAmount: number;

  // Tracked by payments
  @Column({
    name: 'amount_paid',
    type: 'numeric',
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  amountPaid: number;

  // Computed: totalAmount - amountPaid
  @Column({
    name: 'balance',
    type: 'numeric',
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  balance: number;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => SaleItem, (item) => item.sale, { cascade: true })
  items: SaleItem[];

  @OneToMany(() => SalePayment, (payment) => payment.sale, { cascade: true })
  payments: SalePayment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
