import { Module } from '@nestjs/common';
import { PrinterService } from './printer.service';
import { ImageOptimizerService } from 'src/common/services/image-optimizer.service';

@Module({
  providers: [PrinterService, ImageOptimizerService],
  exports: [PrinterService],
})
export class PrinterModule {}
