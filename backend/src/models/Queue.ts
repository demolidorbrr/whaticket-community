import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  BelongsToMany,
  Default,
  DataType,
  ForeignKey,
  BelongsTo,
  BeforeFind,
  BeforeCount,
  BeforeBulkUpdate,
  BeforeBulkDestroy,
  BeforeCreate,
  BeforeBulkCreate
} from "sequelize-typescript";
import User from "./User";
import UserQueue from "./UserQueue";

import Whatsapp from "./Whatsapp";
import WhatsappQueue from "./WhatsappQueue";
import Company from "./Company";
import {
  applyTenantScope,
  applyTenantScopeToBulkInstances,
  applyTenantScopeToInstance
} from "../helpers/ApplyTenantScope";

@Table
class Queue extends Model<Queue> {
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
  static assignCompanyId(instance: Queue): void {
    applyTenantScopeToInstance(instance);
  }

  @BeforeBulkCreate
  static assignCompanyIdToBulk(instances: Queue[]): void {
    applyTenantScopeToBulkInstances(instances);
  }

  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @AllowNull(false)
  @Column
  color: string;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Column
  greetingMessage: string;

  @Default(false)
  @Column
  aiEnabled: boolean;

  @Default("triage")
  @Column
  aiMode: string;

  @Default(false)
  @Column
  aiAutoReply: boolean;

  @Column(DataType.TEXT)
  aiPrompt: string;

  @Column
  aiWebhookUrl: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsToMany(() => Whatsapp, () => WhatsappQueue)
  whatsapps: Array<Whatsapp & { WhatsappQueue: WhatsappQueue }>;

  @BelongsToMany(() => User, () => UserQueue)
  users: Array<User & { UserQueue: UserQueue }>;
}

export default Queue;

