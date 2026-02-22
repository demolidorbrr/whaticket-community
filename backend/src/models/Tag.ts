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
  ForeignKey,
  BelongsTo,
  BeforeFind,
  BeforeCount,
  BeforeBulkUpdate,
  BeforeBulkDestroy,
  BeforeCreate,
  BeforeBulkCreate
} from "sequelize-typescript";
import Ticket from "./Ticket";
import TicketTag from "./TicketTag";
import Company from "./Company";
import {
  applyTenantScope,
  applyTenantScopeToBulkInstances,
  applyTenantScopeToInstance
} from "../helpers/ApplyTenantScope";

@Table
class Tag extends Model<Tag> {
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
  static assignCompanyId(instance: Tag): void {
    applyTenantScopeToInstance(instance);
  }

  @BeforeBulkCreate
  static assignCompanyIdToBulk(instances: Tag[]): void {
    applyTenantScopeToBulkInstances(instances);
  }

  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Column
  color: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsToMany(() => Ticket, () => TicketTag)
  tickets: Array<Ticket & { TicketTag: TicketTag }>;
}

export default Tag;

