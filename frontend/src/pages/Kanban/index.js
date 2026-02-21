import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  Button,
  FormControlLabel,
  Paper,
  Switch,
  makeStyles
} from "@material-ui/core";
import { toast } from "react-toastify";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import NewTicketModal from "../../components/NewTicketModal";
import QueueModal from "../../components/QueueModal";
import ConfirmationModal from "../../components/ConfirmationModal";
import TicketsQueueSelect from "../../components/TicketsQueueSelect";
import TicketsKanban from "../../components/TicketsKanban";
import { AuthContext } from "../../context/Auth/AuthContext";
import api from "../../services/api";
import openSocket from "../../services/socket-io";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => ({
  controls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
    padding: theme.spacing(1)
  },
  boardWrapper: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    border: `1px solid ${theme.palette.divider}`
  }
}));

const Kanban = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const profile = user.profile?.toUpperCase();
  const canManageBoard = profile === "ADMIN" || profile === "SUPERADMIN";
  const userQueueIds = useMemo(
    () => (user?.queues || []).map(queue => queue.id),
    [user?.queues]
  );

  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [selectedQueue, setSelectedQueue] = useState(null);
  const [showAllTickets, setShowAllTickets] = useState(false);
  const [availableQueues, setAvailableQueues] = useState(user?.queues || []);
  const [selectedQueueIds, setSelectedQueueIds] = useState([]);

  useEffect(() => {
    // Mantem o estado inicial alinhado com o perfil apos o user carregar no contexto.
    if (canManageBoard) {
      setShowAllTickets(true);
      setSelectedQueueIds([]);
      return;
    }

    setShowAllTickets(false);
    setSelectedQueueIds(userQueueIds);
  }, [canManageBoard, userQueueIds]);

  useEffect(() => {
    if (!canManageBoard) {
      setAvailableQueues(user?.queues || []);
      return;
    }

    const loadQueues = async () => {
      try {
        const { data } = await api.get("/queue");
        setAvailableQueues(data || []);
      } catch (err) {
        toastError(err);
      }
    };

    loadQueues();
  }, [canManageBoard, user?.queues]);

  useEffect(() => {
    const socket = openSocket();

    socket.on("queue", data => {
      if (data.action === "delete") {
        setAvailableQueues(prev => prev.filter(queue => queue.id !== data.queueId));
        setSelectedQueueIds(prev => prev.filter(id => id !== data.queueId));
        return;
      }

      if (data.action === "update" || data.action === "create") {
        setAvailableQueues(prev => {
          const queueIndex = prev.findIndex(queue => queue.id === data.queue.id);
          if (queueIndex >= 0) {
            const next = [...prev];
            next[queueIndex] = data.queue;
            return next;
          }
          return [data.queue, ...prev];
        });
      }
    });

    return () => socket.disconnect();
  }, []);

  const handleOpenQueueModal = () => {
    setSelectedQueue(null);
    setQueueModalOpen(true);
  };

  const handleCloseQueueModal = () => {
    setQueueModalOpen(false);
    setSelectedQueue(null);
  };

  const handleEditQueue = queue => {
    if (!queue?.id) {
      return;
    }
    setSelectedQueue(queue);
    setQueueModalOpen(true);
  };

  const handleAskDeleteQueue = queue => {
    if (!queue?.id) {
      return;
    }
    setSelectedQueue(queue);
    setConfirmModalOpen(true);
  };

  const handleCloseConfirmationModal = () => {
    setConfirmModalOpen(false);
    setSelectedQueue(null);
  };

  const handleDeleteQueue = async queueId => {
    try {
      await api.delete(`/queue/${queueId}`);
      toast.success("Lista excluida com sucesso");
    } catch (err) {
      toastError(err);
    } finally {
      setSelectedQueue(null);
    }
  };

  return (
    <MainContainer>
      <ConfirmationModal
        title={
          selectedQueue
            ? `Excluir lista ${selectedQueue.name}?`
            : "Excluir lista?"
        }
        open={confirmModalOpen}
        onClose={handleCloseConfirmationModal}
        onConfirm={() => selectedQueue && handleDeleteQueue(selectedQueue.id)}
      >
        Essa acao remove a lista e os tickets ficam sem fila.
      </ConfirmationModal>

      <QueueModal
        open={queueModalOpen}
        onClose={handleCloseQueueModal}
        queueId={selectedQueue?.id}
      />

      <NewTicketModal
        modalOpen={newTicketModalOpen}
        onClose={() => setNewTicketModalOpen(false)}
      />

      <MainHeader>
        <Title>Kanban</Title>
        <MainHeaderButtonsWrapper>
          {canManageBoard ? (
            <Button
              variant="outlined"
              color="primary"
              onClick={handleOpenQueueModal}
            >
              Nova lista
            </Button>
          ) : null}
          <Button
            variant="contained"
            color="primary"
            onClick={() => setNewTicketModalOpen(true)}
          >
            {i18n.t("ticketsManager.buttons.newTicket")}
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <Paper className={classes.controls} variant="outlined">
        {canManageBoard ? (
          <FormControlLabel
            label={i18n.t("tickets.buttons.showAll")}
            labelPlacement="start"
            control={
              <Switch
                size="small"
                checked={showAllTickets}
                onChange={() => setShowAllTickets(prev => !prev)}
                name="showAllTickets"
                color="primary"
              />
            }
          />
        ) : (
          <div />
        )}

        <TicketsQueueSelect
          selectedQueueIds={selectedQueueIds}
          userQueues={availableQueues}
          onChange={values => setSelectedQueueIds(values)}
        />
      </Paper>

      <Paper className={classes.boardWrapper}>
        <TicketsKanban
          mode="pipeline"
          queues={availableQueues}
          showAll={showAllTickets}
          selectedQueueIds={selectedQueueIds}
          canManageQueues={canManageBoard}
          onEditQueue={handleEditQueue}
          onDeleteQueue={handleAskDeleteQueue}
        />
      </Paper>
    </MainContainer>
  );
};

export default Kanban;
