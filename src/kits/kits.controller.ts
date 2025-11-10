import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { KitsService } from './kits.service';
import { CreateKitDto } from './dto/create-kit.dto';
import { UpdateKitDto } from './dto/update-kit.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

// Interfaces para tipado seguro
interface KitProduct {
  code: string;
  quantity: number;
}

interface KitProtocol {
  dia: string[];
  noche: string[];
}

interface ProcessedKit {
  category: string;
  weight: number;
  name: string;
  products: KitProduct[];
  tips: string[];
  protocol: KitProtocol;
  imageLink: string | null;
}

interface BulkKitResult {
  created: number;
  updated: number;
  errors: Array<{ name: string; error: string }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

@Controller('kits')
export class KitsController {
  constructor(private readonly kitsService: KitsService) {}

  @Post()
  create(@Body() createKitDto: CreateKitDto): Promise<any> {
    return this.kitsService.create(createKitDto);
  }

  // Función para eliminar archivo de forma segura
  private async deleteUploadedFile(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        console.log(`File deleted successfully: ${filePath}`);
      }
    } catch (error) {
      console.error(`Error deleting file ${filePath}:`, error);
    }
  }

  // Función para extraer pasos del protocolo
  private extractProtocolSteps(protocolText: string): string[] {
    if (!protocolText) return [];

    let cleanText = protocolText.trim();
    cleanText = cleanText.replace(/^"|"$/g, '');

    // Si no hay números, asumimos que es un solo paso
    if (!cleanText.match(/\d+\./)) {
      return [cleanText];
    }

    // Dividir por líneas y procesarlas
    const lines = cleanText.split(/\r?\n/);

    if (lines.length > 1) {
      const steps: string[] = [];
      const stepRegex = /^\s*(\d+)\.\s+(.+)$/;

      for (const line of lines) {
        const match = line.match(stepRegex);
        if (match && match[2]) {
          steps.push(match[2].trim());
        }
      }

      if (steps.length > 0) {
        return steps;
      }
    }

    // Para texto que tiene números pero no está en líneas separadas
    const splitSteps = cleanText.split(/\s+\d+\.\s+/);
    const steps = splitSteps.filter(Boolean).map((step) => step.trim());

    return steps.length > 0 ? steps : [cleanText];
  }

  // Función para procesar un kit individual
  private processKit(kitLines: string[], idx: number): ProcessedKit | null {
    const headerLine = kitLines[0]?.split('\t');
    if (!headerLine || headerLine.length < 2) return null;

    const category = headerLine[0]?.trim() || '';
    const kitName = headerLine[1]?.trim() || '';

    if (!category || !kitName) return null;

    const products: KitProduct[] = [];
    const tips: string[] = [];
    const protocol: KitProtocol = { dia: [], noche: [] };
    let imageLink: string | null = null;

    // Encontrar índices para protocolos de día y noche
    const diaIndex = kitLines.findIndex(
      (line) =>
        line.includes('\tDÍA\t') ||
        line.includes('\tDIA\t') ||
        line.split('\t')[6]?.trim() === 'DÍA' ||
        line.split('\t')[6]?.trim() === 'DIA',
    );

    const nocheIndex = kitLines.findIndex(
      (line) =>
        line.includes('\tNOCHE\t') || line.split('\t')[6]?.trim() === 'NOCHE',
    );

    // Procesar cada línea para extraer información
    kitLines.forEach((line, i) => {
      const columns = line.split('\t');

      // Extraer productos (columnas 3, 4 y 5: código, cantidad y nombre del producto)
      if (columns.length >= 5 && columns[2]?.trim() && columns[3]?.trim()) {
        const code = columns[2]?.trim();
        const productName = columns[4]?.trim();

        if (code && code !== 'CODIGO' && code !== 'PRODUCTOS') {
          const quantity = parseInt(columns[3]?.trim() || '1', 10) || 1;
          products.push({
            code,
            quantity,
          });
        }
      }

      // Extraer tips (columna 6)
      if (columns.length >= 6 && columns[5]?.trim()) {
        const tip = columns[5]?.trim();
        if (tip && tip !== 'TIPS' && tip.match(/^\d+\.\s/)) {
          tips.push(tip);
        }
      }

      // Extraer link de imagen (columna 8)
      if (columns.length >= 8 && columns[7]?.trim()?.startsWith('http')) {
        imageLink = columns[7].trim();
      }
    });

    // Buscar protocolos de día y noche
    kitLines.forEach((line, i) => {
      const columns = line.split('\t');

      // Identificar protocolos de día
      if (
        diaIndex !== -1 &&
        i > diaIndex &&
        (i < nocheIndex || nocheIndex === -1)
      ) {
        if (columns.length >= 7 && columns[6]?.includes('1.')) {
          protocol.dia = this.extractProtocolSteps(columns[6]);
        }
      }
      // Identificar protocolos de noche
      else if (nocheIndex !== -1 && i > nocheIndex) {
        if (columns.length >= 7 && columns[6]?.includes('1.')) {
          protocol.noche = this.extractProtocolSteps(columns[6]);
        }
      }
    });

    return {
      category,
      weight: idx + 1,
      name: kitName,
      products,
      tips,
      protocol,
      imageLink,
    };
  }

  // Función para extraer kits del contenido del Excel
  private extractKits(lines: string[]): ProcessedKit[] {
    // Ignorar la primera línea si es un encabezado
    const dataLines =
      lines[0]?.includes('TIPO') && lines[0]?.includes('NOMBRE')
        ? lines.slice(1)
        : lines;

    // Identificar las líneas donde se encuentran los encabezados de kits
    const kitStartIndices: number[] = [];

    // Buscar líneas que indican el inicio de un nuevo kit
    for (let i = 0; i < dataLines.length; i++) {
      const columns = dataLines[i]?.split('\t');
      if (columns && columns.length >= 2) {
        const firstCol = columns[0]?.trim();
        // Si la primera columna contiene CASA o CABINA, es el inicio de un kit
        if (firstCol === 'CASA' || firstCol === 'CABINA') {
          kitStartIndices.push(i);
        }
      }
    }

    // Para cada kit, procesamos sus datos
    return kitStartIndices
      .map((startIndex, i) => {
        const endIndex =
          i < kitStartIndices.length - 1
            ? kitStartIndices[i + 1]
            : dataLines.length;
        const kitLines = dataLines.slice(startIndex, endIndex);
        return this.processKit(kitLines, i);
      })
      .filter((kit): kit is ProcessedKit => kit !== null);
  }

  // Función para mapear ProcessedKit a CreateKitDto
  private mapProcessedKitToDto(
    processedKit: ProcessedKit,
    idx: number,
  ): CreateKitDto {
    return {
      category: processedKit.category as 'CASA' | 'CABINA',
      name: processedKit.name,
      products: processedKit.products,
      tips: processedKit.tips,
      protocol: processedKit.protocol,
      imageLink: processedKit.imageLink,
      weight: idx + 1,
    };
  }

  @Post('file')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('preview') preview?: string, // Opcional: preview de cambios
  ): Promise<any> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    let filePath: string | null = null;

    try {
      filePath = file.path;
      // await this.kitsService.deleteAllKits();

      // Leer el archivo Excel
      const workbook = XLSX.readFile(filePath, {
        cellDates: true,
        cellNF: true,
        cellStyles: true,
      });

      const targetSheetName = 'KITS CASA Y PROTOCOLOS CABINA';
      let worksheet: XLSX.WorkSheet;

      if (workbook.SheetNames.includes(targetSheetName)) {
        console.log(`Processing sheet: ${targetSheetName}`);
        worksheet = workbook.Sheets[targetSheetName];
      } else {
        const firstSheet = workbook.SheetNames[0];
        console.warn(
          `Warning: Sheet "${targetSheetName}" not found. Using first sheet: ${firstSheet}`,
        );
        if (!firstSheet) {
          throw new BadRequestException('No sheets found in Excel file');
        }
        worksheet = workbook.Sheets[firstSheet];
      }

      if (!worksheet) {
        throw new BadRequestException('Could not read worksheet');
      }

      // Convertir a CSV y procesar
      const content = XLSX.utils.sheet_to_csv(worksheet, {
        FS: '\t',
        RS: '\n',
      });
      const lines = content.split('\n').filter((line) => line.trim() !== '');

      if (lines.length === 0) {
        return {
          message: 'No valid data found in Excel file',
          data: [],
          summary: { total: 0, processed: 0 },
        };
      }

      // Extraer kits del contenido
      const processedKits = this.extractKits(lines);

      if (processedKits.length === 0) {
        return {
          message: 'No valid kits found in Excel file',
          data: [],
          summary: { total: 0, processed: 0 },
        };
      }

      console.log(`Found ${processedKits.length} kits to process`);

      // Convertir a DTOs
      const kitDtos = processedKits.map((kit, idx) =>
        this.mapProcessedKitToDto(kit, idx),
      );

      // Si es preview, solo mostrar los cambios sin ejecutar
      if (preview === 'true') {
        const previewData = await this.kitsService.previewSyncChanges(kitDtos);
        return {
          message: 'Preview of changes (not executed)',
          preview: previewData,
          kitsFromExcel: processedKits.map((kit) => ({
            category: kit.category,
            name: kit.name,
            productsCount: kit.products.length,
            tipsCount: kit.tips.length,
            hasProtocol:
              kit.protocol.dia.length > 0 || kit.protocol.noche.length > 0,
            hasImage: !!kit.imageLink,
          })),
        };
      }

      // NUEVO: Usar sincronización completa (crear/actualizar/eliminar)
      const result = await this.kitsService.syncKitsFromExcel(kitDtos);

      return {
        message: 'Kits synchronized successfully with database',
        result: {
          ...result,
          operations: {
            created: `${result.created} kits created`,
            updated: `${result.updated} kits updated`,
            deleted: `${result.deleted} kits deleted (not in Excel)`,
          },
        },
        details: {
          created: result.details.createdKits,
          updated: result.details.updatedKits,
          deleted: result.details.deletedKits,
        },
        kitsFromExcel: processedKits.map((kit) => ({
          category: kit.category,
          name: kit.name,
          productsCount: kit.products.length,
          tipsCount: kit.tips.length,
          hasProtocol:
            kit.protocol.dia.length > 0 || kit.protocol.noche.length > 0,
          hasImage: !!kit.imageLink,
        })),
      };
    } catch (error) {
      console.error('Error processing Excel file:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(
        `Error processing Excel file: ${errorMessage}`,
      );
    } finally {
      // Eliminar el archivo siempre
      if (filePath) {
        await this.deleteUploadedFile(filePath);
      }
    }
  }

  // NUEVO: Endpoint para preview de cambios sin ejecutar
  @Post('preview-sync')
  @UseInterceptors(FileInterceptor('file'))
  async previewSync(@UploadedFile() file: Express.Multer.File): Promise<any> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    let filePath: string | null = null;

    try {
      filePath = file.path;

      // Procesar archivo igual que uploadFile pero solo preview
      const workbook = XLSX.readFile(filePath, {
        cellDates: true,
        cellNF: true,
        cellStyles: true,
      });

      const targetSheetName = 'KITS CASA Y PROTOCOLOS CABINA';
      const worksheet = workbook.SheetNames.includes(targetSheetName)
        ? workbook.Sheets[targetSheetName]
        : workbook.Sheets[workbook.SheetNames[0]];

      const content = XLSX.utils.sheet_to_csv(worksheet, {
        FS: '\t',
        RS: '\n',
      });
      const lines = content.split('\n').filter((line) => line.trim() !== '');
      const processedKits = this.extractKits(lines);
      const kitDtos = processedKits.map((kit, idx) =>
        this.mapProcessedKitToDto(kit, idx),
      );

      const previewData = await this.kitsService.previewSyncChanges(kitDtos);

      return {
        message: 'Preview of sync operations (not executed)',
        preview: previewData,
        details: {
          willCreate: previewData?.toCreate,
          willUpdate: previewData?.toUpdate,
          willDelete: previewData?.toDelete,
        },
      };
    } catch (error) {
      console.error('Error previewing sync:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Error previewing sync: ${errorMessage}`);
    } finally {
      if (filePath) {
        await this.deleteUploadedFile(filePath);
      }
    }
  }

  // NUEVO: Endpoint para obtener estadísticas de la sincronización
  @Get('sync-stats')
  async getSyncStats(): Promise<any> {
    const stats = await this.kitsService.getKitStatistics();
    return {
      message: 'Current database statistics',
      stats,
    };
  }

  @Get()
  findAll(): Promise<any> {
    return this.kitsService.findAll();
  }

  @Get(':term')
  findOne(@Param('term') term: string): Promise<any> {
    return this.kitsService.findOne(term);
  }

  // @Patch(':id')
  // update(
  //   @Param('id', ParseUUIDPipe) id: string,
  //   @Body() updateKitDto: UpdateKitDto,
  // ): Promise<any> {
  //   return this.kitsService.update(id, updateKitDto);
  // }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<any> {
    return this.kitsService.remove(id);
  }

  // Endpoint adicional para obtener estadísticas de kits
  @Get('stats/summary')
  async getKitsStats(): Promise<any> {
    const allKits = await this.kitsService.findAll();

    const stats = {
      total: allKits.length,
      byCategory: allKits.reduce((acc: Record<string, number>, kit: any) => {
        acc[kit.category] = (acc[kit.category] || 0) + 1;
        return acc;
      }, {}),
      withImages: allKits.filter((kit: any) => kit.imageLink).length,
      withProtocols: allKits.filter(
        (kit: any) =>
          kit.protocol?.dia?.length > 0 || kit.protocol?.noche?.length > 0,
      ).length,
    };

    return stats;
  }

  // Endpoint para limpiar archivos huérfanos
  @Post('cleanup-uploads')
  async cleanupUploads(): Promise<any> {
    try {
      const uploadsDir = './uploads';

      if (!fs.existsSync(uploadsDir)) {
        return { message: 'Uploads directory does not exist' };
      }

      const files = await fs.promises.readdir(uploadsDir);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = `${uploadsDir}/${file}`;
        const stats = await fs.promises.stat(filePath);

        // Eliminar archivos más antiguos de 1 hora
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (stats.mtime < oneHourAgo) {
          await fs.promises.unlink(filePath);
          deletedCount++;
        }
      }

      return {
        message: `Cleanup completed: ${deletedCount} files deleted`,
        deletedCount,
      };
    } catch (error) {
      console.error('Error during cleanup:', error);
      throw new BadRequestException('Error during cleanup process');
    }
  }
}
