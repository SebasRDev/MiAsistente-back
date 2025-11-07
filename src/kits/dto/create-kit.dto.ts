import { Type } from 'class-transformer';
import {
  IsString,
  IsArray,
  ValidateNested,
  IsObject,
  IsOptional,
  IsNumber,
} from 'class-validator';
import { KitProductDto } from './kit-product.dto';

class Protocol {
  @IsArray()
  @IsString({ each: true })
  dia: string[];

  @IsArray()
  @IsString({ each: true })
  noche: string[];
}

export class CreateKitDto {
  @IsString()
  category: string;

  @IsString()
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KitProductDto)
  products: KitProductDto[];

  @IsArray()
  @IsString({ each: true })
  tips: string[];

  @IsObject()
  @ValidateNested()
  @Type(() => Protocol)
  protocol: Protocol;

  @IsOptional()
  @IsString()
  imageLink?: string | null;

  @IsNumber()
  weight: number;
}
