import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import {
  ItemPickerDialogComponent,
  FetchItemsFn,
} from '../../../../shared/components/item-picker-dialog/item-picker-dialog.component';
import { ProductsService } from '../../../../core/services/products.service';
import { CategoriesService } from '../../../../core/services/categories.service';
import { BranchService } from '../../../../core/services/branch.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Category } from '../../../../core/models/category.model';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, PageHeaderComponent, ItemPickerDialogComponent],
  templateUrl: './product-form.component.html',
  styleUrl: './product-form.component.scss',
})
export class ProductFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private productsService = inject(ProductsService);
  private categoriesService = inject(CategoriesService);
  private branchService = inject(BranchService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  productForm: FormGroup;
  isEditMode = false;
  productId: string | null = null;
  isSubmitting = false;

  canViewQuantity(): boolean {
    return this.authService.hasPermission('inventory.view_quantity');
  }

  // Selected items for pickers
  readonly selectedCategory = signal<Category | null>(null);

  // Modal visibility
  readonly categoryPickerVisible = signal(false);

  // Image handling
  selectedFiles: File[] = [];
  imagePreviews: string[] = [];
  existingImages: string[] = [];

  // Fetch functions for pickers (scoped to current branch)
  readonly fetchCategories: FetchItemsFn<Category> = (query) => {
    const branchId = this.branchService.currentBranchId() || undefined;
    return this.categoriesService.getCategories({
      page: query.page,
      limit: query.limit,
      search: query.search,
      branchId,
    });
  };

  constructor() {
    this.productForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      sku: [''],
      categoryId: [null],
      price: [0, [Validators.required, Validators.min(0)]],
      costPrice: [null, [Validators.min(0)]],
      quantity: [0, [Validators.min(0)]],
      lowStockThreshold: [10, [Validators.min(0)]],
      isActive: [true],
      branchId: [this.branchService.currentBranchId(), Validators.required],
    });
  }

  ngOnInit() {
    this.productId = this.route.snapshot.paramMap.get('id');
    if (this.productId && this.productId !== 'new') {
      this.isEditMode = true;
      this.loadProduct(this.productId);
    }
  }

  loadProduct(id: string) {
    this.productsService.getProduct(id).subscribe({
      next: (product) => {
        this.productForm.patchValue(product);
        // Store existing images for display
        if (product.images && product.images.length > 0) {
          this.existingImages = product.images;
        }
        // Set the selected category for display.
        if (product.category) {
          this.selectedCategory.set(product.category);
        }
      },
      error: (err) => console.error('Failed to load product', err),
    });
  }

  // Category picker handlers
  openCategoryPicker() {
    this.categoryPickerVisible.set(true);
  }

  onCategorySelected(category: Category | null) {
    this.selectedCategory.set(category);
    this.productForm.patchValue({ categoryId: category?.id || null });
  }

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      const files = Array.from(input.files);
      this.selectedFiles = [...this.selectedFiles, ...files];

      // Generate previews for new files
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          this.imagePreviews.push(reader.result as string);
        };
        reader.readAsDataURL(file);
      });
    }
  }

  removeNewImage(index: number) {
    this.selectedFiles.splice(index, 1);
    this.imagePreviews.splice(index, 1);
  }

  removeExistingImage(index: number) {
    this.existingImages.splice(index, 1);
  }

  hasError(field: string): boolean {
    const control = this.productForm.get(field);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  onSubmit() {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formValue = this.productForm.value;

    // Create FormData for file upload
    const formData = new FormData();

    // Append form fields
    formData.append('name', formValue.name);
    formData.append('price', formValue.price.toString());
    formData.append('branchId', this.branchService.currentBranchId() || '');

    if (formValue.description) formData.append('description', formValue.description);
    if (formValue.sku) formData.append('sku', formValue.sku);
    if (formValue.categoryId) formData.append('categoryId', formValue.categoryId);
    if (formValue.costPrice !== undefined && formValue.costPrice !== null)
      formData.append('costPrice', formValue.costPrice.toString());
    if (!this.isEditMode && formValue.quantity !== undefined)
      formData.append('quantity', formValue.quantity.toString());
    if (formValue.lowStockThreshold !== undefined)
      formData.append('lowStockThreshold', formValue.lowStockThreshold.toString());
    formData.append('isActive', formValue.isActive.toString());

    // Append image files
    this.selectedFiles.forEach((file) => {
      formData.append('images', file);
    });

    if (this.isEditMode && this.productId) {
      this.productsService.updateProduct(this.productId, formData).subscribe({
        next: () => this.router.navigate(['/products']),
        error: (err) => {
          console.error('Failed to update product', err);
          this.isSubmitting = false;
        },
      });
    } else {
      this.productsService.createProduct(formData).subscribe({
        next: () => this.router.navigate(['/products']),
        error: (err) => {
          console.error('Failed to create product', err);
          this.isSubmitting = false;
        },
      });
    }
  }

  onCancel() {
    this.router.navigate(['/products']);
  }
}
