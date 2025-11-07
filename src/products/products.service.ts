import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from 'src/products/dto/update-product.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { DataSource, Repository } from 'typeorm';
import { validate as isUUID } from 'uuid';

// Interface para el resultado de operaciones masivas
interface BulkOperationResult {
  created: number;
  updated: number;
  errors: Array<{ code: string; error: string }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger('ProductsService');

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  async create(createProductDto: CreateProductDto) {
    try {
      const product = this.productRepository.create(createProductDto);
      await this.productRepository.save(product);
      return product;
    } catch (error) {
      this.handleException(error);
    }
  }

  // NUEVO: Método para procesar productos desde Excel
  async processExcelProducts(
    productsData: CreateProductDto[],
  ): Promise<BulkOperationResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let created = 0;
    let updated = 0;
    const errors: Array<{ code: string; error: string }> = [];

    try {
      for (const productData of productsData) {
        try {
          // Buscar producto existente por código
          const existingProduct = await queryRunner.manager.findOne(Product, {
            where: { code: productData.code.toUpperCase() },
          });

          if (existingProduct) {
            // Actualizar producto existente
            const updatedProduct = queryRunner.manager.merge(
              Product,
              existingProduct,
              productData,
            );
            await queryRunner.manager.save(updatedProduct);
            updated++;
            this.logger.log(`Updated product: ${productData.code}`);
          } else {
            // Crear nuevo producto
            const newProduct = queryRunner.manager.create(Product, {
              ...productData,
              code: productData.code.toUpperCase(),
            });
            await queryRunner.manager.save(newProduct);
            created++;
            this.logger.log(`Created product: ${productData.code}`);
          }
        } catch (error) {
          this.logger.error(
            `Error processing product ${productData.code}:`,
            error,
          );
          errors.push({
            code: productData.code,
            error: error.message || 'Unknown error',
          });
        }
      }

      await queryRunner.commitTransaction();

      this.logger.log(
        `Bulk operation completed: ${created} created, ${updated} updated, ${errors.length} errors`,
      );

      return {
        created,
        updated,
        errors,
        summary: {
          total: productsData.length,
          successful: created + updated,
          failed: errors.length,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Bulk operation failed:', error);
      throw new InternalServerErrorException(
        'Failed to process bulk operation',
      );
    } finally {
      await queryRunner.release();
    }
  }

  // NUEVO: Método optimizado para grandes volúmenes
  async bulkUpsertProducts(
    productsData: CreateProductDto[],
  ): Promise<BulkOperationResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Obtener códigos existentes
      const codes = productsData.map((p) => p.code.toUpperCase());
      const existingProducts = await queryRunner.manager
        .createQueryBuilder(Product, 'product')
        .select(['product.id', 'product.code'])
        .where('product.code IN (:...codes)', { codes })
        .getMany();

      const existingCodesMap = new Map(
        existingProducts.map((p) => [p.code, p.id]),
      );

      const toCreate: any[] = [];
      const toUpdate: any[] = [];

      // Separar productos a crear vs actualizar
      productsData.forEach((productData) => {
        const normalizedCode = productData.code.toUpperCase();
        const productPayload = {
          ...productData,
          code: normalizedCode,
        };

        if (existingCodesMap.has(normalizedCode)) {
          toUpdate.push({
            ...productPayload,
            id: existingCodesMap.get(normalizedCode),
          });
        } else {
          toCreate.push(productPayload);
        }
      });

      let created = 0;
      let updated = 0;

      // Crear nuevos productos
      if (toCreate.length > 0) {
        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(Product)
          .values(toCreate)
          .execute();
        created = toCreate.length;
        this.logger.log(`Created ${created} new products`);
      }

      // Actualizar productos existentes
      if (toUpdate.length > 0) {
        await queryRunner.manager.save(Product, toUpdate);
        updated = toUpdate.length;
        this.logger.log(`Updated ${updated} existing products`);
      }

      await queryRunner.commitTransaction();

      return {
        created,
        updated,
        errors: [],
        summary: {
          total: productsData.length,
          successful: created + updated,
          failed: 0,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Bulk upsert failed:', error);
      throw new InternalServerErrorException('Failed to process bulk upsert');
    } finally {
      await queryRunner.release();
    }
  }

  // NUEVO: Buscar producto por código
  async findByCode(code: string) {
    try {
      return await this.productRepository.findOne({
        where: { code: code.toUpperCase() },
      });
    } catch (error) {
      this.handleException(error);
    }
  }

  async findAll() {
    try {
      return await this.productRepository.find();
    } catch (error) {
      this.handleException(error);
    }
  }

  async findOne(term: string) {
    let prod: Product | null = null;
    if (isUUID(term)) {
      prod = await this.productRepository.findOneBy({ id: term });
    } else {
      const queryBuilder = this.productRepository.createQueryBuilder('product');
      prod = await queryBuilder
        .where(`UPPER(code) =:code`, {
          code: term.toUpperCase(),
        })
        .getOne();
    }
    if (!prod) throw new NotFoundException('Product not found');

    return prod;
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    const product = await this.productRepository.preload({
      id,
      ...updateProductDto,
    });

    if (!product) throw new NotFoundException('Product not found');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.save(product);
      await queryRunner.commitTransaction();
      await queryRunner.release();
      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      this.handleException(error);
    }
  }

  async remove(id: string) {
    const product = await this.findOne(id);
    if (product) {
      await this.productRepository.remove(product);
    }
  }

  async deleteAllProducts() {
    const query = this.productRepository.createQueryBuilder('product');

    try {
      await query.delete().where({}).execute();
    } catch (error) {
      this.handleException(error);
    }
  }

  private handleException(error: any) {
    const errorCode = (error as { code?: string }).code;
    const errorDetail = (error as { detail?: string }).detail;
    if (errorCode === '23505') throw new BadRequestException(errorDetail);
    this.logger.error(error);
    throw new InternalServerErrorException('Unexpected error, check the logs');
  }
}
