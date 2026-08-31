/**
 * Customer interface
 */
export interface Customer {
  id: string;
  userAccountId: string | null;
  name: string;
  phoneNumber: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  photoUrl: string | null;
  branchId: string | null;
  branch?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  user?: {
    id: string;
    email: string;
    isActive: boolean;
    lastLogin?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * DTO for creating a customer
 */
export interface CreateCustomerDto {
  name: string;
  phoneNumber: string;
  email?: string;
  address?: string;
  notes?: string;
  branchId?: string;
}

/**
 * DTO for updating a customer
 */
export interface UpdateCustomerDto {
  name?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  notes?: string;
  branchId?: string;
}
