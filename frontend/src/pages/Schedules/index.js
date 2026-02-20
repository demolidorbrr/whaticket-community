import React, { useEffect, useReducer, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Button,
  Chip,
  IconButton,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell
} from "@material-ui/core";
import { DeleteOutline } from "@material-ui/icons";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import ConfirmationModal from "../../components/ConfirmationModal";
import api from "../../services/api";
import openSocket from "../../services/socket-io";
import toastError from "../../errors/toastError";

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

const statusChipColor = status => {
  if (status === "sent") return "primary";
  if (status === "failed") return "secondary";
  return "default";
};

const statusLabel = status => {
  if (status === "pending") return "Pendente";
  if (status === "sent") return "Enviado";
  if (status === "canceled") return "Cancelado";
  if (status === "failed") return "Falhou";
  return status;
};

const Schedules = () => {
  const [schedules, dispatch] = useReducer(reducer, []);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");

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
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <Paper variant="outlined" style={{ flex: 1, padding: 8, overflowY: "auto" }}>
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
            {schedules.map(schedule => (
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
                    color={statusChipColor(schedule.status)}
                    label={statusLabel(schedule.status)}
                  />
                </TableCell>
                <TableCell align="center">{schedule.user?.name || "-"}</TableCell>
                <TableCell align="center">
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

            {!schedules.length && (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  Nenhum agendamento encontrado.
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
