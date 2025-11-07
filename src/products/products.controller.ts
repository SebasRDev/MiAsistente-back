import {
  Body,
  Controller,
  Get,
  Param,
  Delete,
  ParseUUIDPipe,
  Patch,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from 'src/products/dto/update-product.dto';
import { ProductsService } from 'src/products/products.service';
import { FileInterceptor } from '@nestjs/platform-express';
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
        console.log('Mapping row:', row);
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

  @Post('file')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log('Processing Excel file:', file.originalname);

      // Leer el archivo Excel
      const workbook = XLSX.readFile(file.path, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      // sheet_to_json has a broad return type (unknown[]); assert the specific ExcelRow[] type for downstream processing
      const rawData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);

      console.log(`Extracted ${rawData.length} rows from Excel file`);

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
