import { Sequelize } from "sequelize-typescript";
import Company from "../models/Company";
import Plan from "../models/Plan";
import User from "../models/User";
import Setting from "../models/Setting";
import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import ContactCustomField from "../models/ContactCustomField";
import Message from "../models/Message";
import Queue from "../models/Queue";
import WhatsappQueue from "../models/WhatsappQueue";
import UserQueue from "../models/UserQueue";
import QuickAnswer from "../models/QuickAnswer";
import WppKey from "../models/WppKey";
import Tag from "../models/Tag";
import TicketTag from "../models/TicketTag";
import TicketEvent from "../models/TicketEvent";
import Schedule from "../models/Schedule";
import { registerTenantHooks } from "../libs/tenantHooks";

// eslint-disable-next-line
const dbConfig = require("../config/database");

const sequelize = new Sequelize(dbConfig);

const models = [
  Company,
  Plan,
  User,
  Contact,
  Ticket,
  Message,
  Whatsapp,
  ContactCustomField,
  Setting,
  Queue,
  WhatsappQueue,
  UserQueue,
  QuickAnswer,
  WppKey,
  Tag,
  TicketTag,
  TicketEvent,
  Schedule
];

sequelize.addModels(models);
registerTenantHooks(models as any);

export default sequelize;