import { Entity, Column, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Kit } from './kit.entity';
import { Product } from 'src/products/entities/product.entity';

@Entity('kit_products')
export class KitProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('integer')
  quantity: number;

  @ManyToOne(() => Kit, (kit) => kit.kitProducts, { onDelete: 'CASCADE' })
  kit: Kit;

  @ManyToOne(() => Product, (product) => product.kitProducts)
  product: Product;
}
