import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  DataType,
  Default,
  BeforeFind,
  BeforeCount,
  BeforeBulkUpdate,
  BeforeBulkDestroy,
  BeforeCreate,
  BeforeBulkCreate
} from "sequelize-typescript";

import Ticket from "./Ticket";
import Contact from "./Contact";
import User from "./User";
import Company from "./Company";
import {
  applyTenantScope,
  applyTenantScopeToBulkInstances,
  applyTenantScopeToInstance
} from "../helpers/ApplyTenantScope";

@Table
class Schedule extends Model<Schedule> {
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
  static assignCompanyId(instance: Schedule): void {
    applyTenantScopeToInstance(instance);
  }

  @BeforeBulkCreate
  static assignCompanyIdToBulk(instances: Schedule[]): void {
    applyTenantScopeToBulkInstances(instances);
  }

  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @Column(DataType.TEXT)
  body: string;

  @Column(DataType.DATE(6))
  sendAt: Date;

  @Default("pending")
  @Column
  status: string;

  @Column(DataType.DATE(6))
  sentAt: Date;

  @Column(DataType.TEXT)
  errorMessage: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Schedule;

