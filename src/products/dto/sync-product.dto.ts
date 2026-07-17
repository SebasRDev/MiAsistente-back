import { IsOptional, IsUUID } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

// Fila del archivo de sincronización: igual que CreateProductDto, pero con un
// id opcional. Si viene y coincide con un producto existente, se actualiza esa
// fila; si no viene (o no coincide con ningún producto), se crea uno nuevo.
export class SyncProductDto extends CreateProductDto {
  @IsOptional()
  @IsUUID()
  readonly id?: string;
}
