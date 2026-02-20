import React, { useEffect, useReducer, useState } from "react";
import {
  Button,
  IconButton,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell
} from "@material-ui/core";
import { DeleteOutline, Edit } from "@material-ui/icons";
import { toast } from "react-toastify";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import ConfirmationModal from "../../components/ConfirmationModal";
import TagModal from "../../components/TagModal";
import api from "../../services/api";
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

const Tags = () => {
  const [tags, dispatch] = useReducer(reducer, []);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadTags = async () => {
    try {
      const { data } = await api.get("/tags");
      dispatch({ type: "LOAD", payload: data });
    } catch (err) {
      toastError(err);
    }
  };

  useEffect(() => {
    loadTags();
  }, []);

  const handleCloseModal = refreshed => {
    setTagModalOpen(false);
    setSelectedTag(null);
    if (refreshed) {
      loadTags();
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/tags/${selectedTag.id}`);
      toast.success("Tag removida");
      dispatch({ type: "DELETE", payload: selectedTag.id });
    } catch (err) {
      toastError(err);
    } finally {
      setConfirmOpen(false);
      setSelectedTag(null);
    }
  };

  return (
    <MainContainer>
      <ConfirmationModal
        title={selectedTag ? `Excluir tag ${selectedTag.name}?` : "Excluir tag?"}
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
      >
        Esta acao nao pode ser desfeita.
      </ConfirmationModal>

      <TagModal
        open={tagModalOpen}
        onClose={handleCloseModal}
        tagId={selectedTag?.id}
      />

      <MainHeader>
        <Title>Tags</Title>
        <MainHeaderButtonsWrapper>
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              setSelectedTag(null);
              setTagModalOpen(true);
            }}
          >
            Nova Tag
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <Paper variant="outlined" style={{ flex: 1, padding: 8, overflowY: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell align="center">Cor</TableCell>
              <TableCell align="center">Acoes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tags.map(tag => (
              <TableRow key={tag.id}>
                <TableCell>{tag.name}</TableCell>
                <TableCell align="center">
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        backgroundColor: tag.color || "#546e7a",
                        border: "1px solid #d1d5db"
                      }}
                    />
                    {tag.color || "#546e7a"}
                  </div>
                </TableCell>
                <TableCell align="center">
                  <IconButton
                    size="small"
                    onClick={() => {
                      setSelectedTag(tag);
                      setTagModalOpen(true);
                    }}
                  >
                    <Edit />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => {
                      setSelectedTag(tag);
                      setConfirmOpen(true);
                    }}
                  >
                    <DeleteOutline />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!tags.length && (
              <TableRow>
                <TableCell colSpan={3} align="center">
                  Nenhuma tag cadastrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </MainContainer>
  );
};

export default Tags;
