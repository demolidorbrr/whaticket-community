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

const normalizeTagId = value => {
  if (value === undefined || value === null) return undefined;

  if (typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "id")) {
      return normalizeTagId(value.id);
    }
    if (Object.prototype.hasOwnProperty.call(value, "value")) {
      return normalizeTagId(value.value);
    }
    if (Object.prototype.hasOwnProperty.call(value, "name")) {
      return normalizeTagId(value.name);
    }
    return undefined;
  }

  const normalized = String(value).trim();
  if (!normalized) return undefined;

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  return normalized;
};

const normalizeTagOption = tag => {
  if (!tag) return null;

  if (typeof tag === "string" || typeof tag === "number") {
    const id = normalizeTagId(tag);
    if (id === undefined) return null;
    return {
      id,
      name: String(tag),
      color: "#546e7a"
    };
  }

  if (typeof tag === "object") {
    const id = normalizeTagId(tag.id ?? tag.name ?? tag.value);
    if (id === undefined) return null;
    return {
      id,
      name: tag.name || String(id),
      color: tag.color || "#546e7a"
    };
  }

  return null;
};

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

        const normalizedTags = (Array.isArray(tagsData) ? tagsData : [])
          .map(normalizeTagOption)
          .filter(Boolean);

        setAllTags(normalizedTags);

        const ticketTagIds = (Array.isArray(ticketData?.tags) ? ticketData.tags : [])
          .map(tag => {
            const normalizedTag = normalizeTagOption(tag);
            if (!normalizedTag) return undefined;

            const foundById = normalizedTags.find(
              option => String(option.id) === String(normalizedTag.id)
            );
            if (foundById) return foundById.id;

            const foundByName = normalizedTags.find(
              option =>
                option.name &&
                normalizedTag.name &&
                option.name.toLowerCase() === normalizedTag.name.toLowerCase()
            );
            return foundByName?.id;
          })
          .filter(id => id !== undefined);

        setSelectedTagIds([...new Set(ticketTagIds)]);
        setLeadScore(Number(ticketData?.leadScore || 0));
      } catch (err) {
        toastError(err);
      }
    };

    load();
  }, [open, ticket?.id]);

  const selectedTags = useMemo(
    () =>
      allTags.filter(tag =>
        selectedTagIds.some(selectedId => String(selectedId) === String(tag.id))
      ),
    [allTags, selectedTagIds]
  );

  const handleSave = async () => {
    if (!ticket?.id) return;

    setSaving(true);
    try {
      await api.put(`/tickets/${ticket.id}`, {
        leadScore: Number(leadScore || 0),
        tagIds: selectedTagIds
          .map(tagId => Number(tagId))
          .filter(tagId => Number.isFinite(tagId)),
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
            renderValue: selected => {
              const selectedValues = Array.isArray(selected) ? selected : [];
              return selectedValues
                .map(item => {
                  const tag = allTags.find(option => String(option.id) === String(item));
                  if (tag?.name) return tag.name;
                  if (typeof item === "object") {
                    return item.name || item.id || "";
                  }
                  return String(item || "");
                })
                .filter(Boolean)
                .join(", ");
            },
            onChange: e => {
              const values = Array.isArray(e.target.value) ? e.target.value : [];
              const normalizedValues = values
                .map(normalizeTagId)
                .filter(value => value !== undefined);
              setSelectedTagIds([...new Set(normalizedValues)]);
            }
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
