import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
  ManyToMany,
  Index,
} from 'typeorm';

import { Staff } from '../../staff/entities/staff.entity';

export type Permission = string;

// Helper function to create CRUD permissions for a resource
export const createCRUD = <T extends string>(resource: T) => {
  return [
    `${resource}.view`,
    `${resource}.create`,
    `${resource}.edit`,
    `${resource}.delete`,
  ] as const;
};

// Permission groups for easy reference
export const PermissionGroups = {
  admin: createCRUD('admin'),
  role: createCRUD('role'),
  auditLog: ['auditLog.view'],
  branch: createCRUD('branch'),
  product: createCRUD('product'),
  category: createCRUD('category'),
  brand: createCRUD('brand'),
  customer: createCRUD('customer'),
  staff: createCRUD('staff'),
  message: ['message.view', 'message.create', 'message.read'],
  sale: [...createCRUD('sale'), 'sale.approve_payment'],
  expense: [...createCRUD('expense'), 'expense.approve'],
  supplier: createCRUD('supplier'),
  purchaseOrder: [...createCRUD('purchaseOrder'), 'purchaseOrder.approve', 'purchaseOrder.receive'],
  inventory: ['inventory.view', 'inventory.view_quantity', 'inventory.adjust'],
  report: [
    'report.view',
    'report.sales',
    'report.expenses',
    'report.inventory',
    'report.procurement',
    'report.financial',
    'report.export',
  ],
  dashboard: [
    'dashboard.view',
    'dashboard.sales',
    'dashboard.expenses',
    'dashboard.inventory',
    'dashboard.financial',
  ],
} as const;

export type PermissionType = (typeof PermissionGroups)[keyof typeof PermissionGroups][number];

export const AllPermissions = Object.values(PermissionGroups).flat() as Permission[];

@Entity({ name: 'staff_roles' })
@Index(['slug'], { unique: true })
export class StaffRole extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'slug', type: 'varchar', length: 100, unique: true })
  slug: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'permissions',
    type: 'varchar',
    array: true,
    default: [],
  })
  permissions: Permission[];

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @ManyToMany(() => Staff, (staff) => staff.roles)
  staff: Staff[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
