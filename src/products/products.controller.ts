import {
  Body,
  Controller,
  Get,
  Param,
  Delete,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from 'src/products/dto/update-product.dto';
import { SyncProductDto } from './dto/sync-product.dto';
import { ProductsService } from 'src/products/products.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

// Interface para mapear los datos del Excel
interface ExcelRow {
  __EMPTY?: string; // Código
  LEYENDA?: string; // Nombre del producto
  __EMPTY_1?: string; // Tipo de uso
  __EMPTY_2?: string; // Categoría
  __EMPTY_3?: number; // Precio público
  __EMPTY_4?: number; // Rendimiento
  __EMPTY_5?: number; // Precio profesional
  __EMPTY_6?: string; // Activos
  __EMPTY_7?: string; // Tecnología (no usado en tu DTO)
  __EMPTY_8?: string; // Características para properties
  __EMPTY_9?: string; // Fase de tratamiento
  __EMPTY_10?: string; // Horario
  __EMPTY_11?: string; // Link de imagen
}

// Columnas del archivo de exportación/importación por id (formato propio,
// distinto del catálogo de marketing). El orden define el orden de columnas
// al exportar.
const PRODUCT_SYNC_HEADERS = [
  'id',
  'code',
  'name',
  'category',
  'publicPrice',
  'efficiency',
  'profesionalPrice',
  'actives',
  'properties',
  'phase',
  'time',
  'image',
  'weight',
] as const;

interface ProductSyncRow {
  id?: string;
  code?: string;
  name?: string;
  category?: string;
  publicPrice?: number;
  efficiency?: number;
  profesionalPrice?: number;
  actives?: string;
  properties?: string;
  phase?: string;
  time?: string;
  image?: string;
  weight?: number;
}

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  // Función helper para extraer propiedades del texto de características
  private extractPropertiesFromText(text: string): string[] {
    console.log('Extracting properties from text:', text);
    if (!text) return [];
    const specialCases = ['LÍNEA SPA 500'];
    if (specialCases.includes(text.trim())) {
      return [text.trim()];
    }
    return text
      .split(/\d+\./) // Dividir por números seguidos de punto
      .slice(1) // Remover el primer elemento vacío
      .map((prop) => prop.trim())
      .filter((prop) => prop && prop.length > 0)
      .map((prop) => prop.replace(/\s+/g, ' ')); // Normalizar espacios
  }

  // Función helper para eliminar archivo de forma segura
  private async deleteUploadedFile(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        console.log(`File deleted successfully: ${filePath}`);
      }
    } catch (error) {
      console.error(`Error deleting file ${filePath}:`, error);
      // No lanzar error para no afectar la respuesta principal
    }
  }

  // Función para mapear los datos del Excel a CreateProductDto
  private mapExcelToProductDto(rawData: ExcelRow[]): CreateProductDto[] {
    return rawData
      .filter((row) => {
        // Filtrar solo productos de casa o cabina
        const usage = row.__EMPTY_1?.trim();
        return usage === 'USO EN CASA' || usage === 'USO EN CABINA';
      })
      .filter(
        (row) =>
          // Validar campos esenciales
          row.__EMPTY && // Código
          row.LEYENDA, // Nombre
      )
      .map((row, idx) => {
        return {
          code: row?.__EMPTY!.trim(),
          name: row?.LEYENDA!.trim(),
          category: row?.__EMPTY_2!.trim(),
          publicPrice: row?.__EMPTY_3 || null,
          efficiency: row?.__EMPTY_4 || null,
          profesionalPrice: row.__EMPTY_5!,
          actives: row?.__EMPTY_6?.trim() || '',
          properties: this.extractPropertiesFromText(row?.__EMPTY_8 || ''),
          phase: row?.__EMPTY_9?.trim() || '',
          time: row?.__EMPTY_10?.trim() || '',
          image: row?.__EMPTY_11 ? row.__EMPTY_11.trim() : null,
          weight: idx + 1,
        };
      });
  }

  // Busca la hoja "FORMULADOR" (case-insensitive) dentro del libro; si no
  // existe, cae de vuelta a la primera hoja para no romper archivos antiguos.
  private findProductSheetName(workbook: XLSX.WorkBook): string {
    const match = workbook.SheetNames.find(
      (name) => name.trim().toLowerCase() === 'formulador',
    );
    return match ?? workbook.SheetNames[0];
  }

  // Convierte el texto pipe-delimitado de "properties" de vuelta a un array
  private parsePropertiesList(text?: string): string[] {
    if (!text) return [];
    return text
      .split('|')
      .map((prop) => prop.trim())
      .filter((prop) => prop.length > 0);
  }

  // Mapea las filas del archivo de sincronización (con columna id) a SyncProductDto
  private mapExcelToSyncProductDto(
    rawData: ProductSyncRow[],
  ): SyncProductDto[] {
    return rawData
      .filter((row) => row.code && row.name)
      .map((row, idx) => {
        return {
          id: row.id?.toString().trim() || undefined,
          code: row.code!.toString().trim(),
          name: row.name!.toString().trim(),
          category: row.category?.toString().trim() || '',
          publicPrice: row.publicPrice ?? null,
          efficiency: row.efficiency ?? null,
          profesionalPrice: row.profesionalPrice!,
          actives: row.actives?.toString().trim() || '',
          properties: this.parsePropertiesList(row.properties),
          phase: row.phase?.toString().trim() || '',
          time: row.time?.toString().trim() || '',
          image: row.image ? row.image.toString().trim() : null,
          weight: row.weight ?? idx + 1,
        };
      });
  }

  // NUEVO: Descarga todos los productos en un Excel con columna "id", para
  // luego re-subirlo por /products/import y sincronizar por id en vez de
  // depender de code/name.
  @Get('export')
  async exportProducts(@Res() response: Response) {
    const products = (await this.productsService.findAll()) ?? [];

    const rows = [...products]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((product) => ({
        id: product.id,
        code: product.code,
        name: product.name,
        category: product.category,
        publicPrice: product.publicPrice,
        efficiency: product.efficiency,
        profesionalPrice: product.profesionalPrice,
        actives: product.actives,
        properties: (product.properties ?? []).join(' | '),
        phase: product.phase,
        time: product.time,
        image: product.image,
        weight: product.weight,
      }));

    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: [...PRODUCT_SYNC_HEADERS],
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'FORMULADOR');

    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;

    const filename = `products-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    response.send(buffer);
  }

  // NUEVO: Sube el Excel exportado (con columna "id") y sincroniza la BD por
  // id: filas con id existente se actualizan, filas nuevas (sin id) se crean,
  // y cualquier producto en BD cuyo id no venga en el archivo se elimina.
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importProducts(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    try {
      const workbook = XLSX.readFile(file.path, { type: 'buffer' });
      const sheetName = this.findProductSheetName(workbook);
      const worksheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json<ProductSyncRow>(worksheet);

      const products = this.mapExcelToSyncProductDto(rawData);

      if (products.length === 0) {
        return {
          message: 'No valid products found in file',
          data: [],
          summary: { total: 0, processed: 0 },
        };
      }

      const result = await this.productsService.syncProductsById(products);

      return {
        message: 'Products synced successfully',
        result,
        ...(result.errors.length > 0 && { errors: result.errors }),
      };
    } catch (error) {
      console.error('Error importing products file:', error);
      throw new BadRequestException(
        `Error importing products file: ${error.message}`,
      );
    } finally {
      if (file.path) {
        await this.deleteUploadedFile(file.path);
      }
    }
  }

  @Post('file')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    try {
      // Leer el archivo Excel
      const workbook = XLSX.readFile(file.path, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      // sheet_to_json has a broad return type (unknown[]); assert the specific ExcelRow[] type for downstream processing
      const rawData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);

      // Mapear datos del Excel al DTO
      const products = this.mapExcelToProductDto(rawData);

      console.log(products);

      if (products.length === 0) {
        return {
          message: 'No valid products found in Excel file',
          data: [],
          summary: { total: 0, processed: 0 },
        };
      }

      console.log(`Found ${products.length} valid products to process`);

      // Procesar los productos (crear/actualizar)
      const result = await this.productsService.bulkUpsertProducts(products);

      // Estadísticas adicionales
      const homeProducts = products.filter(
        (p) =>
          p.category.includes('USO EN CASA') ||
          rawData.find(
            (r: ExcelRow) =>
              r.__EMPTY === p.code && r.__EMPTY_1 === 'USO EN CASA',
          ),
      );
      const cabinProducts = products.filter(
        (p) =>
          p.category.includes('USO EN CABINA') ||
          rawData.find(
            (r: ExcelRow) =>
              r.__EMPTY === p.code && r.__EMPTY_1 === 'USO EN CABINA',
          ),
      );

      return {
        message: 'File processed successfully',
        result: {
          ...result,
          details: {
            ...result.details,
            homeProducts: homeProducts.length,
            cabinProducts: cabinProducts.length,
          },
        },
        // Incluir errores solo si los hay
        ...(result.errors.length > 0 && { errors: result.errors }),
      };
    } catch (error) {
      console.error('Error processing Excel file:', error);
      throw new BadRequestException(
        `Error processing Excel file: ${error.message}`,
      );
    } finally {
      if (file.path) {
        await this.deleteUploadedFile(file.path);
      }
    }
  }

  // NUEVO: Endpoint para obtener estadísticas de la base de datos
  @Get('stats')
  async getProductStats() {
    const allProducts = await this.productsService.findAll();

    const stats = {
      total: allProducts?.length || 0,
      byCategory: (allProducts ?? []).reduce(
        (acc, product) => {
          acc[product.category] = (acc[product.category] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
      withImages: allProducts?.filter((p) => p.image).length,
      priceRanges: {
        under50k: allProducts?.filter((p) => p.profesionalPrice < 50000).length,
        between50kAnd100k: allProducts?.filter(
          (p) => p.profesionalPrice >= 50000 && p.profesionalPrice < 100000,
        ).length,
        above100k: allProducts?.filter((p) => p.profesionalPrice >= 100000)
          .length,
      },
    };

    return stats;
  }

  // NUEVO: Endpoint para verificar si un código existe
  @Get('check/:code')
  async checkProductExists(@Param('code') code: string) {
    const product = await this.productsService.findByCode(code);
    return {
      exists: !!product,
      product: product || null,
    };
  }

  @Get()
  getAllProducts() {
    return this.productsService.findAll();
  }

  @Get(':term')
  findOnePlain(@Param('term') term: string) {
    return this.productsService.findOne(term);
  }

  @Patch(':id')
  updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  deleteProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.remove(id);
  }

  // OPCIONAL: Endpoint para limpiar todos los productos (usar con cuidado)
  @Post('clear-all')
  async clearAllProducts() {
    await this.productsService.deleteAllProducts();
    return { message: 'All products deleted successfully' };
  }
}
