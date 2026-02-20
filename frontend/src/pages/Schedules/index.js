import React, { useEffect, useMemo, useReducer, useState } from "react";
import { useHistory } from "react-router-dom";
import {
  addMinutes,
  format,
  getDay,
  isSameDay,
  parse,
  parseISO,
  startOfWeek
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import {
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow
} from "@material-ui/core";
import { DeleteOutline, Search } from "@material-ui/icons";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import ConfirmationModal from "../../components/ConfirmationModal";
import api from "../../services/api";
import openSocket from "../../services/socket-io";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";

const reducer = (state, action) => {
  if (action.type === "LOAD") {
    return action.payload || [];
  }

  if (action.type === "UPSERT") {
    const index = state.findIndex(item => item.id === action.payload.id);
    if (index >= 0) {
      const next = [...state];
      next[index] = action.payload;
      return next;
    }

    return [action.payload, ...state];
  }

  if (action.type === "DELETE") {
    return state.filter(item => item.id !== action.payload);
  }

  return state;
};

const statusLabel = status => {
  if (status === "pending") return "Pendente";
  if (status === "sent") return "Enviado";
  if (status === "completed") return "Concluido";
  if (status === "canceled") return "Cancelado";
  if (status === "failed") return "Falhou";
  return status;
};

const statusColor = status => {
  if (status === "pending") return "#1a73e8";
  if (status === "sent") return "#1a73e8";
  if (status === "completed") return "#0b8043";
  if (status === "canceled") return "#d93025";
  if (status === "failed") return "#b31412";
  return "#1a73e8";
};

const parseDateWithFallback = value => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value !== "string") return new Date(value);

  const numericValue = Number(value);
  if (!Number.isNaN(numericValue) && Number.isFinite(numericValue)) {
    return new Date(numericValue);
  }

  try {
    const parsed = parseISO(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch (err) {
    // noop
  }

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return new Date(normalized);
};

const locales = {
  "pt-BR": ptBR
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: date => startOfWeek(date, { weekStartsOn: 0 }),
  getDay,
  locales
});

const Schedules = () => {
  const history = useHistory();
  const [schedules, dispatch] = useReducer(reducer, []);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchParam, setSearchParam] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());

  const loadSchedules = async () => {
    try {
      const { data } = await api.get("/schedules", {
        params: { status: statusFilter || undefined }
      });
      dispatch({ type: "LOAD", payload: data });
    } catch (err) {
      toastError(err);
    }
  };

  useEffect(() => {
    loadSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    const socket = openSocket();

    socket.on("schedule", data => {
      if (data.action === "delete") {
        dispatch({ type: "DELETE", payload: data.scheduleId });
        return;
      }

      if (data.action === "create" || data.action === "update") {
        dispatch({ type: "UPSERT", payload: data.schedule });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleCancelSchedule = async schedule => {
    try {
      await api.put(`/schedules/${schedule.id}`, { status: "canceled" });
    } catch (err) {
      toastError(err);
    }
  };

  const handleCompleteSchedule = async schedule => {
    try {
      await api.put(`/schedules/${schedule.id}`, { status: "completed" });
    } catch (err) {
      toastError(err);
    }
  };

  const handleDeleteSchedule = async () => {
    if (!selectedSchedule?.id) return;

    try {
      await api.delete(`/schedules/${selectedSchedule.id}`);
      setConfirmOpen(false);
      setSelectedSchedule(null);
    } catch (err) {
      toastError(err);
    }
  };

  const filteredSchedules = useMemo(() => {
    const term = searchParam.trim().toLowerCase();
    if (!term) return schedules;

    return schedules.filter(schedule => {
      const contactName = (schedule.contact?.name || "").toLowerCase();
      const body = (schedule.body || "").toLowerCase();
      const userName = (schedule.user?.name || "").toLowerCase();
      return (
        contactName.includes(term) ||
        body.includes(term) ||
        userName.includes(term)
      );
    });
  }, [schedules, searchParam]);

  const calendarEvents = useMemo(() => {
    return filteredSchedules
      .map(schedule => {
        const start = parseDateWithFallback(schedule.sendAt);
        if (!start || Number.isNaN(start.getTime())) {
          return null;
        }

        const end = addMinutes(start, 30);
        return {
          id: schedule.id,
          title: `${schedule.contact?.name || `Contato #${schedule.contactId}`} - ${(
            schedule.body || ""
          ).slice(0, 60)}`,
          start,
          end,
          allDay: false,
          resource: schedule
        };
      })
      .filter(Boolean);
  }, [filteredSchedules]);

  const daySchedules = useMemo(() => {
    return filteredSchedules
      .filter(schedule => {
        const sendAt = parseDateWithFallback(schedule.sendAt);
        return sendAt && !Number.isNaN(sendAt.getTime()) && isSameDay(sendAt, selectedDate);
      })
      .sort((a, b) => {
        const aTime = parseDateWithFallback(a.sendAt)?.getTime?.() || 0;
        const bTime = parseDateWithFallback(b.sendAt)?.getTime?.() || 0;
        return aTime - bTime;
      });
  }, [filteredSchedules, selectedDate]);

  const calendarMessages = useMemo(
    () => ({
      today: "Hoje",
      previous: "Anterior",
      next: "Proximo",
      month: "Mes",
      week: "Semana",
      day: "Dia",
      agenda: "Agenda",
      date: "Data",
      time: "Horario",
      event: "Agendamento",
      noEventsInRange: "Nenhum agendamento neste periodo."
    }),
    []
  );

  const handleSelectEvent = event => {
    const ticketId = event?.resource?.ticketId;
    if (!ticketId) return;
    history.push(`/tickets/${ticketId}`);
  };

  const handleCreateFromPage = () => {
    toast.info("Para novo agendamento, abra um atendimento e use menu > Agendar.");
    history.push("/tickets");
  };

  return (
    <MainContainer>
      <ConfirmationModal
        title={
          selectedSchedule
            ? `Excluir agendamento #${selectedSchedule.id}?`
            : "Excluir agendamento?"
        }
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDeleteSchedule}
      >
        Esta acao nao pode ser desfeita.
      </ConfirmationModal>

      <MainHeader>
        <Title>Agendamentos</Title>
        <MainHeaderButtonsWrapper>
          <TextField
            size="small"
            variant="outlined"
            placeholder="Pesquisar"
            value={searchParam}
            onChange={event => setSearchParam(event.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              )
            }}
          />
          <Button
            variant={statusFilter === "" ? "contained" : "outlined"}
            color="primary"
            size="small"
            onClick={() => setStatusFilter("")}
          >
            Todos
          </Button>
          <Button
            variant={statusFilter === "pending" ? "contained" : "outlined"}
            color="primary"
            size="small"
            onClick={() => setStatusFilter("pending")}
          >
            Pendentes
          </Button>
          <Button
            variant={statusFilter === "sent" ? "contained" : "outlined"}
            color="primary"
            size="small"
            onClick={() => setStatusFilter("sent")}
          >
            Enviados
          </Button>
          <Button
            variant={statusFilter === "completed" ? "contained" : "outlined"}
            color="primary"
            size="small"
            onClick={() => setStatusFilter("completed")}
          >
            Concluidos
          </Button>
          <Button variant="contained" color="primary" onClick={handleCreateFromPage}>
            Novo Agendamento
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <Paper
        variant="outlined"
        style={{ height: 520, padding: 12, marginBottom: 12, overflow: "hidden" }}
      >
        <Calendar
          localizer={localizer}
          events={calendarEvents}
          startAccessor="start"
          endAccessor="end"
          messages={calendarMessages}
          culture="pt-BR"
          selectable
          popup
          onSelectEvent={handleSelectEvent}
          onSelectSlot={slotInfo => setSelectedDate(slotInfo.start)}
          onNavigate={date => setSelectedDate(date)}
          eventPropGetter={event => ({
            style: {
              backgroundColor: statusColor(event.resource?.status),
              borderRadius: 6,
              border: "none",
              fontSize: 12,
              fontWeight: 600
            }
          })}
        />
      </Paper>

      <Paper variant="outlined" style={{ flex: 1, padding: 8, overflowY: "auto" }}>
        <div style={{ marginBottom: 8, fontWeight: 600, color: "#3f51b5" }}>
          Agendamentos de {format(selectedDate, "dd/MM/yyyy")}
        </div>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Contato</TableCell>
              <TableCell>Mensagem</TableCell>
              <TableCell align="center">Agendado para</TableCell>
              <TableCell align="center">Status</TableCell>
              <TableCell align="center">Criado por</TableCell>
              <TableCell align="center">Acoes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {daySchedules.map(schedule => (
              <TableRow key={schedule.id}>
                <TableCell>
                  {schedule.contact?.name || `Contato #${schedule.contactId}`}
                </TableCell>
                <TableCell style={{ maxWidth: 420 }}>
                  <div
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}
                  >
                    {schedule.body}
                  </div>
                </TableCell>
                <TableCell align="center">
                  {schedule.sendAt
                    ? format(parseISO(schedule.sendAt), "dd/MM/yyyy HH:mm")
                    : "-"}
                </TableCell>
                <TableCell align="center">
                  <Chip
                    size="small"
                    label={statusLabel(schedule.status)}
                    style={{
                      backgroundColor: statusColor(schedule.status),
                      color: "#fff",
                      fontWeight: 600
                    }}
                  />
                </TableCell>
                <TableCell align="center">{schedule.user?.name || "-"}</TableCell>
                <TableCell align="center">
                  {(schedule.status === "pending" || schedule.status === "sent") && (
                    <Button
                      size="small"
                      color="primary"
                      variant="outlined"
                      onClick={() => handleCompleteSchedule(schedule)}
                      style={{ marginRight: 8 }}
                    >
                      Concluir
                    </Button>
                  )}
                  {schedule.status === "pending" && (
                    <Button
                      size="small"
                      color="primary"
                      variant="outlined"
                      onClick={() => handleCancelSchedule(schedule)}
                    >
                      Cancelar
                    </Button>
                  )}
                  <IconButton
                    size="small"
                    onClick={() => {
                      setSelectedSchedule(schedule);
                      setConfirmOpen(true);
                    }}
                  >
                    <DeleteOutline />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}

            {!daySchedules.length && (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  Nenhum agendamento para este dia.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </MainContainer>
  );
};

export default Schedules;
