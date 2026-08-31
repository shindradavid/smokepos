import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SiteService } from './site.service';
import { SiteProductsQueryDto, SiteCategoriesQueryDto } from './dto';

@Controller({ path: 'site', version: '1' })
@Public()
export class SiteController {
  constructor(private readonly siteService: SiteService) {}

  /**
   * Get products for the public site
   * GET /site/products
   * Query params: page, limit, category, search
   */
  @Get('products')
  async getProducts(@Query() query: SiteProductsQueryDto) {
    return this.siteService.getProducts(query);
  }

  /**
   * Get a single product by slug
   * GET /site/products/:slug
   */
  @Get('products/:slug')
  async getProductBySlug(@Param('slug') slug: string) {
    const product = await this.siteService.getProductBySlug(slug);
    if (!product) {
      throw new NotFoundException(`Product not found`);
    }
    return product;
  }

  /**
   * Get categories for the public site
   * GET /site/categories
   */
  @Get('categories')
  async getCategories(@Query() query: SiteCategoriesQueryDto) {
    return this.siteService.getCategories(query);
  }

  /**
   * Get a single category by slug
   * GET /site/categories/:slug
   */
  @Get('categories/:slug')
  async getCategoryBySlug(@Param('slug') slug: string) {
    const category = await this.siteService.getCategoryBySlug(slug);
    if (!category) {
      throw new NotFoundException(`Category not found`);
    }
    return category;
  }
}
