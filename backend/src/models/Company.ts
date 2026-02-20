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
  HasMany,
  Default
} from "sequelize-typescript";
import Plan from "./Plan";
import User from "./User";
import Queue from "./Queue";
import Whatsapp from "./Whatsapp";
import Contact from "./Contact";
import Ticket from "./Ticket";
import QuickAnswer from "./QuickAnswer";
import Tag from "./Tag";
import Schedule from "./Schedule";

@Table
class Company extends Model<Company> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  name: string;

  @Default("active")
  @Column
  status: string;

  @Column
  dueDate: Date;

  @ForeignKey(() => Plan)
  @Column
  planId: number;

  @BelongsTo(() => Plan)
  plan: Plan;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => User)
  users: User[];

  @HasMany(() => Queue)
  queues: Queue[];

  @HasMany(() => Whatsapp)
  whatsapps: Whatsapp[];

  @HasMany(() => Contact)
  contacts: Contact[];

  @HasMany(() => Ticket)
  tickets: Ticket[];

  @HasMany(() => QuickAnswer)
  quickAnswers: QuickAnswer[];

  @HasMany(() => Tag)
  tags: Tag[];

  @HasMany(() => Schedule)
  schedules: Schedule[];
}

export default Company;

