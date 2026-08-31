import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wishlist } from '../entities/wishlist.entity';
import { Product } from '../../products/entities/product.entity';
import { Branch } from '../../branches/entities/branch.entity';

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(Wishlist)
    private readonly wishlistRepository: Repository<Wishlist>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>
  ) {}

  /**
   * Get the main branch ID
   */
  private async getMainBranchId(): Promise<string> {
    const mainBranch = await this.branchRepository.findOne({
      where: { isMain: true },
    });
    if (!mainBranch) {
      throw new NotFoundException('Main branch not configured');
    }
    return mainBranch.id;
  }

  /**
   * Get customer's wishlist with product details
   */
  async getWishlist(customerId: string) {
    const items = await this.wishlistRepository.find({
      where: { customerId },
      relations: ['product', 'product.category'],
      order: { createdAt: 'DESC' },
    });

    return {
      data: items.map((item) => ({
        id: item.id,
        productId: item.productId,
        product: item.product,
        addedAt: item.createdAt,
      })),
      total: items.length,
    };
  }

  /**
   * Get just the product IDs in the wishlist
   */
  async getWishlistProductIds(customerId: string): Promise<string[]> {
    const items = await this.wishlistRepository.find({
      where: { customerId },
      select: ['productId'],
    });
    return items.map((item) => item.productId);
  }

  /**
   * Add a product to customer's wishlist
   */
  async addToWishlist(customerId: string, productId: string) {
    // Verify product exists and is from main branch
    const mainBranchId = await this.getMainBranchId();
    const product = await this.productRepository.findOne({
      where: { id: productId, branchId: mainBranchId, isActive: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Check if already in wishlist
    const existing = await this.wishlistRepository.findOne({
      where: { customerId, productId },
    });

    if (existing) {
      throw new ConflictException('Product already in wishlist');
    }

    const wishlistItem = this.wishlistRepository.create({
      customerId,
      productId,
    });

    await this.wishlistRepository.save(wishlistItem);

    return { message: 'Product added to wishlist', productId };
  }

  /**
   * Remove a product from customer's wishlist
   */
  async removeFromWishlist(customerId: string, productId: string) {
    const result = await this.wishlistRepository.delete({
      customerId,
      productId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Product not found in wishlist');
    }

    return { message: 'Product removed from wishlist', productId };
  }

  /**
   * Check if a product is in customer's wishlist
   */
  async isInWishlist(customerId: string, productId: string) {
    const item = await this.wishlistRepository.findOne({
      where: { customerId, productId },
    });
    return { inWishlist: !!item };
  }
}
