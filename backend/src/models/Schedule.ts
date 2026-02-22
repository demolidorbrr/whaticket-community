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
  Default
} from "sequelize-typescript";

import Ticket from "./Ticket";
import Contact from "./Contact";
import User from "./User";

@Table
class Schedule extends Model<Schedule> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  companyId: number;

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
