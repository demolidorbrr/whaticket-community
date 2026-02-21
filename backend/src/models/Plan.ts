import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  Default,
  HasMany
} from "sequelize-typescript";
import Company from "./Company";

@Table
class Plan extends Model<Plan> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  name: string;

  @Default(0)
  @Column
  usersLimit: number;

  @Default(0)
  @Column
  connectionsLimit: number;

  @Default(0)
  @Column
  queuesLimit: number;

  @Default(0)
  @Column
  price: number;

  @Default(true)
  @Column
  campaignsEnabled: boolean;

  @Default(true)
  @Column
  schedulesEnabled: boolean;

  @Default(true)
  @Column
  internalChatEnabled: boolean;

  @Default(true)
  @Column
  apiEnabled: boolean;

  @Default(true)
  @Column
  kanbanEnabled: boolean;

  @Default(true)
  @Column
  openAiEnabled: boolean;

  @Default(true)
  @Column
  integrationsEnabled: boolean;

  @Default(false)
  @Column
  internalUse: boolean;

  @Default(true)
  @Column
  isActive: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => Company)
  companies: Company[];
}

export default Plan;

