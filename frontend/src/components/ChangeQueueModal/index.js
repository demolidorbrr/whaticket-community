import React, { useContext, useEffect, useMemo, useState } from "react";

import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import FormControl from "@material-ui/core/FormControl";
import InputLabel from "@material-ui/core/InputLabel";
import MenuItem from "@material-ui/core/MenuItem";
import Select from "@material-ui/core/Select";
import { makeStyles } from "@material-ui/core/styles";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import ButtonWithSpinner from "../ButtonWithSpinner";

const useStyles = makeStyles(() => ({
  maxWidth: {
    width: "100%"
  }
}));

const ChangeQueueModal = ({ modalOpen, onClose, ticket }) => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  // Superadmin deve ter o mesmo comportamento administrativo ao listar filas.
  const isAdminLike = ["admin", "superadmin"].includes(
    (user?.profile || "").toLowerCase()
  );
  const [loading, setLoading] = useState(false);
  const [queues, setQueues] = useState([]);
  const [selectedQueue, setSelectedQueue] = useState("");

  useEffect(() => {
    if (!modalOpen) return;

    setSelectedQueue(ticket?.queueId || "");

    const loadQueues = async () => {
      try {
        if (isAdminLike) {
          const { data } = await api.get("/queue");
          setQueues(Array.isArray(data) ? data : []);
          return;
        }

        setQueues(Array.isArray(user?.queues) ? user.queues : []);
      } catch (err) {
        toastError(err);
      }
    };

    loadQueues();
  }, [isAdminLike, modalOpen, ticket?.queueId, user?.queues]);

  const queueOptions = useMemo(() => {
    const list = Array.isArray(queues) ? [...queues] : [];

    if (ticket?.queue?.id && !list.some(queue => queue.id === ticket.queue.id)) {
      list.push(ticket.queue);
    }

    return list.sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
    );
  }, [queues, ticket?.queue]);

  const handleSave = async event => {
    event.preventDefault();
    if (!ticket?.id) return;

    setLoading(true);
    try {
      await api.put(`/tickets/${ticket.id}`, {
        queueId: selectedQueue === "" ? null : selectedQueue
      });

      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={modalOpen} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <form onSubmit={handleSave}>
        <DialogTitle>Alterar fila</DialogTitle>
        <DialogContent dividers>
          <FormControl variant="outlined" className={classes.maxWidth}>
            <InputLabel>Fila</InputLabel>
            <Select
              value={selectedQueue}
              onChange={e => setSelectedQueue(e.target.value)}
              label="Fila"
            >
              <MenuItem value="">Sem fila</MenuItem>
              {queueOptions.map(queue => (
                <MenuItem key={queue.id} value={queue.id}>
                  {queue.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={onClose}
            color="secondary"
            disabled={loading}
            variant="outlined"
          >
            Cancelar
          </Button>
          <ButtonWithSpinner
            variant="contained"
            type="submit"
            color="primary"
            loading={loading}
          >
            Salvar
          </ButtonWithSpinner>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ChangeQueueModal;
