import React, { useEffect, useMemo, useState } from "react";

import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import FormControl from "@material-ui/core/FormControl";
import TextField from "@material-ui/core/TextField";
import { makeStyles } from "@material-ui/core/styles";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import ButtonWithSpinner from "../ButtonWithSpinner";

const useStyles = makeStyles(() => ({
  maxWidth: {
    width: "100%"
  }
}));

const toInputDateTimeValue = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const ScheduleTicketModal = ({ modalOpen, onClose, ticket }) => {
  const classes = useStyles();
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState("");
  const [sendAt, setSendAt] = useState("");

  const initialDateTime = useMemo(() => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + 15);
    return toInputDateTimeValue(date);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    setBody("");
    setSendAt(initialDateTime);
  }, [modalOpen, initialDateTime]);

  const handleSave = async event => {
    event.preventDefault();
    if (!ticket?.id) return;

    setLoading(true);
    try {
      await api.post("/schedules", {
        ticketId: ticket.id,
        body: body.trim(),
        sendAt: new Date(sendAt).toISOString()
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
        <DialogTitle>Agendar mensagem</DialogTitle>
        <DialogContent dividers>
          <FormControl className={classes.maxWidth} style={{ marginBottom: 16 }}>
            <TextField
              variant="outlined"
              label="Data e hora"
              type="datetime-local"
              value={sendAt}
              onChange={event => setSendAt(event.target.value)}
              required
              InputLabelProps={{
                shrink: true
              }}
            />
          </FormControl>
          <FormControl className={classes.maxWidth}>
            <TextField
              variant="outlined"
              label="Mensagem"
              value={body}
              onChange={event => setBody(event.target.value)}
              multiline
              minRows={4}
              required
            />
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
            Agendar
          </ButtonWithSpinner>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ScheduleTicketModal;
