import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateKitDto } from './dto/create-kit.dto';
// import { UpdateKitDto } from './dto/update-kit.dto';
import { Kit } from 'src/kits/entities/kit.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { KitProduct } from 'src/kits/entities/kit-product.entity';
import { DataSource, Repository } from 'typeorm';
import { Product } from 'src/products/entities/product.entity';
import { validate as isUUID } from 'uuid';
import {
  BulkKitResult,
  KitStat,
  SyncKitResult,
} from 'src/kits/interfaces/kit-product.interface';

@Injectable()
export class KitsService {
  private readonly logger = new Logger('KitsService');

  constructor(
    @InjectRepository(Kit)
    private readonly kitRepository: Repository<Kit>,
    @InjectRepository(Product)
    private readonly productsRespository: Repository<Product>,
    @InjectRepository(KitProduct)
    private readonly kitProductRepository: Repository<KitProduct>,
    private readonly dataSource: DataSource,
  ) {}

  async create(createKitDto: CreateKitDto) {
    try {
      const kit = this.kitRepository.create(createKitDto);

      const products = await Promise.all(
        createKitDto.products.map(async (product) => {
          const productDB = await this.productsRespository.findOne({
            where: { code: product.code },
          });
          if (!productDB)
            throw new NotFoundException('Product not found ' + product.code);
          return {
            productDB,
            quantity: product.quantity,
          };
        }),
      );

      kit.kitProducts = products.map((product) => {
        return this.kitProductRepository.create({
          product: product.productDB,
          quantity: product.quantity,
        });
      });

      await this.kitRepository.save(kit);
      return kit;
    } catch (error) {
      this.handleException(error);
    }
  }

  async findAll() {
    return this.kitRepository.find({
      relations: {
        kitProducts: {
          product: true,
        },
      },
    });
  }

  async findOne(term: string) {
    let kit: Kit | null = null;
    if (isUUID(term)) {
      kit = await this.kitRepository.findOne({
        where: { id: term },
        relations: {
          kitProducts: {
            product: true,
          },
        },
      });
    } else {
      const queryBuilder = this.kitRepository.createQueryBuilder('kit');
      kit = await queryBuilder
        .where(`UPPER(name) =:name;`, {
          name: term.toUpperCase(),
        })
        .leftJoinAndSelect('kit.kitProducts', 'kitProduct')
        .getOne();
    }
    if (!kit) throw new NotFoundException('Kit not found');
    return kit;
  }

  async remove(id: string) {
    const kit = await this.findOne(id);
    if (kit) {
      await this.kitRepository.remove(kit);
    }
  }

  async deleteAllKits() {
    const query = this.kitRepository.createQueryBuilder('kit');
    const queryKitsProdcuts =
      this.kitProductRepository.createQueryBuilder('kitProduct');

    try {
      await queryKitsProdcuts.delete().where({}).execute();
      await query.delete().where({}).execute();
    } catch (error) {
      this.handleException(error);
    }
  }

  async processExcelKits(kitsData: CreateKitDto[]): Promise<BulkKitResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let created = 0;
    let updated = 0;
    const errors: Array<{ name: string; error: string }> = [];

    try {
      for (const kitData of kitsData) {
        try {
          // Buscar kit existente por nombre y categoría
          const existingKit = await queryRunner.manager.findOne(Kit, {
            where: {
              name: kitData.name,
              category: kitData.category,
            },
          });

          if (existingKit) {
            // Actualizar kit existente
            const updatedKit = queryRunner.manager.merge(
              Kit,
              existingKit,
              kitData,
            );
            await queryRunner.manager.save(updatedKit);
            updated++;
            this.logger.log(`Updated kit: ${kitData.name}`);
          } else {
            // Crear nuevo kit
            const newKit = queryRunner.manager.create(Kit, kitData);
            await queryRunner.manager.save(newKit);
            created++;
            this.logger.log(`Created kit: ${kitData.name}`);
          }
        } catch (error) {
          this.logger.error(`Error processing kit ${kitData.name}:`, error);
          errors.push({
            name: kitData.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      await queryRunner.commitTransaction();

      this.logger.log(
        `Bulk kit operation completed: ${created} created, ${updated} updated, ${errors.length} errors`,
      );

      return {
        created,
        updated,
        errors,
        summary: {
          total: kitsData.length,
          successful: created + updated,
          failed: errors.length,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Bulk kit operation failed:', error);
      throw new InternalServerErrorException(
        'Failed to process bulk kit operation',
      );
    } finally {
      await queryRunner.release();
    }
  }

  // NUEVO: Método optimizado para grandes volúmenes
  async bulkUpsertKits(kitsData: CreateKitDto[]): Promise<BulkKitResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Obtener kits existentes
      const existingKits = await queryRunner.manager
        .createQueryBuilder(Kit, 'kit')
        .select(['kit.id', 'kit.name', 'kit.category'])
        .where('(kit.name, kit.category) IN (:...pairs)', {
          pairs: kitsData.map((k) => [k.name, k.category]),
        })
        .getMany();

      console.log('Existing Kits:', existingKits);

      const existingKitsMap = new Map(
        existingKits.map((k) => [`${k.name}-${k.category}`, k.id]),
      );

      const toCreate: any[] = [];
      const toUpdate: any[] = [];

      // Separar kits a crear vs actualizar
      kitsData.forEach((kitData) => {
        const key = `${kitData.name}-${kitData.category}`;

        if (existingKitsMap.has(key)) {
          toUpdate.push({
            ...kitData,
            id: existingKitsMap.get(key),
          });
        } else {
          toCreate.push(kitData);
        }
      });

      let created = 0;
      let updated = 0;

      // Crear nuevos kits
      if (toCreate.length > 0) {
        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(Kit)
          .values(toCreate)
          .execute();
        created = toCreate.length;
        this.logger.log(`Created ${created} new kits`);
      }

      // Actualizar kits existentes
      if (toUpdate.length > 0) {
        await queryRunner.manager.save(Kit, toUpdate);
        updated = toUpdate.length;
        this.logger.log(`Updated ${updated} existing kits`);
      }

      await queryRunner.commitTransaction();

      return {
        created,
        updated,
        errors: [],
        summary: {
          total: kitsData.length,
          successful: created + updated,
          failed: 0,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Bulk kit upsert failed:', error);
      throw new InternalServerErrorException(
        'Failed to process bulk kit upsert',
      );
    } finally {
      await queryRunner.release();
    }
  }

  // NUEVO: Buscar kit por nombre y categoría
  async findByNameAndCategory(name: string, category: string) {
    try {
      return await this.kitRepository.findOne({
        where: { name, category },
      });
    } catch (error) {
      this.handleException(error);
    }
  }

  // NUEVO: Obtener kits por categoría
  async findByCategory(category: 'CASA' | 'CABINA') {
    try {
      return await this.kitRepository.find({
        where: { category },
      });
    } catch (error) {
      this.handleException(error);
    }
  }

  async getKitStatistics() {
    try {
      const stats = await this.kitRepository
        .createQueryBuilder('kit')
        .select(['kit.category', 'COUNT(*) as count'])
        .groupBy('kit.category')
        .getRawMany();

      const totalKits = await this.kitRepository.count();

      return {
        totalKits,
        byCategory: stats.reduce<Record<string, number>>(
          (acc, stat: KitStat) => {
            acc[stat.kit_category] = parseInt(stat.count);
            return acc;
          },
          {},
        ),
      };
    } catch (error) {
      this.handleException(error);
    }
  }

  // NUEVO: Método de sincronización completa con el Excel
  async syncKitsFromExcel(kitsData: CreateKitDto[]): Promise<SyncKitResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let created = 0;
    let updated = 0;
    let deleted = 0;
    const errors: Array<{ name: string; error: string }> = [];
    const details = {
      createdKits: [] as string[],
      updatedKits: [] as string[],
      deletedKits: [] as string[],
    };

    try {
      // 1. Obtener TODOS los kits existentes en la BD CON sus relaciones
      const allExistingKits = await queryRunner.manager.find(Kit, {
        relations: ['kitProducts'],
      });

      // 2. Extraer nombres de kits del Excel
      const excelKitNames = new Set(kitsData.map((kit) => kit.name));

      // 3. Crear mapa de kits existentes por nombre
      const existingKitsMap = new Map(
        allExistingKits.map((kit) => [kit.name, kit]),
      );

      // 4. Procesar kits del Excel (crear/actualizar)
      for (const kitData of kitsData) {
        try {
          const existingKit = existingKitsMap.get(kitData.name);

          if (existingKit) {
            // Kit existe - ACTUALIZAR
            // 1. Eliminar los KitProducts existentes
            if (existingKit.kitProducts && existingKit.kitProducts.length > 0) {
              await queryRunner.manager.remove(
                KitProduct,
                existingKit.kitProducts,
              );
            }

            // 2. Buscar los productos por código
            const products = await Promise.all(
              kitData.products.map(async (product) => {
                const productDB = await queryRunner.manager.findOne(Product, {
                  where: { code: product.code },
                });
                if (!productDB) {
                  throw new NotFoundException(
                    'Product not found ' + product.code,
                  );
                }
                return {
                  productDB,
                  quantity: product.quantity,
                };
              }),
            );

            // 3. Crear los nuevos KitProducts
            const newKitProducts = products.map((product) => {
              return queryRunner.manager.create(KitProduct, {
                product: product.productDB,
                quantity: product.quantity,
                kit: existingKit,
              });
            });

            // 4. Actualizar el kit con los nuevos datos
            existingKit.category = kitData.category;
            existingKit.name = kitData.name;
            existingKit.tips = kitData.tips ?? null;
            existingKit.protocol = kitData.protocol ?? null;
            existingKit.imageLink = kitData.imageLink ?? null;
            existingKit.weight = kitData.weight ?? null;
            existingKit.kitProducts = newKitProducts;

            await queryRunner.manager.save(Kit, existingKit);
            updated++;
            details.updatedKits.push(kitData.name);
            this.logger.log(`Updated kit: ${kitData.name}`);
          } else {
            // Kit nuevo - CREAR
            this.logger.log(`Creating new kit: ${kitData.name}`);

            // 1. Buscar los productos por código
            const products = await Promise.all(
              kitData.products.map(async (product) => {
                const productDB = await queryRunner.manager.findOne(Product, {
                  where: { code: product.code },
                });
                if (!productDB) {
                  throw new NotFoundException(
                    'Product not found ' + product.code,
                  );
                }
                return {
                  productDB,
                  quantity: product.quantity,
                };
              }),
            );

            // 2. Crear el kit
            const newKit = queryRunner.manager.create(Kit, {
              category: kitData.category,
              name: kitData.name,
              tips: kitData.tips,
              protocol: kitData.protocol,
              imageLink: kitData.imageLink,
              weight: kitData.weight,
            });

            // 3. Crear los KitProducts
            newKit.kitProducts = products.map((product) => {
              return queryRunner.manager.create(KitProduct, {
                product: product.productDB,
                quantity: product.quantity,
              });
            });

            await queryRunner.manager.save(Kit, newKit);
            created++;
            details.createdKits.push(kitData.name);
            this.logger.log(`Created kit: ${kitData.name}`);
          }
        } catch (error) {
          this.logger.error(`Error processing kit ${kitData.name}:`, error);
          errors.push({
            name: kitData.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // 5. ELIMINAR kits que están en BD pero NO en el Excel
      const kitsToDelete = allExistingKits.filter(
        (kit) => !excelKitNames.has(kit.name),
      );

      for (const kitToDelete of kitsToDelete) {
        try {
          await queryRunner.manager.remove(Kit, kitToDelete);
          deleted++;
          details.deletedKits.push(kitToDelete.name);
          this.logger.log(`Deleted kit: ${kitToDelete.name}`);
        } catch (error) {
          this.logger.error(`Error deleting kit ${kitToDelete.name}:`, error);
          errors.push({
            name: kitToDelete.name,
            error: `Delete error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }

      await queryRunner.commitTransaction();

      this.logger.log(
        `Sync operation completed: ${created} created, ${updated} updated, ${deleted} deleted, ${errors.length} errors`,
      );

      return {
        created,
        updated,
        deleted,
        errors,
        summary: {
          total: kitsData.length + kitsToDelete.length,
          successful: created + updated + deleted,
          failed: errors.length,
        },
        details,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Sync operation failed:', error);
      throw new InternalServerErrorException('Failed to sync kits from Excel');
    } finally {
      await queryRunner.release();
    }
  }

  // NUEVO: Método optimizado de sincronización para grandes volúmenes
  async bulkSyncKitsFromExcel(
    kitsData: CreateKitDto[],
  ): Promise<SyncKitResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const names = kitsData.map((kit) => kit.name);
      // 1. Obtener todos los kits existentes
      const allExistingKits = await queryRunner.manager
        .createQueryBuilder(Kit, 'kit')
        .select(['kit.id', 'kit.name'])
        .where('kit.name IN (:...names)', { names })
        .getMany();
      console.log('All Existing Kits:', allExistingKits);

      // 2. Crear sets y maps para operaciones eficientes
      const excelKitNames = new Set(kitsData.map((kit) => kit.name));
      const existingKitsMap = new Map(
        allExistingKits.map((kit) => [kit.name, kit.id]),
      );

      // 3. Separar operaciones
      const toCreate: CreateKitDto[] = [];
      const toUpdate: Array<CreateKitDto & { id: string }> = [];
      const toDelete: string[] = []; // IDs de kits a eliminar

      // Clasificar kits del Excel
      kitsData.forEach((kitData) => {
        if (existingKitsMap.has(kitData.name)) {
          toUpdate.push({
            ...kitData,
            id: existingKitsMap.get(kitData.name)!,
          });
        } else {
          toCreate.push(kitData);
        }
      });

      // Identificar kits a eliminar (están en BD pero no en Excel)
      allExistingKits.forEach((existingKit) => {
        if (!excelKitNames.has(existingKit.name)) {
          toDelete.push(existingKit.id);
        }
      });

      let created = 0;
      let updated = 0;
      let deleted = 0;

      // 4. Ejecutar operaciones en lotes
      // CREAR nuevos kits
      if (toCreate.length > 0) {
        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(Kit)
          .values(toCreate)
          .execute();
        created = toCreate.length;
        this.logger.log(`Created ${created} new kits`);
      }

      // ACTUALIZAR kits existentes
      if (toUpdate.length > 0) {
        await queryRunner.manager.save(Kit, toUpdate);
        updated = toUpdate.length;
        this.logger.log(`Updated ${updated} existing kits`);
      }

      // ELIMINAR kits que no están en Excel
      if (toDelete.length > 0) {
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(Kit)
          .where('id IN (:...ids)', { ids: toDelete })
          .execute();
        deleted = toDelete.length;
        this.logger.log(`Deleted ${deleted} kits not in Excel`);
      }

      await queryRunner.commitTransaction();

      // Crear nombres para el detalle
      const details = {
        createdKits: toCreate.map((k) => k.name),
        updatedKits: toUpdate.map((k) => k.name),
        deletedKits: allExistingKits
          .filter((k) => toDelete.includes(k.id))
          .map((k) => k.name),
      };

      return {
        created,
        updated,
        deleted,
        errors: [],
        summary: {
          total: kitsData.length + toDelete.length,
          successful: created + updated + deleted,
          failed: 0,
        },
        details,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Bulk sync operation failed:', error);
      throw new InternalServerErrorException(
        'Failed to bulk sync kits from Excel',
      );
    } finally {
      await queryRunner.release();
    }
  }

  // NUEVO: Obtener preview de cambios sin ejecutar
  async previewSyncChanges(kitsData: CreateKitDto[]) {
    try {
      const allExistingKits = await this.kitRepository.find({
        select: ['id', 'name'],
      });

      const excelKitNames = new Set(kitsData.map((kit) => kit.name));
      const existingKitNames = new Set(allExistingKits.map((kit) => kit.name));

      const toCreate = kitsData
        .filter((kit) => !existingKitNames.has(kit.name))
        .map((kit) => kit.name);

      const toUpdate = kitsData
        .filter((kit) => existingKitNames.has(kit.name))
        .map((kit) => kit.name);

      const toDelete = allExistingKits
        .filter((kit) => !excelKitNames.has(kit.name))
        .map((kit) => kit.name);

      return {
        toCreate,
        toUpdate,
        toDelete,
        summary: {
          total: toCreate.length + toUpdate.length + toDelete.length,
          creates: toCreate.length,
          updates: toUpdate.length,
          deletes: toDelete.length,
        },
      };
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
