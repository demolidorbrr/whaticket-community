import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Chip,
  makeStyles
} from "@material-ui/core";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles(theme => ({
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(0.75),
    marginTop: theme.spacing(1)
  }
}));

const TicketAutomationModal = ({ open, onClose, ticket }) => {
  const classes = useStyles();
  const [allTags, setAllTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [leadScore, setLeadScore] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !ticket?.id) return;

    const load = async () => {
      try {
        const [{ data: tagsData }, { data: ticketData }] = await Promise.all([
          api.get("/tags"),
          api.get(`/tickets/${ticket.id}`)
        ]);

        setAllTags(tagsData || []);
        setSelectedTagIds(
          Array.isArray(ticketData?.tags) ? ticketData.tags.map(tag => tag.id) : []
        );
        setLeadScore(Number(ticketData?.leadScore || 0));
      } catch (err) {
        toastError(err);
      }
    };

    load();
  }, [open, ticket?.id]);

  const selectedTags = useMemo(
    () => allTags.filter(tag => selectedTagIds.includes(tag.id)),
    [allTags, selectedTagIds]
  );

  const handleSave = async () => {
    if (!ticket?.id) return;

    setSaving(true);
    try {
      await api.put(`/tickets/${ticket.id}`, {
        leadScore: Number(leadScore || 0),
        tagIds: selectedTagIds,
        source: "manual_ticket_automation"
      });
      toast.success("Tags e score atualizados");
      onClose(true);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => onClose(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Tags e Score do Atendimento</DialogTitle>
      <DialogContent dividers>
        <TextField
          select
          fullWidth
          label="Tags"
          variant="outlined"
          margin="dense"
          SelectProps={{
            multiple: true,
            value: selectedTagIds,
            onChange: e => setSelectedTagIds(e.target.value)
          }}
        >
          {allTags.map(tag => (
            <MenuItem key={tag.id} value={tag.id}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 99,
                  backgroundColor: tag.color || "#546e7a",
                  marginRight: 8
                }}
              />
              {tag.name}
            </MenuItem>
          ))}
        </TextField>

        <div className={classes.chips}>
          {selectedTags.map(tag => (
            <Chip
              key={tag.id}
              size="small"
              label={tag.name}
              style={{
                backgroundColor: tag.color || undefined,
                color: tag.color ? "#fff" : undefined
              }}
            />
          ))}
        </div>

        <TextField
          fullWidth
          type="number"
          label="Lead Score"
          variant="outlined"
          margin="dense"
          value={leadScore}
          onChange={e => setLeadScore(e.target.value)}
          inputProps={{ min: 0, max: 100 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)} color="secondary" variant="outlined">
          Cancelar
        </Button>
        <Button
          onClick={handleSave}
          color="primary"
          variant="contained"
          disabled={saving}
        >
          Salvar
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TicketAutomationModal;
