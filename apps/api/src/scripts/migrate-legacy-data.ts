import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Category } from '../modules/products/entities/category.entity';
import { Product } from '../modules/products/entities/product.entity';
import { Branch } from '../modules/branches/entities/branch.entity';
import { StorageService } from '../modules/shared/services/storage.service';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import slugify from 'slugify';
import { Logger } from '@nestjs/common';

// Helper for slug generation
const generateSlug = (text: string) => slugify(text, { lower: true, strict: true, trim: true });

async function downloadImage(url: string): Promise<Express.Multer.File | null> {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    const filename = path.basename(url);
    const mimetype = response.headers['content-type'];

    // Mock Multer File
    return {
      fieldname: 'file',
      originalname: filename,
      encoding: '7bit',
      mimetype: mimetype,
      buffer: buffer,
      size: buffer.length,
      stream: null as any,
      destination: '',
      filename: filename,
      path: '',
    };
  } catch (error) {
    // Log image download failure but allow continuation
    Logger.warn(`Failed to download image: ${url}`);
    return null;
  }
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const storageService = app.get(StorageService);
  const logger = new Logger('Migration');

  logger.log('Starting legacy data migration...');

  // 1. Get Main Branch
  const mainBranch = await dataSource.getRepository(Branch).findOne({ where: { isMain: true } });
  if (!mainBranch) {
    logger.error('No main branch found (isMain=true). Please seed branches first.');
    await app.close();
    process.exit(1);
  }
  const branchId = mainBranch.id;
  logger.log(`Using Main Branch: ${mainBranch.name} (${branchId})`);

  // 2. Load JSON Data
  const dataDir = path.join(__dirname, '../../data');
  const categoriesData = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'categories.json'), 'utf-8')
  );
  const productsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'products.json'), 'utf-8'));

  // Identity Maps
  const categoryMap = new Map<string, string>(); // Name -> UUID

  // 3. Migrate Categories
  const categoryRepo = dataSource.getRepository(Category);
  let keptCats = 0;
  let createdCats = 0;

  for (const item of categoriesData) {
    const slug = item.slug || generateSlug(item.name);

    // Check existing
    let category = await categoryRepo.findOne({
      where: [{ slug: slug }, { name: item.name }],
    });

    if (category) {
      keptCats++;
    } else {
      let imageUrl = null;
      if (item.image) {
        const file = await downloadImage(item.image);
        if (file) {
          imageUrl = await storageService.uploadImageFile(file, 'categories');
        }
      }

      category = categoryRepo.create({
        name: item.name,
        slug: slug,
        description: item.description,
        image: imageUrl || undefined,
        isActive: item.isActive,
        branch: mainBranch,
        branchId: branchId,
      });
      await categoryRepo.save(category);
      createdCats++;
    }
    categoryMap.set(item.name, category.id);
    categoryMap.set(slug, category.id);
  }
  logger.log(`Categories: Created ${createdCats}, Skipped/Found ${keptCats}`);

  // 4. Migrate Products
  const productRepo = dataSource.getRepository(Product);
  let keptProds = 0;
  let createdProds = 0;

  for (const item of productsData) {
    const slug = generateSlug(item.name); // Generate slug from name

    // Check existing by SKU (first priority) or Slug/Name
    let product = null;
    if (item.sku) {
      product = await productRepo.findOne({ where: { sku: item.sku } });
    }

    if (!product) {
      product = await productRepo.findOne({ where: [{ slug: slug }, { name: item.name }] });
    }

    if (product) {
      keptProds++;
    } else {
      let images: string[] = [];
      if (item.image) {
        const file = await downloadImage(item.image);
        if (file) {
          const url = await storageService.uploadImageFile(file, 'products');
          images.push(url);
        }
      }
      // Also check item.images array if exists? JSON shows "images": null usually.
      // Ignoring "images" array for now as per JSON sample.

      const categoryId = item.category
        ? categoryMap.get(item.category) || categoryMap.get(generateSlug(item.category))
        : undefined;

      // Skip products without a valid price
      if (item.price == null || item.price === undefined) {
        logger.warn(`Skipping product "${item.name}" - missing price`);
        continue;
      }

      product = productRepo.create({
        name: item.name,
        slug: slug,
        sku: item.sku,
        description: item.description,
        price: item.price,
        quantity: item.stock || 0,
        isActive: item.isActive ?? true,
        images: images,
        branch: mainBranch,
        branchId: branchId,
        categoryId: categoryId || undefined,
      });

      await productRepo.save(product);
      createdProds++;
    }
  }
  logger.log(`Products: Created ${createdProds}, Skipped/Found ${keptProds}`);

  await app.close();
  process.exit(0);
}

bootstrap();
