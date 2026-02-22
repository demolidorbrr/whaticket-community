import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  Default,
  AllowNull,
  HasMany,
  BelongsToMany,
  ForeignKey,
  BelongsTo,
  BeforeFind,
  BeforeCount,
  BeforeBulkUpdate,
  BeforeBulkDestroy,
  BeforeCreate,
  BeforeBulkCreate
} from "sequelize-typescript";
import Queue from "./Queue";
import Ticket from "./Ticket";
import WhatsappQueue from "./WhatsappQueue";
import Company from "./Company";
import {
  applyTenantScope,
  applyTenantScopeToBulkInstances,
  applyTenantScopeToInstance
} from "../helpers/ApplyTenantScope";

@Table
class Whatsapp extends Model<Whatsapp> {
  @BeforeFind
  @BeforeCount
  static applyTenantFilter(options: Record<string, unknown>): void {
    applyTenantScope(options);
  }

  @BeforeBulkUpdate
  @BeforeBulkDestroy
  static applyTenantFilterToBulkOperations(
    options: Record<string, unknown>
  ): void {
    applyTenantScope(options);
  }

  @BeforeCreate
  static assignCompanyId(instance: Whatsapp): void {
    applyTenantScopeToInstance(instance);
  }

  @BeforeBulkCreate
  static assignCompanyIdToBulk(instances: Whatsapp[]): void {
    applyTenantScopeToBulkInstances(instances);
  }

  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  companyId: number;

  @AllowNull
  @Column(DataType.TEXT)
  name: string;

  @Column(DataType.TEXT)
  session: string;

  @Column(DataType.TEXT)
  qrcode: string;

  @Column
  status: string;

  @Column
  battery: string;

  @Column
  plugged: boolean;

  @Column
  retries: number;

  @Column(DataType.TEXT)
  greetingMessage: string;

  @Column(DataType.TEXT)
  farewellMessage: string;

  @Default(false)
  @AllowNull
  @Column
  isDefault: boolean;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => Ticket)
  tickets: Ticket[];

  @BelongsToMany(() => Queue, () => WhatsappQueue)
  queues: Array<Queue & { WhatsappQueue: WhatsappQueue }>;

  @HasMany(() => WhatsappQueue)
  whatsappQueues: WhatsappQueue[];
}

export default Whatsapp;

