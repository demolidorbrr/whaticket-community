import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  ForeignKey,
  BelongsTo,
  HasMany,
  AutoIncrement,
  Default,
  BelongsToMany,
  DataType
} from "sequelize-typescript";

import Contact from "./Contact";
import Message from "./Message";
import Queue from "./Queue";
import User from "./User";
import Whatsapp from "./Whatsapp";
import Tag from "./Tag";
import TicketTag from "./TicketTag";
import TicketEvent from "./TicketEvent";

@Table
class Ticket extends Model<Ticket> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column({ defaultValue: "pending" })
  status: string;

  @Column
  unreadMessages: number;

  @Column
  lastMessage: string;

  @Default(false)
  @Column
  isGroup: boolean;

  @Default(0)
  @Column
  leadScore: number;

  @Default("whatsapp")
  @Column
  channel: string;

  @Column(DataType.DATE(6))
  slaDueAt: Date;

  @Column(DataType.DATE(6))
  firstHumanResponseAt: Date;

  @Column(DataType.DATE(6))
  resolvedAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @ForeignKey(() => Whatsapp)
  @Column
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @ForeignKey(() => Queue)
  @Column
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  @HasMany(() => Message)
  messages: Message[];

  @BelongsToMany(() => Tag, () => TicketTag)
  tags: Array<Tag & { TicketTag: TicketTag }>;

  @HasMany(() => TicketEvent)
  events: TicketEvent[];
}

export default Ticket;
