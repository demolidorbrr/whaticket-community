import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  HasMany,
  ForeignKey,
  BelongsTo,
  BeforeFind,
  BeforeCount,
  BeforeBulkUpdate,
  BeforeBulkDestroy,
  BeforeCreate,
  BeforeBulkCreate
} from "sequelize-typescript";
import ContactCustomField from "./ContactCustomField";
import Ticket from "./Ticket";
import Company from "./Company";
import {
  applyTenantScope,
  applyTenantScopeToBulkInstances,
  applyTenantScopeToInstance
} from "../helpers/ApplyTenantScope";

@Table
class Contact extends Model<Contact> {
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
  static assignCompanyId(instance: Contact): void {
    applyTenantScopeToInstance(instance);
  }

  @BeforeBulkCreate
  static assignCompanyIdToBulk(instances: Contact[]): void {
    applyTenantScopeToBulkInstances(instances);
  }

  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  companyId: number;

  @Column
  name: string;

  @Column
  number: string;

  @Column
  lid: string;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @AllowNull(false)
  @Default("")
  @Column
  email: string;

  @Column
  profilePicUrl: string;

  @Default(false)
  @Column
  isGroup: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => Ticket)
  tickets: Ticket[];

  @HasMany(() => ContactCustomField)
  extraInfo: ContactCustomField[];
}

export default Contact;

